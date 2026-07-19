/**
 * CRUD de widgets de dashboard creados desde la UI (sin plugin/código), por
 * un admin del tenant. Reutiliza el mismo patrón que `customFields.ts`
 * (tabla en el schema `public`, acotada por `tenantId`), pero en vez de
 * dejar que el usuario escriba una query, solo puede elegir una métrica del
 * catálogo curado `DASHBOARD_METRICS` — así no se abre una vía de consulta
 * arbitraria a la BD desde un formulario pensado para no-técnicos.
 */
import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import crypto from 'crypto';
import { ClientFactory } from '../core/tenant/ClientFactory';
import * as schema from '../db/schema';
import { DASHBOARD_METRICS, getMetric } from '../core/dashboard/DashboardMetrics';
import { transpileSource } from '../plugins/transpiler';
import {
  queryConfigSchema,
  resolveQueryWidget,
  validateWidgetQuery,
} from '../core/ai/declarativeWidget';

const router = Router();

const SIZES = new Set(['sm', 'md', 'lg', 'full']);
const KINDS = new Set(['metric', 'code', 'query']);

function requireAdmin(req: any, res: any, next: any) {
  const role = req.user?.role;
  if (role !== 'ADMIN' && role !== 'SUPERUSER') {
    return res.status(403).json({ error: 'Requiere ADMIN o SUPERUSER.' });
  }
  next();
}

async function ensureTenant(req: any) {
  const db = ClientFactory.getClient('public');
  const tenantId = req.tenantId;
  if (!tenantId) throw new Error('Falta tenant.');
  const [tenantRow] = await db
    .select({ schemaName: schema.tenants.schemaName })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId));
  if (!tenantRow) throw new Error('Tenant no encontrado.');
  return { db, tenantId, tenantSchema: tenantRow.schemaName };
}

// ── GET /metrics — catálogo de métricas disponibles (para el selector) ──
router.get('/metrics', (_req, res) => {
  res.json(DASHBOARD_METRICS.map((m) => ({ key: m.key, label: m.label })));
});

// ── GET / — widgets del tenant. Los de tipo 'metric' traen el valor ya
//     resuelto; los de tipo 'code' NO incluyen el código fuente (se carga
//     aparte via /:id/component.js) para no inflar la lista con texto largo.
router.get('/', async (req: any, res) => {
  try {
    const { db, tenantId, tenantSchema } = await ensureTenant(req);
    const rows = await db
      .select({
        id: schema.userDashboardWidgets.id,
        tenantId: schema.userDashboardWidgets.tenantId,
        title: schema.userDashboardWidgets.title,
        subtitle: schema.userDashboardWidgets.subtitle,
        kind: schema.userDashboardWidgets.kind,
        metricKey: schema.userDashboardWidgets.metricKey,
        queryConfig: schema.userDashboardWidgets.queryConfig,
        size: schema.userDashboardWidgets.size,
        displayOrder: schema.userDashboardWidgets.displayOrder,
      })
      .from(schema.userDashboardWidgets)
      .where(eq(schema.userDashboardWidgets.tenantId, tenantId));

    const tenantDb = req.tenantClient;
    const withValues = await Promise.all(
      rows.map(async (w: any) => {
        if (w.kind === 'code') {
          return { ...w, value: null, metricLabel: null };
        }
        if (w.kind === 'query') {
          // Sin tenantDb (sin tenant resuelto) no hay forma de ejecutar la query.
          if (!tenantDb || !w.queryConfig) {
            return { ...w, queryResult: { error: 'No se pudo resolver el tenant' } };
          }
          const queryResult = await resolveQueryWidget(
            { tenantClient: tenantDb, tenantId, tenantSchema, user: { id: req.user?.id || '' } },
            w.queryConfig,
          );
          return { ...w, queryResult };
        }
        const metric = getMetric(w.metricKey);
        let value: number | null = null;
        if (metric && tenantDb) {
          try {
            value = await metric.compute(tenantDb);
          } catch {
            value = null;
          }
        }
        return { ...w, value, metricLabel: metric?.label || w.metricKey };
      }),
    );
    res.json(withValues.sort((a, b) => a.displayOrder - b.displayOrder));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /:id/component.js — transpila y sirve el componente de un widget
//     tipo 'code'. Cualquier usuario autenticado del tenant puede cargarlo
//     (es solo lectura/render), igual que /api/plugins/load/*.
//     Se sirve vía `import()` dinámico del navegador, que no puede adjuntar
//     headers (Authorization / x-tenant-id) — por eso aceptamos el tenant
//     también como query param, igual que el UUID del widget en la propia URL.
router.get('/:id/component.js', async (req: any, res) => {
  try {
    if (!req.tenantId && req.query.tenantId) req.tenantId = String(req.query.tenantId);
    const { db, tenantId } = await ensureTenant(req);
    const { id } = req.params;
    const [row] = await db
      .select()
      .from(schema.userDashboardWidgets)
      .where(
        and(
          eq(schema.userDashboardWidgets.id, id),
          eq(schema.userDashboardWidgets.tenantId, tenantId),
        ),
      );
    if (!row || row.kind !== 'code' || !row.sourceCode) {
      return res.status(404).json({ error: 'Widget de código no encontrado.' });
    }
    const compiled = await transpileSource(row.sourceCode, `${req.protocol}://${req.get('host')}`);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    // Nunca cachear — el código fuente puede editarse en cualquier momento
    // desde Ajustes → Widgets de dashboard.
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.send(compiled);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// A partir de aquí, solo ADMIN/SUPERUSER puede crear/editar/borrar/leer código fuente.
router.use(requireAdmin);

// ── GET /:id — fila completa (incluye sourceCode) para editar ──
router.get('/:id', async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    const { id } = req.params;
    const [row] = await db
      .select()
      .from(schema.userDashboardWidgets)
      .where(
        and(
          eq(schema.userDashboardWidgets.id, id),
          eq(schema.userDashboardWidgets.tenantId, tenantId),
        ),
      );
    if (!row) return res.status(404).json({ error: 'Widget no encontrado.' });
    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /test-compile — valida que un código TSX compile, sin guardarlo ──
router.post('/test-compile', async (req: any, res) => {
  try {
    const { code } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ ok: false, error: 'Falta "code".' });
    }
    await transpileSource(code);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(200).json({ ok: false, error: err.message });
  }
});

// ── POST / — crear ──
router.post('/', async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    const { title, subtitle, kind, metricKey, sourceCode, queryConfig, size, displayOrder } =
      req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'El título es obligatorio.' });
    }
    const resolvedKind = KINDS.has(kind) ? kind : 'metric';

    if (resolvedKind === 'metric') {
      if (!getMetric(metricKey)) {
        return res.status(400).json({ error: `Métrica no válida: ${metricKey}` });
      }
    } else if (resolvedKind === 'code') {
      if (!sourceCode || !String(sourceCode).trim()) {
        return res.status(400).json({ error: 'El código del componente es obligatorio.' });
      }
      try {
        await transpileSource(sourceCode);
      } catch (err: any) {
        return res.status(400).json({ error: `El código no compila: ${err.message}` });
      }
    } else {
      const parsed = queryConfigSchema.safeParse(queryConfig);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Configuración de consulta inválida.' });
      }
      const invalid = validateWidgetQuery(parsed.data.sql);
      if (invalid) return res.status(400).json({ error: invalid });
    }

    const id = crypto.randomUUID();
    await db.insert(schema.userDashboardWidgets).values({
      id,
      tenantId,
      title: String(title).trim(),
      subtitle: subtitle ? String(subtitle).trim() : null,
      kind: resolvedKind,
      metricKey: resolvedKind === 'metric' ? metricKey : null,
      sourceCode: resolvedKind === 'code' ? sourceCode : null,
      queryConfig: resolvedKind === 'query' ? queryConfig : null,
      size: SIZES.has(size) ? size : 'md',
      displayOrder: Number.isFinite(displayOrder) ? Number(displayOrder) : 100,
      createdBy: req.user?.id || null,
    });
    res.json({ id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /:id — editar ──
router.patch('/:id', async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    const { id } = req.params;
    const [existing] = await db
      .select()
      .from(schema.userDashboardWidgets)
      .where(
        and(
          eq(schema.userDashboardWidgets.id, id),
          eq(schema.userDashboardWidgets.tenantId, tenantId),
        ),
      );
    if (!existing) return res.status(404).json({ error: 'Widget no encontrado.' });

    const { title, subtitle, kind, metricKey, sourceCode, queryConfig, size, displayOrder } =
      req.body || {};
    const resolvedKind = KINDS.has(kind) ? kind : existing.kind;

    if (resolvedKind === 'metric') {
      const nextMetricKey = metricKey !== undefined ? metricKey : existing.metricKey;
      if (!getMetric(nextMetricKey)) {
        return res.status(400).json({ error: `Métrica no válida: ${nextMetricKey}` });
      }
    } else if (resolvedKind === 'code') {
      const nextSource = sourceCode !== undefined ? sourceCode : existing.sourceCode;
      if (!nextSource || !String(nextSource).trim()) {
        return res.status(400).json({ error: 'El código del componente es obligatorio.' });
      }
      if (sourceCode !== undefined) {
        try {
          await transpileSource(sourceCode);
        } catch (err: any) {
          return res.status(400).json({ error: `El código no compila: ${err.message}` });
        }
      }
    } else {
      const nextConfig = queryConfig !== undefined ? queryConfig : existing.queryConfig;
      const parsed = queryConfigSchema.safeParse(nextConfig);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Configuración de consulta inválida.' });
      }
      if (queryConfig !== undefined) {
        const invalid = validateWidgetQuery(parsed.data.sql);
        if (invalid) return res.status(400).json({ error: invalid });
      }
    }

    const patch: Record<string, any> = { updatedAt: new Date() };
    if (title !== undefined) patch.title = String(title).trim();
    if (subtitle !== undefined) patch.subtitle = subtitle ? String(subtitle).trim() : null;
    if (kind !== undefined) patch.kind = resolvedKind;
    if (resolvedKind === 'metric') {
      if (metricKey !== undefined) patch.metricKey = metricKey;
      // Cambió desde otro kind: limpiamos los campos de los otros dos.
      if (kind !== undefined) {
        patch.sourceCode = null;
        patch.queryConfig = null;
      }
    } else if (resolvedKind === 'code') {
      if (sourceCode !== undefined) patch.sourceCode = sourceCode;
      if (kind !== undefined) {
        patch.metricKey = null;
        patch.queryConfig = null;
      }
    } else {
      if (queryConfig !== undefined) patch.queryConfig = queryConfig;
      if (kind !== undefined) {
        patch.metricKey = null;
        patch.sourceCode = null;
      }
    }
    if (size !== undefined) patch.size = SIZES.has(size) ? size : 'md';
    if (displayOrder !== undefined) patch.displayOrder = Number(displayOrder) || 0;

    await db
      .update(schema.userDashboardWidgets)
      .set(patch)
      .where(eq(schema.userDashboardWidgets.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /:id ──
router.delete('/:id', async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    const { id } = req.params;
    const [existing] = await db
      .select()
      .from(schema.userDashboardWidgets)
      .where(
        and(
          eq(schema.userDashboardWidgets.id, id),
          eq(schema.userDashboardWidgets.tenantId, tenantId),
        ),
      );
    if (!existing) return res.status(404).json({ error: 'Widget no encontrado.' });

    await db.delete(schema.userDashboardWidgets).where(eq(schema.userDashboardWidgets.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
