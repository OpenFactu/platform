/**
 * CRUD de campos personalizados por tenant, creados desde la UI
 * (sin plugin). Reutilizan la tabla `PluginField` con
 * `pluginId = '__user__'` y `tenantId` fijado al tenant actual.
 * Los motores existentes (`PluginFieldManager`, `/api/plugins/fields/:tableName`)
 * ya los distribuyen al form, al detalle y al documento.
 */
import { Router } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { ClientFactory } from '../core/tenant/ClientFactory';
import * as schema from '../db/schema';
import { logAudit } from '../utils/audit';

const router = Router();

function requireAdmin(req: any, res: any, next: any) {
  const role = req.user?.role;
  if (role !== 'ADMIN' && role !== 'SUPERUSER') {
    return res.status(403).json({ error: 'Requiere ADMIN o SUPERUSER.' });
  }
  next();
}
router.use(requireAdmin);

const USER_PLUGIN_ID = '__user__';

const BLOCKED_TABLES = new Set<string>([
  'PluginField',
  'PluginTable',
  'TenantPlugin',
  'Tenant',
  'GlobalUser',
  'UserTenantMembership',
  'AuditLog',
  'DevApiKey',
  'MigrationRecord',
  'Notification',
  'Attachment',
  'BackgroundTask',
]);

async function getTenantTables(schemaName: string): Promise<string[]> {
  const db = ClientFactory.getClient(schemaName);
  const result: any = await db.execute(
    sql.raw(
      `SELECT tablename FROM pg_tables WHERE schemaname = '${schemaName}' ORDER BY tablename`,
    ),
  );
  const rows: any[] = result.rows || result;
  // Incluimos `pt_*` (tablas de usuario creadas en esta UI) porque
  // también deben poder recibir campos personalizados.
  return rows.map((r) => r.tablename).filter((name: string) => !BLOCKED_TABLES.has(name));
}

const ALLOWED_TYPES = new Set([
  'TEXT',
  'INTEGER',
  'DECIMAL',
  'BOOLEAN',
  'DATE',
  'JSONB',
  'ENUM',
  'MULTISELECT',
  'CURRENCY',
  'PERCENT',
  'URL',
  'EMAIL',
  'PHONE',
  'COLOR',
  'REFERENCE',
  'FILE',
]);

const SQL_TYPE: Record<string, string> = {
  TEXT: 'TEXT',
  INTEGER: 'INTEGER',
  DECIMAL: 'DECIMAL(15,4)',
  BOOLEAN: 'BOOLEAN',
  DATE: 'TIMESTAMP',
  JSONB: 'JSONB',
  ENUM: 'TEXT',
  MULTISELECT: 'JSONB',
  CURRENCY: 'DECIMAL(15,4)',
  PERCENT: 'DECIMAL(10,4)',
  URL: 'TEXT',
  EMAIL: 'TEXT',
  PHONE: 'TEXT',
  COLOR: 'TEXT',
  REFERENCE: 'TEXT',
  FILE: 'TEXT',
};

const ALLOWED_WIDTHS = new Set(['full', 'half', 'third']);
const ALLOWED_VISIBLE = new Set(['form', 'detail', 'list', 'pdf']);

interface CreateBody {
  tableName: string;
  fieldName: string;
  fieldType: string;
  label?: string;
  options?: any[];
  required?: boolean;
  helpText?: string;
  placeholder?: string;
  defaultValue?: any;
  readOnly?: boolean;
  width?: 'full' | 'half' | 'third';
  displayOrder?: number;
  section?: string;
  visibleIn?: string[];
  showInList?: boolean;
  readRoles?: string[];
  writeRoles?: string[];
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    unique?: boolean;
  };
  refTable?: string;
  refDisplayField?: string;
}

function normalizeOptions(options: any): any {
  if (!Array.isArray(options)) return null;
  return options.map((o: any) =>
    typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label || o.value },
  );
}

function normalizeField(body: CreateBody) {
  const out: any = {};
  out.label = body.label || body.fieldName;
  out.options = ['ENUM', 'MULTISELECT'].includes(body.fieldType)
    ? normalizeOptions(body.options)
    : null;
  out.required = !!body.required;
  out.helpText = body.helpText?.trim() || null;
  out.placeholder = body.placeholder?.trim() || null;
  out.defaultValue =
    body.defaultValue === undefined || body.defaultValue === null
      ? null
      : typeof body.defaultValue === 'string'
        ? body.defaultValue
        : JSON.stringify(body.defaultValue);
  out.readOnly = !!body.readOnly;
  out.width = ALLOWED_WIDTHS.has(body.width as any) ? body.width : 'half';
  out.displayOrder = Number(body.displayOrder || 0);
  out.section = body.section?.trim() || null;
  out.visibleIn = Array.isArray(body.visibleIn)
    ? body.visibleIn.filter((v) => ALLOWED_VISIBLE.has(v))
    : null;
  out.showInList = !!body.showInList;
  out.readRoles = Array.isArray(body.readRoles) ? body.readRoles : null;
  out.writeRoles = Array.isArray(body.writeRoles) ? body.writeRoles : null;
  out.validation = body.validation && typeof body.validation === 'object' ? body.validation : null;
  out.refTable = body.fieldType === 'REFERENCE' ? body.refTable || null : null;
  out.refDisplayField = body.fieldType === 'REFERENCE' ? body.refDisplayField || 'name' : null;
  return out;
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
  return { db, tenantId, schemaName: tenantRow.schemaName };
}

// ── GET / ───────────────────────────────────────────────────────────
router.get('/', async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    const rows = await db
      .select()
      .from(schema.pluginFields)
      .where(
        and(
          eq(schema.pluginFields.pluginId, USER_PLUGIN_ID),
          eq(schema.pluginFields.tenantId, tenantId),
        ),
      );
    res.json(rows);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /allowed-tables ─────────────────────────────────────────────
router.get('/allowed-tables', async (req: any, res) => {
  try {
    const { schemaName } = await ensureTenant(req);
    res.json(await getTenantTables(schemaName));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST / — crear/actualizar ──────────────────────────────────────
router.post('/', async (req: any, res) => {
  try {
    const { db, tenantId, schemaName } = await ensureTenant(req);
    const body = (req.body || {}) as CreateBody;
    const { tableName, fieldName, fieldType } = body;

    const availableTables = await getTenantTables(schemaName);
    if (!tableName || !availableTables.includes(tableName)) {
      return res.status(400).json({ error: `Tabla no permitida: ${tableName}` });
    }
    if (!fieldName || !/^[a-z][a-z0-9_]{1,40}$/i.test(fieldName)) {
      return res.status(400).json({
        error: 'Nombre inválido. Usa letras, dígitos y "_", 2–41 caracteres.',
      });
    }
    if (!ALLOWED_TYPES.has(fieldType)) {
      return res.status(400).json({ error: `Tipo no permitido: ${fieldType}` });
    }
    if (['ENUM', 'MULTISELECT'].includes(fieldType)) {
      if (!Array.isArray(body.options) || body.options.length === 0) {
        return res.status(400).json({ error: 'Se requiere al menos una opción.' });
      }
    }
    if (fieldType === 'REFERENCE') {
      if (!body.refTable || !availableTables.includes(body.refTable)) {
        return res.status(400).json({ error: 'refTable requerida y válida.' });
      }
    }

    const prefixed = fieldName.startsWith('p_') ? fieldName : `p_${fieldName}`;
    const sqlType = SQL_TYPE[fieldType];

    const tenantDb = ClientFactory.getClient(schemaName);
    await tenantDb.execute(
      sql.raw(
        `ALTER TABLE "${schemaName}"."${tableName}" ADD COLUMN IF NOT EXISTS "${prefixed}" ${sqlType}`,
      ),
    );

    const normalized = normalizeField(body);

    const [existing] = await db
      .select()
      .from(schema.pluginFields)
      .where(
        and(
          eq(schema.pluginFields.pluginId, USER_PLUGIN_ID),
          eq(schema.pluginFields.tenantId, tenantId),
          eq(schema.pluginFields.tableName, tableName),
          eq(schema.pluginFields.fieldName, prefixed),
        ),
      );

    if (existing) {
      await db
        .update(schema.pluginFields)
        .set({ ...normalized, fieldType })
        .where(eq(schema.pluginFields.id, existing.id));
      logAudit({
        tenantClient: db,
        tenantId,
        userId: req.user?.id,
        entityType: 'PluginField',
        entityId: existing.id,
        action: 'UPDATE',
        oldValue: existing,
        newValue: { ...existing, ...normalized, fieldType },
      });
      return res.json({ id: existing.id, fieldName: prefixed, updated: true });
    }

    const id = crypto.randomUUID();
    await db.insert(schema.pluginFields).values({
      id,
      pluginId: USER_PLUGIN_ID,
      tenantId,
      tableName,
      fieldName: prefixed,
      fieldType,
      isManaged: false,
      ...normalized,
    });
    logAudit({
      tenantClient: db,
      tenantId,
      userId: req.user?.id,
      entityType: 'PluginField',
      entityId: id,
      action: 'CREATE',
      newValue: { tableName, fieldName: prefixed, fieldType, ...normalized },
    });
    res.json({ id, fieldName: prefixed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /:id ────────────────────────────────────────────────────
router.delete('/:id', async (req: any, res) => {
  try {
    const { db, tenantId, schemaName } = await ensureTenant(req);
    const [field] = await db
      .select()
      .from(schema.pluginFields)
      .where(
        and(
          eq(schema.pluginFields.id, req.params.id),
          eq(schema.pluginFields.pluginId, USER_PLUGIN_ID),
          eq(schema.pluginFields.tenantId, tenantId),
        ),
      );
    if (!field) return res.status(404).json({ error: 'No encontrado.' });

    const tenantDb = ClientFactory.getClient(schemaName);
    await tenantDb.execute(
      sql.raw(
        `ALTER TABLE "${schemaName}"."${field.tableName}" DROP COLUMN IF EXISTS "${field.fieldName}"`,
      ),
    );
    await db.delete(schema.pluginFields).where(eq(schema.pluginFields.id, field.id));
    logAudit({
      tenantClient: db,
      tenantId,
      userId: req.user?.id,
      entityType: 'PluginField',
      entityId: field.id,
      action: 'DELETE',
      oldValue: field,
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:id/clone — clona un campo a otra tabla ─────────────────
router.post('/:id/clone', async (req: any, res) => {
  try {
    const { db, tenantId, schemaName } = await ensureTenant(req);
    const targetTable = req.body?.targetTable;
    if (!targetTable) return res.status(400).json({ error: 'targetTable requerido.' });
    const available = await getTenantTables(schemaName);
    if (!available.includes(targetTable))
      return res.status(400).json({ error: 'Tabla destino no permitida.' });

    const [field] = await db
      .select()
      .from(schema.pluginFields)
      .where(
        and(
          eq(schema.pluginFields.id, req.params.id),
          eq(schema.pluginFields.pluginId, USER_PLUGIN_ID),
          eq(schema.pluginFields.tenantId, tenantId),
        ),
      );
    if (!field) return res.status(404).json({ error: 'Origen no encontrado.' });

    const sqlType = SQL_TYPE[field.fieldType];
    const tenantDb = ClientFactory.getClient(schemaName);
    await tenantDb.execute(
      sql.raw(
        `ALTER TABLE "${schemaName}"."${targetTable}" ADD COLUMN IF NOT EXISTS "${field.fieldName}" ${sqlType}`,
      ),
    );
    const id = crypto.randomUUID();
    const { id: _id, createdAt: _ca, tableName: _tn, ...rest } = field as any;
    await db.insert(schema.pluginFields).values({
      ...rest,
      id,
      tableName: targetTable,
    });
    res.json({ id, tableName: targetTable });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /export ────────────────────────────────────────────────────
router.get('/export', async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    const rows = await db
      .select()
      .from(schema.pluginFields)
      .where(
        and(
          eq(schema.pluginFields.pluginId, USER_PLUGIN_ID),
          eq(schema.pluginFields.tenantId, tenantId),
        ),
      );
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="custom-fields.json"');
    res.send(JSON.stringify({ version: 1, fields: rows }, null, 2));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /import ───────────────────────────────────────────────────
router.post('/import', async (req: any, res) => {
  try {
    const { db, tenantId, schemaName } = await ensureTenant(req);
    const payload = req.body;
    const fields = Array.isArray(payload?.fields) ? payload.fields : [];
    if (fields.length === 0) return res.status(400).json({ error: 'Nada que importar.' });
    const available = await getTenantTables(schemaName);
    const tenantDb = ClientFactory.getClient(schemaName);

    let created = 0;
    let skipped = 0;
    for (const f of fields) {
      if (!available.includes(f.tableName)) {
        skipped++;
        continue;
      }
      if (!SQL_TYPE[f.fieldType]) {
        skipped++;
        continue;
      }
      await tenantDb.execute(
        sql.raw(
          `ALTER TABLE "${schemaName}"."${f.tableName}" ADD COLUMN IF NOT EXISTS "${f.fieldName}" ${SQL_TYPE[f.fieldType]}`,
        ),
      );
      const [existing] = await db
        .select()
        .from(schema.pluginFields)
        .where(
          and(
            eq(schema.pluginFields.pluginId, USER_PLUGIN_ID),
            eq(schema.pluginFields.tenantId, tenantId),
            eq(schema.pluginFields.tableName, f.tableName),
            eq(schema.pluginFields.fieldName, f.fieldName),
          ),
        );
      const row: any = {
        pluginId: USER_PLUGIN_ID,
        tenantId,
        tableName: f.tableName,
        fieldName: f.fieldName,
        fieldType: f.fieldType,
        label: f.label || f.fieldName,
        options: f.options ?? null,
        required: !!f.required,
        helpText: f.helpText ?? null,
        placeholder: f.placeholder ?? null,
        defaultValue: f.defaultValue ?? null,
        readOnly: !!f.readOnly,
        width: f.width || 'half',
        displayOrder: Number(f.displayOrder || 0),
        section: f.section ?? null,
        visibleIn: f.visibleIn ?? null,
        showInList: !!f.showInList,
        readRoles: f.readRoles ?? null,
        writeRoles: f.writeRoles ?? null,
        validation: f.validation ?? null,
        refTable: f.refTable ?? null,
        refDisplayField: f.refDisplayField ?? null,
        isManaged: false,
      };
      if (existing) {
        await db
          .update(schema.pluginFields)
          .set(row)
          .where(eq(schema.pluginFields.id, existing.id));
      } else {
        await db.insert(schema.pluginFields).values({ id: crypto.randomUUID(), ...row });
      }
      created++;
    }
    res.json({ ok: true, created, skipped });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PACKS predefinidos ─────────────────────────────────────────────
const PACKS: Record<
  string,
  Array<
    Partial<CreateBody> & { tableName: string; fieldName: string; fieldType: string; label: string }
  >
> = {
  // NOTA — NO añadir un pack "projects" con `projectCode` TEXT. Los
  // proyectos son una entidad nativa (`InternalOrder`) con FK propia
  // (`internalOrderId`) en todas las líneas de documento y de asiento.
  // Cualquier cosa parecida debe usar el campo nativo, no un custom.
  contacts: [
    {
      tableName: 'BusinessPartner',
      fieldName: 'linkedinUrl',
      fieldType: 'URL',
      label: 'LinkedIn',
      section: 'Contacto extra',
    },
    {
      tableName: 'BusinessPartner',
      fieldName: 'altPhone',
      fieldType: 'PHONE',
      label: 'Teléfono alternativo',
      section: 'Contacto extra',
    },
    {
      tableName: 'BusinessPartner',
      fieldName: 'altEmail',
      fieldType: 'EMAIL',
      label: 'Email alternativo',
      section: 'Contacto extra',
    },
  ],
  quality: [
    {
      tableName: 'SalesInvoiceLine',
      fieldName: 'qaPassed',
      fieldType: 'BOOLEAN',
      label: 'QA aprobado',
      section: 'Calidad',
    },
    {
      tableName: 'PurchaseInvoiceLine',
      fieldName: 'qaPassed',
      fieldType: 'BOOLEAN',
      label: 'QA aprobado',
      section: 'Calidad',
    },
    {
      tableName: 'Item',
      fieldName: 'qualityGrade',
      fieldType: 'ENUM',
      label: 'Grado de calidad',
      options: [
        { value: 'A', label: 'A — Premium' },
        { value: 'B', label: 'B — Estándar' },
        { value: 'C', label: 'C — Económico' },
      ],
      section: 'Calidad',
    },
  ],
};

router.get('/packs', (_req, res) => {
  res.json(
    Object.entries(PACKS).map(([id, fields]) => ({
      id,
      label: id === 'contacts' ? 'Contacto extra' : id === 'quality' ? 'Control de calidad' : id,
      count: fields.length,
      fields,
    })),
  );
});

router.post('/packs/:id/install', async (req: any, res) => {
  try {
    const packId = req.params.id;
    const pack = PACKS[packId];
    if (!pack) return res.status(404).json({ error: 'Pack no encontrado.' });
    const { db, tenantId, schemaName } = await ensureTenant(req);
    const available = await getTenantTables(schemaName);
    const tenantDb = ClientFactory.getClient(schemaName);
    let installed = 0;
    for (const f of pack) {
      if (!available.includes(f.tableName)) continue;
      const prefixed = `p_${f.fieldName}`;
      const sqlType = SQL_TYPE[f.fieldType];
      await tenantDb.execute(
        sql.raw(
          `ALTER TABLE "${schemaName}"."${f.tableName}" ADD COLUMN IF NOT EXISTS "${prefixed}" ${sqlType}`,
        ),
      );
      const [existing] = await db
        .select()
        .from(schema.pluginFields)
        .where(
          and(
            eq(schema.pluginFields.pluginId, USER_PLUGIN_ID),
            eq(schema.pluginFields.tenantId, tenantId),
            eq(schema.pluginFields.tableName, f.tableName),
            eq(schema.pluginFields.fieldName, prefixed),
          ),
        );
      if (existing) continue;
      await db.insert(schema.pluginFields).values({
        id: crypto.randomUUID(),
        pluginId: USER_PLUGIN_ID,
        tenantId,
        tableName: f.tableName,
        fieldName: prefixed,
        fieldType: f.fieldType,
        label: f.label,
        options: normalizeOptions(f.options),
        required: !!f.required,
        helpText: null,
        placeholder: null,
        defaultValue: null,
        readOnly: false,
        width: (f.width as any) || 'half',
        displayOrder: 0,
        section: f.section || null,
        visibleIn: null,
        showInList: !!f.showInList,
        readRoles: null,
        writeRoles: null,
        validation: null,
        refTable: null,
        refDisplayField: null,
        isManaged: false,
      });
      installed++;
    }
    res.json({ ok: true, installed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /ref/:tableName?q=... — búsqueda para el selector REFERENCE ─
router.get('/ref/:tableName', async (req: any, res) => {
  try {
    const { schemaName } = await ensureTenant(req);
    const t = req.params.tableName;
    const q = String(req.query.q || '').trim();
    const display = String(req.query.display || 'name');
    const available = await getTenantTables(schemaName);
    if (!available.includes(t)) return res.status(400).json({ error: 'Tabla no permitida.' });

    const tenantDb = ClientFactory.getClient(schemaName);
    const safeCol = /^[A-Za-z_][A-Za-z0-9_]*$/.test(display) ? display : 'name';
    const where = q ? `WHERE "${safeCol}"::text ILIKE '%${q.replace(/'/g, "''")}%'` : '';
    const result: any = await tenantDb.execute(
      sql.raw(
        `SELECT id, "${safeCol}"::text AS label FROM "${schemaName}"."${t}" ${where} ORDER BY label LIMIT 20`,
      ),
    );
    res.json(result.rows || result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
