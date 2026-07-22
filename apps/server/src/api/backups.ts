/**
 * Gestión de backups del tenant.
 *
 *   GET    /api/backups              — historial (últimas 50 ejecuciones)
 *   POST   /api/backups/run          — lanza un backup manual (202, corre en background)
 *   GET    /api/backups/:id/download — descarga el zip desde su destino
 *   DELETE /api/backups/:id          — borra el zip del destino + la fila
 *   POST   /api/backups/:id/restore  — SOLO SUPERUSER: importa el zip como
 *                                      tenant NUEVO (no sobrescribe el actual)
 *
 * La programación (frecuencia/destino/retención) vive en la sección `backup`
 * de /api/config/backup; el cron está en `core/cron/backupCron.ts`.
 */

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { TenantBackup } from '../core/tenant/TenantBackup';
import { BackupService, type BackupTenantRef } from '../core/backup/BackupService';
import { resolveBackupDestination } from '../core/backup/BackupDestination';
import { logAudit } from '../utils/audit';

const router = Router();

// Mismas reglas que /api/admin: ADMIN sobre su tenant, SUPERUSER sobre todos.
function requireAdminOrSuperuser(req: any, res: any, next: any) {
  const role = req.user?.role;
  if (role !== 'SUPERUSER' && role !== 'ADMIN') {
    return res.status(403).json({ error: 'Requiere rol ADMIN o SUPERUSER' });
  }
  next();
}

router.use(requireAdminOrSuperuser);

/** Resuelve la fila Tenant del request (necesaria para exportar/nombrar). */
async function resolveTenant(req: any): Promise<BackupTenantRef | null> {
  if (!req.tenantId) return null;
  const publicDb = ClientFactory.getClient('public');
  const [tenant] = await publicDb
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, req.tenantId));
  return tenant || null;
}

router.get('/', async (req: any, res) => {
  if (!req.tenantId) return res.status(400).json({ error: 'tenant requerido' });
  try {
    const runs = await BackupService.listRuns(req.tenantClient);
    res.json({ runs, running: BackupService.isRunning(req.tenantId) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al listar backups' });
  }
});

router.post('/run', async (req: any, res) => {
  try {
    const tenant = await resolveTenant(req);
    if (!tenant) return res.status(400).json({ error: 'tenant requerido' });
    if (BackupService.isRunning(tenant.id)) {
      return res.status(409).json({ error: 'Ya hay un backup en curso' });
    }
    // Fire-and-forget: los exports grandes tardan minutos y reventarían el
    // timeout HTTP. La UI sondea GET / para ver el estado de la fila.
    BackupService.runBackup(tenant, { kind: 'manual', userId: req.user?.id }).catch((e) =>
      console.error('[Backups.run] error inesperado:', e?.stack || e),
    );
    res.status(202).json({ started: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al lanzar backup' });
  }
});

router.get('/:id/download', async (req: any, res) => {
  try {
    const tenant = await resolveTenant(req);
    if (!tenant) return res.status(400).json({ error: 'tenant requerido' });
    const [run] = await req.tenantClient
      .select()
      .from(schema.backupRuns)
      .where(eq(schema.backupRuns.id, req.params.id));
    if (!run || run.status !== 'ok' || !run.externalId) {
      return res.status(404).json({ error: 'Backup no encontrado o incompleto' });
    }
    const dest = await resolveBackupDestination(
      req.tenantClient,
      tenant.schemaName,
      run.destination,
    );
    const { stream, size } = await dest.getStream(run.externalId);
    res.setHeader('Content-Type', 'application/zip');
    if (size) res.setHeader('Content-Length', String(size));
    res.setHeader('Content-Disposition', `attachment; filename="${run.fileName || 'backup.zip'}"`);
    stream.on('error', (e: any) => {
      console.error('[Backups.download] error de stream:', e?.message);
      if (!res.headersSent) res.status(500);
      res.end();
    });
    stream.pipe(res);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al descargar backup' });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const tenant = await resolveTenant(req);
    if (!tenant) return res.status(400).json({ error: 'tenant requerido' });
    const [run] = await req.tenantClient
      .select()
      .from(schema.backupRuns)
      .where(eq(schema.backupRuns.id, req.params.id));
    if (!run) return res.status(404).json({ error: 'Backup no encontrado' });

    if (run.externalId) {
      try {
        const dest = await resolveBackupDestination(
          req.tenantClient,
          tenant.schemaName,
          run.destination,
        );
        await dest.remove(run.externalId);
      } catch (e: any) {
        // El archivo puede no existir ya (retención, borrado manual en el
        // cloud…) — borramos la fila igualmente.
        console.warn('[Backups.delete] no se pudo borrar el archivo:', e?.message);
      }
    }
    await req.tenantClient.delete(schema.backupRuns).where(eq(schema.backupRuns.id, req.params.id));

    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId,
      userId: req.user?.id,
      entityType: 'BackupRun',
      entityId: req.params.id,
      action: 'DELETE',
      oldValue: { fileName: run.fileName, destination: run.destination },
    });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error al borrar backup' });
  }
});

router.post('/:id/restore', async (req: any, res) => {
  if (req.user?.role !== 'SUPERUSER') {
    return res.status(403).json({ error: 'Restaurar requiere rol SUPERUSER' });
  }
  try {
    const tenant = await resolveTenant(req);
    if (!tenant) return res.status(400).json({ error: 'tenant requerido' });
    const newName = (req.body?.newName || '').trim();
    if (!newName) return res.status(400).json({ error: 'newName requerido' });

    const [run] = await req.tenantClient
      .select()
      .from(schema.backupRuns)
      .where(eq(schema.backupRuns.id, req.params.id));
    if (!run || run.status !== 'ok' || !run.externalId) {
      return res.status(404).json({ error: 'Backup no encontrado o incompleto' });
    }

    const dest = await resolveBackupDestination(
      req.tenantClient,
      tenant.schemaName,
      run.destination,
    );
    const { stream } = await dest.getStream(run.externalId);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as any) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    // Importa como tenant NUEVO — la restauración nunca sobrescribe in-place.
    const result = await TenantBackup.importFromZip(Buffer.concat(chunks), { newName });

    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId,
      userId: req.user?.id,
      entityType: 'BackupRun',
      entityId: req.params.id,
      action: 'CREATE',
      newValue: { restoredAs: newName, newTenantId: result.tenantId },
    });

    res.json(result);
  } catch (e: any) {
    console.error('[Backups.restore] error:', e?.stack || e);
    res.status(500).json({ error: e?.message || 'Error al restaurar backup' });
  }
});

export default router;
