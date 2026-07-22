/**
 * Endpoints administrativos peligrosos. Solo para SUPERUSER.
 *
 *   GET  /api/admin/tenants/:id/export        — descarga zip del tenant
 *   POST /api/admin/tenants/import            — sube zip y crea tenant nuevo
 *   GET  /api/admin/tenants/:id/export-data   — descarga CSVs genéricos
 */

import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { SchemaManager } from '../core/tenant/SchemaManager';
import { TenantBackup, defaultUploadsBase } from '../core/tenant/TenantBackup';
import { defaultBackupsBasePath } from '../core/backup/BackupDestination';
import { ErpDataExporter } from '../core/export/ErpDataExporter';
import { MigrationManager } from '../core/tenant/MigrationManager';
import { seedAccountingDefaults } from '../core/accounting/seedAccountingDefaults';

const router = Router();
const upload = multer({
  dest: '/tmp/openfactu-tenant-import/',
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

/**
 * Las acciones admin son destructivas/sensibles. Reglas:
 *  - ADMIN: puede exportar/importar/exportar-CSV de SU tenant (req.user.tenantId).
 *  - SUPERUSER: puede tocar cualquier tenant.
 *  - Resto: 403.
 *
 * Validamos rol global y, en cada endpoint con `:id`, que coincida con el
 * tenant del usuario si no es SUPERUSER.
 */
function requireAdminOrSuperuser(req: any, res: any, next: any) {
  const role = req.user?.role;
  if (role !== 'SUPERUSER' && role !== 'ADMIN') {
    return res.status(403).json({ error: 'Requiere rol ADMIN o SUPERUSER' });
  }
  next();
}

function ensureTenantAccess(req: any, res: any, tenantId: string): boolean {
  const role = req.user?.role;
  if (role === 'SUPERUSER') return true;
  if (req.user?.tenantId && req.user.tenantId === tenantId) return true;
  res.status(403).json({ error: 'No puedes operar sobre otra empresa' });
  return false;
}

/**
 * Borrar una empresa es irreversible y afecta a cualquier usuario con
 * acceso, no solo al tenant activo del que la borra — a diferencia de
 * export/import, aquí NO basta con ser ADMIN de esa empresa.
 */
function requireSuperuser(req: any, res: any, next: any) {
  if (req.user?.role !== 'SUPERUSER') {
    return res.status(403).json({ error: 'Borrar una empresa requiere rol SUPERUSER' });
  }
  next();
}

router.use(requireAdminOrSuperuser);

/**
 * GET /api/admin/tenants/:id/export — zip con schema/data/uploads.
 */
router.get('/tenants/:id/export', async (req: any, res) => {
  if (!ensureTenantAccess(req, res, req.params.id)) return;
  try {
    // ?includeUploads=false  → omite los archivos adjuntos (más rápido y ligero)
    const includeUploads = req.query.includeUploads !== 'false';
    const buf = await TenantBackup.exportToZip(req.params.id, { includeUploads });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="tenant_${req.params.id}_${Date.now()}.zip"`,
    );
    res.end(buf);
  } catch (e: any) {
    console.error('[Admin.exportTenant] error:', e?.stack || e);
    res.status(500).json({ error: e?.message || 'Error al exportar' });
  }
});

/**
 * POST /api/admin/tenants/import — multipart "file" + ?name=NewName
 */
router.post('/tenants/import', upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'falta el zip (campo "file")' });
    const newName = (req.query.name as string) || (req.body.name as string);
    if (!newName) return res.status(400).json({ error: 'name requerido (?name=...)' });

    const buf = await fs.promises.readFile(req.file.path);
    const result = await TenantBackup.importFromZip(buf, { newName });
    fs.promises.unlink(req.file.path).catch(() => {});
    res.json(result);
  } catch (e: any) {
    console.error('[Admin.importTenant] error:', e?.stack || e);
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
    res.status(500).json({ error: e?.message || 'Error al importar' });
  }
});

/**
 * DELETE /api/admin/tenants/:id — borra una empresa PERMANENTEMENTE.
 * Body: { confirmName: "<nombre exacto de la empresa>" }
 *
 * Solo SUPERUSER (ver `requireSuperuser`). Requiere que `confirmName`
 * coincida exactamente con `tenant.name` — protección contra un click
 * accidental, ya que no hay vuelta atrás sin restaurar desde un backup.
 *
 * Elimina, en orden:
 *   1. Filas en `public` que referencian al tenant sin ON DELETE CASCADE
 *      (GlobalUser.tenantId se pone a null; AuditLog/DevApiKey se borran).
 *      UserTenantMembership/TenantPlugin/ApiToken cascadean solos por FK.
 *   2. La fila `Tenant`.
 *   3. El schema físico completo (`DROP SCHEMA ... CASCADE`) — aquí viven
 *      todos los datos de negocio (documentos, stock, contabilidad...).
 *   4. Los archivos locales de `storage/uploads/<schema>` y
 *      `storage/backups/<schema>` (best-effort, no bloquea si falla).
 *   5. La conexión cacheada del schema en ClientFactory.
 */
router.delete('/tenants/:id', requireSuperuser, async (req: any, res) => {
  try {
    const publicDb = ClientFactory.getClient('public');
    const [tenant] = await publicDb
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, req.params.id));
    if (!tenant) return res.status(404).json({ error: 'Empresa no encontrada' });

    const confirmName = String(req.body?.confirmName ?? '');
    if (confirmName !== tenant.name) {
      return res.status(400).json({
        error: 'El nombre de confirmación no coincide con el de la empresa',
      });
    }

    console.warn(
      `[Admin.deleteTenant] SUPERUSER ${req.user?.id} borrando empresa "${tenant.name}" ` +
        `(id=${tenant.id}, schema=${tenant.schemaName})`,
    );

    // 1-3, 5: filas de `public` sin cascade + fila Tenant + schema físico +
    // conexión cacheada (lógica compartida con el rollback de importFromZip).
    await SchemaManager.deleteTenantCompletely(tenant.id, tenant.schemaName);

    // 4. Limpiar archivos locales — no crítico si falla (p.ej. ya usaba cloud).
    for (const base of [defaultUploadsBase(), defaultBackupsBasePath()]) {
      try {
        fs.rmSync(path.join(base, tenant.schemaName), { recursive: true, force: true });
      } catch (e: any) {
        console.warn(`[Admin.deleteTenant] No se pudo limpiar ${base}: ${e?.message}`);
      }
    }

    console.warn(`[Admin.deleteTenant] Empresa "${tenant.name}" eliminada por completo.`);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[Admin.deleteTenant] error:', e?.stack || e);
    res.status(500).json({ error: e?.message || 'Error al borrar la empresa' });
  }
});

/**
 * GET /api/admin/tenants/:id/export-data — CSVs por entidad.
 */
router.get('/tenants/:id/export-data', async (req: any, res) => {
  if (!ensureTenantAccess(req, res, req.params.id)) return;
  try {
    const publicDb = ClientFactory.getClient('public');
    const [tenant] = await publicDb
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, req.params.id));
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });

    const tenantClient = await ClientFactory.getTenantClient(req.params.id);
    const buf = await ErpDataExporter.exportToZip(tenantClient);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="erp_data_${tenant.schemaName}_${Date.now()}.zip"`,
    );
    res.end(buf);
  } catch (e: any) {
    console.error('[Admin.exportData] error:', e?.stack || e);
    res.status(500).json({ error: e?.message || 'Error al exportar datos' });
  }
});

/**
 * POST /api/admin/seed-accounting — siembra plan contable mínimo (PGC
 * abreviado) + mapeos de cuenta por defecto. Idempotente. Pensado para
 * que un usuario no contable pueda probar la contabilidad en un clic.
 */
router.post('/seed-accounting', async (req: any, res) => {
  try {
    const result = await seedAccountingDefaults(req.tenantClient);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/migrate — fuerza `MigrationManager.syncAllTenants()` sin
 * reiniciar el servidor. Útil tras pullear migrations nuevas o añadir
 * columnas en schema.ts sin poder reiniciar el proceso.
 */
router.post('/migrate', async (_req: any, res) => {
  try {
    await MigrationManager.syncAllTenants();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
