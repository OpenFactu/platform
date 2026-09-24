-- 071: Importador de datos (el "DTW" de Keirost). Tres tablas, todas nuevas:
-- no toca nada de lo que ya hay.
--
-- DataImportJob      un fichero procesado: qué objeto, en qué modo y cómo fue.
-- DataImportJobRow   una fila del fichero y su desenlace. Guarda la fila
--                    original en "raw" porque de ahí salen dos cosas: el CSV
--                    de errores que el usuario corrige y resube, y el
--                    "deshacer" (necesita el id que se creó).
-- DataImportMapping  correspondencia columna→campo guardada con nombre, para
--                    no rehacer el mapeo cada vez que llega el mismo fichero.
--
-- El progreso se guarda aquí y no solo en memoria para que la pantalla lo
-- recupere tras un F5 y para que quede histórico de qué se cargó y cuándo.

CREATE TABLE IF NOT EXISTS "{{schema}}"."DataImportJob" (
  "id" TEXT PRIMARY KEY,
  "objectId" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'insert',
  "dryRun" BOOLEAN NOT NULL DEFAULT FALSE,
  "fileName" TEXT NOT NULL,
  "sheetName" TEXT,
  "mapping" JSONB NOT NULL DEFAULT '{}',
  "matchBy" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "processedRows" INTEGER NOT NULL DEFAULT 0,
  "okRows" INTEGER NOT NULL DEFAULT 0,
  "errorRows" INTEGER NOT NULL DEFAULT 0,
  "skippedRows" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP DEFAULT now(),
  "startedAt" TIMESTAMP,
  "finishedAt" TIMESTAMP,
  "undoneAt" TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "{{schema}}"."DataImportJobRow" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "{{schema}}"."DataImportJob"("id") ON DELETE CASCADE,
  "rowNum" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "action" TEXT,
  "entityId" TEXT,
  "entityCode" TEXT,
  "message" TEXT,
  "raw" JSONB
);

CREATE TABLE IF NOT EXISTS "{{schema}}"."DataImportMapping" (
  "id" TEXT PRIMARY KEY,
  "objectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mapping" JSONB NOT NULL DEFAULT '{}',
  "mode" TEXT,
  "matchBy" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP DEFAULT now()
);

-- El histórico se lista por objeto y por fecha; las filas se piden siempre de
-- un trabajo concreto, y casi siempre filtrando por estado ("enséñame los
-- errores"), que es justo lo que hace el CSV de fallos.
CREATE INDEX IF NOT EXISTS "DataImportJob_object_idx" ON "{{schema}}"."DataImportJob" ("objectId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "DataImportJobRow_job_idx" ON "{{schema}}"."DataImportJobRow" ("jobId", "status");

-- Un mapeo guardado se identifica por su nombre dentro de su objeto: repetirlo
-- debe sobrescribir, no dejar dos "Excel del gestor" que nadie distingue.
CREATE UNIQUE INDEX IF NOT EXISTS "DataImportMapping_object_name_uq" ON "{{schema}}"."DataImportMapping" ("objectId", "name");
