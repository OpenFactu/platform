/**
 * Cron de backups automáticos. Cada 15 min recorre los tenants, lee su
 * sección `backup` de SystemConfig y, si toca (frecuencia diaria/semanal a
 * una hora dada), lanza `BackupService.runBackup`.
 *
 * La marca de "última ejecución" es la propia tabla `BackupRun`: un backup
 * está pendiente si existe un instante programado <= ahora sin ninguna fila
 * `kind='scheduled'` posterior a ese instante. Las filas con error también
 * cuentan como intento (el fallo ya notificó al tenant) — así no se
 * reintenta en bucle cada tick. Robusto ante reinicios del server: si el
 * proceso estaba caído a la hora programada, el primer tick lo recupera.
 *
 * Implementado con setInterval para evitar añadir node-cron (mismo patrón
 * que periodCloseCron.ts). La hora configurada es hora local del servidor.
 */
import { desc, eq } from 'drizzle-orm';
import { ClientFactory } from '../tenant/ClientFactory';
import * as schema from '../../db/schema';
import { getConfigSection } from '../config/systemConfigSection';
import { BACKUP_DEFAULTS, type BackupConfig } from '../backup/backupConfig';
import { BackupService } from '../backup/BackupService';

const INTERVAL_MS = 15 * 60 * 1000; // 15 min
const WARMUP_MS = 60 * 1000;

let started = false;

/**
 * Último instante programado <= now según la config (hora local del server).
 */
export function lastScheduledAt(now: Date, cfg: BackupConfig): Date {
  const at = new Date(now);
  at.setHours(cfg.hour, 0, 0, 0);
  if (cfg.frequency === 'daily') {
    if (at > now) at.setDate(at.getDate() - 1);
    return at;
  }
  // weekly: retroceder hasta el último cfg.weekday (0=domingo)
  const diff = (at.getDay() - cfg.weekday + 7) % 7;
  at.setDate(at.getDate() - diff);
  if (at > now) at.setDate(at.getDate() - 7);
  return at;
}

async function isDue(tenantDb: any, cfg: BackupConfig, now: Date): Promise<boolean> {
  const scheduledAt = lastScheduledAt(now, cfg);
  const [lastRun] = await tenantDb
    .select({ startedAt: schema.backupRuns.startedAt })
    .from(schema.backupRuns)
    .where(eq(schema.backupRuns.kind, 'scheduled'))
    .orderBy(desc(schema.backupRuns.startedAt))
    .limit(1);
  return !lastRun || new Date(lastRun.startedAt) < scheduledAt;
}

async function runOnce() {
  const now = new Date();
  try {
    const publicDb = ClientFactory.getClient('public');
    const tenantsList = await publicDb.select().from(schema.tenants);

    for (const tenant of tenantsList) {
      try {
        const tenantDb = ClientFactory.getClient(tenant.schemaName);
        const cfg = await getConfigSection<BackupConfig>(tenantDb, 'backup', BACKUP_DEFAULTS);
        if (!cfg.enabled) continue;
        if (BackupService.isRunning(tenant.id)) continue;
        if (!(await isDue(tenantDb, cfg, now))) continue;

        console.log(`[backupCron] Lanzando backup programado de ${tenant.schemaName}...`);
        const result = await BackupService.runBackup(tenant, { kind: 'scheduled' });
        console.log(
          `[backupCron] Backup de ${tenant.schemaName} ${result.ok ? 'completado' : `fallido: ${result.error}`}`,
        );
      } catch (err: any) {
        console.warn(`[backupCron] Error procesando tenant ${tenant.schemaName}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[backupCron] Fallo global:', err.message);
  }
}

export function startBackupCron() {
  if (started) return;
  started = true;
  setTimeout(() => {
    runOnce();
    setInterval(runOnce, INTERVAL_MS);
  }, WARMUP_MS);
  console.log('[backupCron] Scheduler armado (warmup 60s, intervalo 15min)');
}
