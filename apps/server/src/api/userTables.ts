/**
 * CRUD de tablas de usuario (entidades nuevas creadas desde la UI).
 *
 * Una tabla de usuario:
 *   • Tiene una fila en `public.PluginTable` con `pluginId='__user__'` y `tenantId=<tenant>`.
 *   • Tiene una tabla física `<schema>.pt_<name>` creada via ALTER.
 *   • Sus columnas son `PluginField` con `tableName='pt_<name>'`, `pluginId='__user__'`.
 *
 * Endpoints:
 *   GET    /                 · lista tablas del tenant
 *   POST   /                 · crea una nueva (tabla física + metadatos)
 *   GET    /menu             · lista para inyectar en el menú frontend
 *   GET    /:name            · metadata + fields
 *   PATCH  /:name            · actualiza metadatos (label, kind, icon...)
 *   DELETE /:name            · DROP TABLE + borra metadata + borra fields
 *   GET    /:name/rows       · lista filas
 *   POST   /:name/rows       · inserta fila (valida via PluginFieldManager)
 *   PATCH  /:name/rows/:id   · actualiza fila
 *   DELETE /:name/rows/:id   · borra fila
 */
import { Router } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { ClientFactory } from '../core/tenant/ClientFactory';
import * as schema from '../db/schema';
import { PluginFieldManager } from '../core/plugins/PluginFieldManager';
import { logAudit } from '../utils/audit';

const router = Router();

const USER_PLUGIN_ID = '__user__';

function requireAdmin(req: any, res: any, next: any) {
  const role = req.user?.role;
  if (role !== 'ADMIN' && role !== 'SUPERUSER') {
    return res.status(403).json({ error: 'Requiere ADMIN o SUPERUSER.' });
  }
  next();
}

const NAME_RE = /^[a-z][a-z0-9_]{1,40}$/i;

async function ensureTenant(req: any) {
  const db = ClientFactory.getClient('public');
  const tenantId = req.tenantId;
  if (!tenantId) throw new Error('Falta tenant.');
  const [t] = await db
    .select({ schemaName: schema.tenants.schemaName })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId));
  if (!t) throw new Error('Tenant no encontrado.');
  return { db, tenantId, schemaName: t.schemaName };
}

async function tableExistsInSchema(schemaName: string, tableName: string) {
  const db = ClientFactory.getClient(schemaName);
  const r: any = await db.execute(
    sql.raw(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = '${schemaName}' AND table_name = '${tableName}'`,
    ),
  );
  return (r.rows?.length ?? 0) > 0;
}

// ── GET / ──────────────────────────────────────────────────
router.get('/', async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    const rows = await db
      .select()
      .from(schema.pluginTables)
      .where(
        and(
          eq(schema.pluginTables.pluginId, USER_PLUGIN_ID),
          eq(schema.pluginTables.tenantId, tenantId),
        ),
      );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /menu — listado minimizado para inyección en el menú ───
router.get('/menu', async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    const rows = await db
      .select({
        tableName: schema.pluginTables.tableName,
        label: schema.pluginTables.label,
        iconName: schema.pluginTables.iconName,
        kind: schema.pluginTables.kind,
        menuModule: schema.pluginTables.menuModule,
      })
      .from(schema.pluginTables)
      .where(
        and(
          eq(schema.pluginTables.pluginId, USER_PLUGIN_ID),
          eq(schema.pluginTables.tenantId, tenantId),
        ),
      );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST / — crear tabla ──────────────────────────────────
router.post('/', requireAdmin, async (req: any, res) => {
  try {
    const { db, tenantId, schemaName } = await ensureTenant(req);
    const { name, label, kind = 'master', iconName, menuModule, description } = req.body || {};

    if (!name || !NAME_RE.test(name)) {
      return res.status(400).json({ error: 'Nombre inválido. Letras/dígitos/"_", 2–41 chars.' });
    }
    if (!['master', 'document'].includes(kind)) {
      return res.status(400).json({ error: 'Kind debe ser master o document.' });
    }
    const prefixed = name.startsWith('pt_') ? name : `pt_${name}`;

    if (await tableExistsInSchema(schemaName, prefixed)) {
      return res.status(400).json({ error: `La tabla "${prefixed}" ya existe.` });
    }

    const [existing] = await db
      .select()
      .from(schema.pluginTables)
      .where(
        and(
          eq(schema.pluginTables.pluginId, USER_PLUGIN_ID),
          eq(schema.pluginTables.tenantId, tenantId),
          eq(schema.pluginTables.tableName, prefixed),
        ),
      );
    if (existing) {
      return res.status(400).json({ error: 'Metadatos de tabla ya registrados.' });
    }

    const tenantDb = ClientFactory.getClient(schemaName);
    await tenantDb.execute(
      sql.raw(
        `CREATE TABLE "${schemaName}"."${prefixed}" (
          "id" TEXT PRIMARY KEY,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      ),
    );

    const id = crypto.randomUUID();
    await db.insert(schema.pluginTables).values({
      id,
      pluginId: USER_PLUGIN_ID,
      tenantId,
      tableName: prefixed,
      definition: JSON.stringify([]), // sin columnas iniciales
      label: label || name,
      kind,
      iconName: iconName || 'Table',
      menuModule: menuModule || null,
      description: description || null,
    });

    logAudit({
      tenantClient: db,
      tenantId,
      userId: req.user?.id,
      entityType: 'UserTable',
      entityId: id,
      action: 'CREATE',
      newValue: { name: prefixed, label, kind, menuModule },
    });

    res.json({ id, tableName: prefixed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /:name — actualizar metadatos ────────────────────
router.patch('/:name', requireAdmin, async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    const prefixed = req.params.name.startsWith('pt_') ? req.params.name : `pt_${req.params.name}`;
    const patch: any = {};
    for (const k of ['label', 'kind', 'iconName', 'menuModule', 'displayField', 'description']) {
      if (k in (req.body || {})) patch[k] = req.body[k];
    }
    await db
      .update(schema.pluginTables)
      .set(patch)
      .where(
        and(
          eq(schema.pluginTables.pluginId, USER_PLUGIN_ID),
          eq(schema.pluginTables.tenantId, tenantId),
          eq(schema.pluginTables.tableName, prefixed),
        ),
      );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /:name — drop tabla ────────────────────────────
router.delete('/:name', requireAdmin, async (req: any, res) => {
  try {
    const { db, tenantId, schemaName } = await ensureTenant(req);
    const prefixed = req.params.name.startsWith('pt_') ? req.params.name : `pt_${req.params.name}`;

    const tenantDb = ClientFactory.getClient(schemaName);
    await tenantDb.execute(sql.raw(`DROP TABLE IF EXISTS "${schemaName}"."${prefixed}"`));
    await db.delete(schema.pluginFields).where(eq(schema.pluginFields.tableName, prefixed));
    await db
      .delete(schema.pluginTables)
      .where(
        and(
          eq(schema.pluginTables.pluginId, USER_PLUGIN_ID),
          eq(schema.pluginTables.tenantId, tenantId),
          eq(schema.pluginTables.tableName, prefixed),
        ),
      );
    logAudit({
      tenantClient: db,
      tenantId,
      userId: req.user?.id,
      entityType: 'UserTable',
      entityId: prefixed,
      action: 'DELETE',
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:name/rows ────────────────────────────────────────
router.get('/:name/rows', async (req: any, res) => {
  try {
    const { schemaName } = await ensureTenant(req);
    const prefixed = req.params.name.startsWith('pt_') ? req.params.name : `pt_${req.params.name}`;
    const tenantDb = ClientFactory.getClient(schemaName);
    const r: any = await tenantDb.execute(
      sql.raw(`SELECT * FROM "${schemaName}"."${prefixed}" ORDER BY "createdAt" DESC LIMIT 500`),
    );
    res.json(r.rows || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:name/rows/:id ────────────────────────────────────
router.get('/:name/rows/:id', async (req: any, res) => {
  try {
    const { schemaName } = await ensureTenant(req);
    const prefixed = req.params.name.startsWith('pt_') ? req.params.name : `pt_${req.params.name}`;
    const tenantDb = ClientFactory.getClient(schemaName);
    const r: any = await tenantDb.execute(
      sql.raw(
        `SELECT * FROM "${schemaName}"."${prefixed}" WHERE "id" = '${String(req.params.id).replace(/'/g, "''")}'`,
      ),
    );
    const row = r.rows?.[0];
    if (!row) return res.status(404).json({ error: 'No encontrado.' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:name/rows ───────────────────────────────────────
router.post('/:name/rows', async (req: any, res) => {
  try {
    const { tenantId, schemaName } = await ensureTenant(req);
    const prefixed = req.params.name.startsWith('pt_') ? req.params.name : `pt_${req.params.name}`;
    const values = await PluginFieldManager.validateAndExtract(
      prefixed,
      req.body || {},
      tenantId,
      req.user?.role,
      schemaName,
    );

    const id = crypto.randomUUID();
    const tenantDb = ClientFactory.getClient(schemaName);

    const cols = ['id', 'createdAt', 'updatedAt', ...Object.keys(values)];
    const vals = [
      `'${id}'`,
      'CURRENT_TIMESTAMP',
      'CURRENT_TIMESTAMP',
      ...Object.values(values).map((v) =>
        v === null
          ? 'NULL'
          : typeof v === 'number'
            ? String(v)
            : typeof v === 'boolean'
              ? v
                ? 'TRUE'
                : 'FALSE'
              : `'${String(v).replace(/'/g, "''")}'`,
      ),
    ];
    await tenantDb.execute(
      sql.raw(
        `INSERT INTO "${schemaName}"."${prefixed}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${vals.join(',')})`,
      ),
    );
    res.json({ id });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── PATCH /:name/rows/:id ──────────────────────────────────
router.patch('/:name/rows/:id', async (req: any, res) => {
  try {
    const { tenantId, schemaName } = await ensureTenant(req);
    const prefixed = req.params.name.startsWith('pt_') ? req.params.name : `pt_${req.params.name}`;
    const values = await PluginFieldManager.validateAndExtract(
      prefixed,
      req.body || {},
      tenantId,
      req.user?.role,
      schemaName,
    );
    const tenantDb = ClientFactory.getClient(schemaName);
    const sets = Object.entries(values).map(([k, v]) => {
      const safe =
        v === null
          ? 'NULL'
          : typeof v === 'number'
            ? String(v)
            : typeof v === 'boolean'
              ? v
                ? 'TRUE'
                : 'FALSE'
              : `'${String(v).replace(/'/g, "''")}'`;
      return `"${k}" = ${safe}`;
    });
    sets.push(`"updatedAt" = CURRENT_TIMESTAMP`);
    await tenantDb.execute(
      sql.raw(
        `UPDATE "${schemaName}"."${prefixed}" SET ${sets.join(', ')} WHERE "id" = '${String(req.params.id).replace(/'/g, "''")}'`,
      ),
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── DELETE /:name/rows/:id ─────────────────────────────────
router.delete('/:name/rows/:id', async (req: any, res) => {
  try {
    const { schemaName } = await ensureTenant(req);
    const prefixed = req.params.name.startsWith('pt_') ? req.params.name : `pt_${req.params.name}`;
    const tenantDb = ClientFactory.getClient(schemaName);
    await tenantDb.execute(
      sql.raw(
        `DELETE FROM "${schemaName}"."${prefixed}" WHERE "id" = '${String(req.params.id).replace(/'/g, "''")}'`,
      ),
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
