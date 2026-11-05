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
 *   GET    /:name/rows/:id/pdf · PDF del registro (solo tablas de tipo documento)
 */
import { Router } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { ClientFactory } from '../core/tenant/ClientFactory';
import * as schema from '../db/schema';
import { PluginFieldManager } from '../core/plugins/PluginFieldManager';
import { logAudit } from '../utils/audit';
import { UserDocTypes, isUserDocType } from '../core/documents/UserDocTypes';
import { renderDocumentPdf } from '../core/documents/renderDocumentPdf';

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

const physicalName = (name: string) => (name.startsWith('pt_') ? name : `pt_${name}`);

const tableRef = (schemaName: string, table: string) =>
  sql`${sql.identifier(schemaName)}.${sql.identifier(table)}`;

/** Valor de un campo como parámetro de SQL: lo que no es escalar va en JSON. */
const toParam = (value: unknown) =>
  value !== null && typeof value === 'object' ? JSON.stringify(value) : value;

// Toda ruta con nombre de tabla pasa por aquí: ese nombre acaba en una consulta, así
// que solo vale el de una tabla propia registrada de esta empresa.
router.param('name', async (req: any, res, next, name: string) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    const prefixed = physicalName(name);
    const [table] = isUserDocType(prefixed)
      ? await db
          .select({ id: schema.pluginTables.id })
          .from(schema.pluginTables)
          .where(
            and(
              eq(schema.pluginTables.pluginId, USER_PLUGIN_ID),
              eq(schema.pluginTables.tenantId, tenantId),
              eq(schema.pluginTables.tableName, prefixed),
            ),
          )
      : [];
    if (!table) return res.status(404).json({ error: 'Tabla no encontrada.' });
    req.userTable = prefixed;
    next();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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

    const docType = await UserDocTypes.find(tenantId, prefixed);
    if (docType) await UserDocTypes.ensureTemplate(tenantDb, docType);

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
    const { db, tenantId, schemaName } = await ensureTenant(req);
    const prefixed = req.userTable;
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
    // Al pasar a documento o cambiar de nombre, su plantilla estándar lo recoge.
    const docType = await UserDocTypes.find(tenantId, prefixed);
    if (docType) await UserDocTypes.ensureTemplate(ClientFactory.getClient(schemaName), docType);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /:name — drop tabla ────────────────────────────
router.delete('/:name', requireAdmin, async (req: any, res) => {
  try {
    const { db, tenantId, schemaName } = await ensureTenant(req);
    const prefixed = req.userTable;

    const tenantDb = ClientFactory.getClient(schemaName);
    await tenantDb.execute(sql`DROP TABLE IF EXISTS ${tableRef(schemaName, prefixed)}`);
    await UserDocTypes.dropTemplates(tenantDb, prefixed);
    // Otra empresa puede tener una tabla con el mismo nombre: sus campos no se tocan.
    await db
      .delete(schema.pluginFields)
      .where(
        and(
          eq(schema.pluginFields.pluginId, USER_PLUGIN_ID),
          eq(schema.pluginFields.tenantId, tenantId),
          eq(schema.pluginFields.tableName, prefixed),
        ),
      );
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
    const prefixed = req.userTable;
    const tenantDb = ClientFactory.getClient(schemaName);
    const r: any = await tenantDb.execute(
      sql`SELECT * FROM ${tableRef(schemaName, prefixed)} ORDER BY "createdAt" DESC LIMIT 500`,
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
    const prefixed = req.userTable;
    const tenantDb = ClientFactory.getClient(schemaName);
    const r: any = await tenantDb.execute(
      sql`SELECT * FROM ${tableRef(schemaName, prefixed)} WHERE "id" = ${String(req.params.id)}`,
    );
    const row = r.rows?.[0];
    if (!row) return res.status(404).json({ error: 'No encontrado.' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:name/rows/:id/pdf ────────────────────────────────
router.get('/:name/rows/:id/pdf', async (req: any, res) => {
  try {
    const { tenantId, schemaName } = await ensureTenant(req);
    const prefixed = req.userTable;
    const docType = await UserDocTypes.find(tenantId, prefixed);
    if (!docType) {
      return res.status(404).json({ error: 'Esta tabla no es de tipo documento.' });
    }
    const tenantDb = ClientFactory.getClient(schemaName);
    await UserDocTypes.ensureTemplate(tenantDb, docType);
    await renderDocumentPdf(
      prefixed,
      req.params.id,
      req.query.templateId ? String(req.query.templateId) : undefined,
      tenantDb,
      res,
      tenantId,
    );
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  }
});

// ── POST /:name/rows ───────────────────────────────────────
router.post('/:name/rows', async (req: any, res) => {
  try {
    const { tenantId, schemaName } = await ensureTenant(req);
    const prefixed = req.userTable;
    const values = await PluginFieldManager.validateAndExtract(
      prefixed,
      req.body || {},
      tenantId,
      req.user?.role,
      schemaName,
    );

    const id = crypto.randomUUID();
    const tenantDb = ClientFactory.getClient(schemaName);

    // Los nombres de columna salen de las definiciones de campos de la tabla, no del cuerpo.
    const cols = ['id', 'createdAt', 'updatedAt', ...Object.keys(values)];
    const vals = [
      sql`${id}`,
      sql`CURRENT_TIMESTAMP`,
      sql`CURRENT_TIMESTAMP`,
      ...Object.values(values).map((v) => sql`${toParam(v)}`),
    ];
    await tenantDb.execute(
      sql`INSERT INTO ${tableRef(schemaName, prefixed)} (${sql.join(
        cols.map((c) => sql.identifier(c)),
        sql`, `,
      )}) VALUES (${sql.join(vals, sql`, `)})`,
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
    const prefixed = req.userTable;
    const values = await PluginFieldManager.validateAndExtract(
      prefixed,
      req.body || {},
      tenantId,
      req.user?.role,
      schemaName,
    );
    const tenantDb = ClientFactory.getClient(schemaName);
    const sets = Object.entries(values).map(([k, v]) => sql`${sql.identifier(k)} = ${toParam(v)}`);
    sets.push(sql`"updatedAt" = CURRENT_TIMESTAMP`);
    await tenantDb.execute(
      sql`UPDATE ${tableRef(schemaName, prefixed)} SET ${sql.join(sets, sql`, `)} WHERE "id" = ${String(req.params.id)}`,
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
    const prefixed = req.userTable;
    const tenantDb = ClientFactory.getClient(schemaName);
    await tenantDb.execute(
      sql`DELETE FROM ${tableRef(schemaName, prefixed)} WHERE "id" = ${String(req.params.id)}`,
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
