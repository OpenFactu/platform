import { Router } from 'express';
import { eq, asc, desc, like, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import crypto from 'crypto';
import { logAudit } from '../utils/audit';
import { PluginFieldManager } from '../core/plugins/PluginFieldManager';
import { TenantPluginCache } from '../core/plugins/TenantPluginCache';
import { ClientFactory } from '../core/tenant/ClientFactory';

const router = Router();

// Las columnas de campos personalizados se crean vía ALTER TABLE con prefijo p_
// y no existen en el pgTable estático de Drizzle, así que hay que leerlas y
// escribirlas con SQL raw. Solo se interpolan identificadores que pasen este filtro.
const PLUGIN_COL_RE = /^p_[A-Za-z0-9_]+$/;

function sqlLiteral(v: any): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Defs de campos personalizados activas para InternalOrder en este tenant. */
async function activeFieldDefs(tenantId?: string): Promise<any[]> {
  const publicDb = ClientFactory.getClient('public');
  const defs = await publicDb
    .select()
    .from(schema.pluginFields)
    .where(eq(schema.pluginFields.tableName, 'InternalOrder'));
  if (!tenantId) return defs as any[];
  return (defs as any[]).filter((def) => {
    if (def.pluginId === '__user__') return def.tenantId === tenantId;
    return TenantPluginCache.isActive(tenantId, def.pluginId);
  });
}

/** Valida los campos p_* del body. Lanza si algo es inválido (llamar ANTES de escribir). */
async function extractPluginFields(req: any): Promise<Record<string, any>> {
  const values = await PluginFieldManager.validateAndExtract(
    'InternalOrder',
    req.body || {},
    req.tenantId,
    req.user?.role,
    req.tenantSchema,
  );
  return Object.fromEntries(Object.entries(values).filter(([k]) => PLUGIN_COL_RE.test(k)));
}

/** Persiste los campos p_* ya validados sobre una fila existente. */
async function persistPluginFields(req: any, id: string, values: Record<string, any>) {
  const entries = Object.entries(values);
  if (entries.length === 0) return;
  const sets = entries.map(([k, v]) => `"${k}" = ${sqlLiteral(v)}`).join(', ');
  await req.tenantClient.execute(
    sql.raw(
      `UPDATE "${req.tenantSchema}"."InternalOrder" SET ${sets} WHERE "id" = '${String(id).replace(/'/g, "''")}'`,
    ),
  );
}

/** Valores p_* legibles por el rol actual, indexados por id de fila. */
async function fetchPluginValues(req: any): Promise<Map<string, Record<string, any>> | null> {
  const defs = await activeFieldDefs(req.tenantId);
  const cols = defs
    .filter((d) => {
      const rr: string[] = Array.isArray(d.readRoles) ? d.readRoles : [];
      return rr.length === 0 || !req.user?.role || rr.includes(req.user.role);
    })
    .map((d) => d.fieldName)
    .filter((f: string) => PLUGIN_COL_RE.test(f));
  if (cols.length === 0) return null;
  const r: any = await req.tenantClient.execute(
    sql.raw(
      `SELECT "id", ${cols.map((c) => `"${c}"`).join(', ')} FROM "${req.tenantSchema}"."InternalOrder"`,
    ),
  );
  const map = new Map<string, Record<string, any>>();
  for (const row of r.rows ?? []) {
    const { id, ...rest } = row;
    map.set(id, rest);
  }
  return map;
}

async function nextCode(tenantClient: any): Promise<string> {
  const rows = await tenantClient
    .select({ code: schema.internalOrders.code })
    .from(schema.internalOrders)
    .where(like(schema.internalOrders.code, 'PRJ-%'))
    .orderBy(desc(schema.internalOrders.code))
    .limit(1);
  let max = 0;
  const last = rows[0]?.code as string | undefined;
  if (last) {
    const n = parseInt(last.split('-')[1] || '0', 10);
    if (!Number.isNaN(n)) max = n;
  }
  return `PRJ-${String(max + 1).padStart(4, '0')}`;
}

const ALLOWED_TYPES = new Set(['project', 'internal_order', 'wbs']);
const ALLOWED_STATUS = new Set(['open', 'closed']);

function coerce(body: any) {
  const out: any = {};
  for (const k of [
    'code',
    'name',
    'type',
    'startDate',
    'endDate',
    'budgetAmount',
    'status',
    'costCenterId',
    'notes',
  ]) {
    if (k in body) out[k] = body[k] === '' ? null : body[k];
  }
  return out;
}

router.get('/', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select()
      .from(schema.internalOrders)
      .orderBy(asc(schema.internalOrders.code));
    // Drizzle solo selecciona las columnas declaradas en el pgTable; si el
    // tenant tiene campos personalizados, se leen aparte y se fusionan.
    const pluginMap = await fetchPluginValues(req);
    if (!pluginMap) return res.json(rows);
    res.json(rows.map((r: any) => ({ ...r, ...(pluginMap.get(r.id) || {}) })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const payload = coerce(req.body);
    if (!payload.name) {
      return res.status(400).json({ error: 'name es obligatorio' });
    }
    if (!payload.code) payload.code = await nextCode(req.tenantClient);
    if (payload.type && !ALLOWED_TYPES.has(payload.type)) {
      return res.status(400).json({ error: 'type inválido' });
    }
    if (payload.status && !ALLOWED_STATUS.has(payload.status)) {
      return res.status(400).json({ error: 'status inválido' });
    }
    // Validar campos personalizados ANTES de insertar para no escribir a medias.
    let pluginValues: Record<string, any>;
    try {
      pluginValues = await extractPluginFields(req);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.internalOrders)
      .values({ id, ...payload })
      .returning();
    await persistPluginFields(req, id, pluginValues);
    const merged = { ...row, ...pluginValues };
    res.json(merged);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'InternalOrder',
      entityId: id,
      action: 'CREATE',
      newValue: merged,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', async (req: any, res) => {
  const { id } = req.params;
  try {
    const [old] = await req.tenantClient
      .select()
      .from(schema.internalOrders)
      .where(eq(schema.internalOrders.id, id));
    if (!old) return res.status(404).json({ error: 'Orden interna no encontrada' });
    const payload: any = coerce(req.body);
    if (payload.type && !ALLOWED_TYPES.has(payload.type)) {
      return res.status(400).json({ error: 'type inválido' });
    }
    if (payload.status && !ALLOWED_STATUS.has(payload.status)) {
      return res.status(400).json({ error: 'status inválido' });
    }
    let pluginValues: Record<string, any>;
    try {
      pluginValues = await extractPluginFields(req);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
    payload.updatedAt = new Date();
    const [row] = await req.tenantClient
      .update(schema.internalOrders)
      .set(payload)
      .where(eq(schema.internalOrders.id, id))
      .returning();
    await persistPluginFields(req, id, pluginValues);
    const merged = { ...row, ...pluginValues };
    res.json(merged);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'InternalOrder',
      entityId: id,
      action: 'UPDATE',
      oldValue: old,
      newValue: merged,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req: any, res) => {
  const { id } = req.params;
  try {
    const [old] = await req.tenantClient
      .select()
      .from(schema.internalOrders)
      .where(eq(schema.internalOrders.id, id));
    await req.tenantClient.delete(schema.internalOrders).where(eq(schema.internalOrders.id, id));
    res.json({ success: true });
    if (old)
      logAudit({
        tenantClient: req.tenantClient,
        tenantId: req.tenantId || '',
        userId: req.user?.id,
        entityType: 'InternalOrder',
        entityId: id,
        action: 'DELETE',
        oldValue: old,
      });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
