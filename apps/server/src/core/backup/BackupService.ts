/**
 * Servicio de backups de tenant: ejecuta un backup (manual o programado),
 * lo sube al destino configurado, registra la ejecución en `BackupRun` y
 * aplica la retención (borra los backups más antiguos del destino).
 */

import crypto from 'crypto';
import { desc, eq, inArray } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { ClientFactory } from '../tenant/ClientFactory';
import { TenantBackup } from '../tenant/TenantBackup';
import { notifyTenant } from '../realtime/notifyTenant';
import { getConfigSection } from '../config/systemConfigSection';
import { BACKUP_DEFAULTS, type BackupConfig } from './backupConfig';
import { resolveBackupDestination, type BackupDestination } from './BackupDestination';

export interface BackupTenantRef {
  id: string;
  schemaName: string;
  name: string;
}

/** Tenants con un backup en curso — evita solapamientos (cron + manual). */
const runningTenants = new Set<string>();

function timestampSlug(d = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

export class BackupService {
  static isRunning(tenantId: string): boolean {
    return runningTenants.has(tenantId);
  }

  /**
   * Ejecuta un backup completo del tenant y lo guarda en el destino de su
   * config. Devuelve el id de la fila BackupRun. No lanza por errores del
   * propio backup (quedan en la fila + notificación); sí lanza si ya hay un
   * backup en curso para el tenant.
   */
  static async runBackup(
    tenant: BackupTenantRef,
    opts: { kind: 'scheduled' | 'manual'; userId?: string },
  ): Promise<{ runId: string; ok: boolean; error?: string }> {
    if (runningTenants.has(tenant.id)) {
      throw new Error('Ya hay un backup en curso para esta empresa');
    }
    runningTenants.add(tenant.id);

    const tenantClient = ClientFactory.getClient(tenant.schemaName);
    const cfg = await getConfigSection<BackupConfig>(tenantClient, 'backup', BACKUP_DEFAULTS);
    const runId = crypto.randomUUID();

    await tenantClient.insert(schema.backupRuns).values({
      id: runId,
      kind: opts.kind,
      status: 'running',
      destination: cfg.destination,
      includeUploads: cfg.includeUploads,
      createdByUserId: opts.userId || null,
      startedAt: new Date(),
    });

    try {
      const dest = await resolveBackupDestination(tenantClient, tenant.schemaName, cfg.destination);
      const zip = await TenantBackup.exportToZip(tenant.id, {
        includeUploads: cfg.includeUploads,
      });
      const fileName = `keirost_${tenant.schemaName}_${timestampSlug()}.zip`;
      const stored = await dest.put(fileName, zip);

      await tenantClient
        .update(schema.backupRuns)
        .set({
          status: 'ok',
          fileName,
          externalId: stored.externalId,
          sizeBytes: stored.size,
          finishedAt: new Date(),
        })
        .where(eq(schema.backupRuns.id, runId));

      await this.applyRetention(dest, tenantClient, tenant.schemaName, cfg.retentionCount).catch(
        (e) =>
          console.warn(`[BackupService] Retención fallida para ${tenant.schemaName}:`, e?.message),
      );

      return { runId, ok: true };
    } catch (e: any) {
      const message = e?.message || 'Error desconocido';
      console.error(`[BackupService] Backup fallido para ${tenant.schemaName}:`, e?.stack || e);
      await tenantClient
        .update(schema.backupRuns)
        .set({ status: 'error', error: message, finishedAt: new Date() })
        .where(eq(schema.backupRuns.id, runId))
        .catch(() => undefined);

      await notifyTenant({
        tenantId: tenant.id,
        tenantClient,
        level: 'error',
        title: `Backup ${opts.kind === 'scheduled' ? 'automático' : 'manual'} fallido`,
        body: message,
        link: '/settings/company?tab=backups',
      }).catch(() => undefined);

      return { runId, ok: false, error: message };
    } finally {
      runningTenants.delete(tenant.id);
    }
  }

  /**
   * Conserva los `retentionCount` backups más recientes del destino (por
   * nombre de archivo, que lleva timestamp) y borra el resto, junto con sus
   * filas BackupRun. Solo toca archivos `keirost_<schema>_*.zip` — defensa
   * por si el destino apunta a una carpeta compartida.
   */
  static async applyRetention(
    dest: BackupDestination,
    tenantClient: any,
    schemaName: string,
    retentionCount: number,
  ): Promise<number> {
    if (!retentionCount || retentionCount < 1) return 0;
    const prefix = `keirost_${schemaName}_`;
    const files = (await dest.list())
      .filter((f) => f.fileName.startsWith(prefix))
      .sort((a, b) => b.fileName.localeCompare(a.fileName)); // timestamp desc

    const surplus = files.slice(retentionCount);
    if (surplus.length === 0) return 0;

    const removedIds: string[] = [];
    for (const file of surplus) {
      try {
        await dest.remove(file.externalId);
        removedIds.push(file.externalId);
      } catch (e: any) {
        console.warn(`[BackupService] No se pudo borrar ${file.fileName}:`, e?.message);
      }
    }
    if (removedIds.length > 0) {
      await tenantClient
        .delete(schema.backupRuns)
        .where(inArray(schema.backupRuns.externalId, removedIds))
        .catch(() => undefined);
    }
    return removedIds.length;
  }

  /** Últimas ejecuciones, para el historial de la UI. */
  static async listRuns(tenantClient: any, limit = 50): Promise<any[]> {
    return tenantClient
      .select()
      .from(schema.backupRuns)
      .orderBy(desc(schema.backupRuns.startedAt))
      .limit(limit);
  }
}
