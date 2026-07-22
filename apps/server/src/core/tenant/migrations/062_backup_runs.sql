-- 062: Tabla BackupRun — historial de backups (manuales y programados) por
-- tenant. Cada fila registra una ejecución: destino (local/gdrive/onedrive),
-- archivo generado (fileName + externalId en el destino), tamaño, estado y
-- error si lo hubo. El cron de backups usa esta tabla como marca de "última
-- ejecución programada" para no duplicar ni reintentar en bucle.

CREATE TABLE IF NOT EXISTS "{{schema}}"."BackupRun" (
  "id" TEXT PRIMARY KEY,
  "kind" TEXT NOT NULL DEFAULT 'scheduled',
  "status" TEXT NOT NULL DEFAULT 'running',
  "destination" TEXT NOT NULL,
  "fileName" TEXT,
  "externalId" TEXT,
  "sizeBytes" BIGINT,
  "includeUploads" BOOLEAN NOT NULL DEFAULT TRUE,
  "error" TEXT,
  "createdByUserId" TEXT,
  "startedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "BackupRun_startedAt_idx"
  ON "{{schema}}"."BackupRun" ("startedAt");
