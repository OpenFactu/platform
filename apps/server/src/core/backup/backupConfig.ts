/**
 * Config de backups automáticos por tenant — sección `backup` de
 * `systemConfigs` (via `systemConfigSection.ts`, montada en `api/config.ts`
 * como GET/PUT /api/config/backup).
 */

export interface BackupConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  /** Hora local del servidor (0-23) a la que toca el backup. */
  hour: number;
  /** Día de la semana (0=domingo … 6=sábado), solo para frequency=weekly. */
  weekday: number;
  destination: 'local' | 'gdrive' | 'onedrive';
  /** Nº de backups a conservar en el destino; los más antiguos se borran. */
  retentionCount: number;
  includeUploads: boolean;
}

export const BACKUP_DEFAULTS: BackupConfig = {
  enabled: false,
  frequency: 'daily',
  hour: 3,
  weekday: 0,
  destination: 'local',
  retentionCount: 7,
  includeUploads: true,
};
