-- Números correlativos de logística: un contador por prefijo y año.
CREATE TABLE IF NOT EXISTS "LogisticsCounter" (
  "key" TEXT PRIMARY KEY,
  "value" INTEGER NOT NULL DEFAULT 0
);

-- Número propio del envío. `trackingNumber` queda para el del transportista.
-- Los envíos que ya existen se numeran por fecha de creación.
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "code" TEXT;
WITH numbered AS (
  SELECT
    id,
    to_char("createdAt", 'YYYY') AS year,
    row_number() OVER (PARTITION BY to_char("createdAt", 'YYYY') ORDER BY "createdAt", id) AS n
  FROM "Shipment"
  WHERE "code" IS NULL
)
UPDATE "Shipment" AS s
SET "code" = 'ENV-' || numbered.year || '-' || lpad(numbered.n::text, 5, '0')
FROM numbered
WHERE numbered.id = s.id;
INSERT INTO "LogisticsCounter" ("key", "value")
  SELECT 'ENV-' || substr("code", 5, 4), max(substr("code", 10)::int)
  FROM "Shipment"
  WHERE "code" ~ '^ENV-[0-9]{4}-[0-9]+$'
  GROUP BY 1
ON CONFLICT ("key") DO UPDATE SET "value" = GREATEST("LogisticsCounter"."value", EXCLUDED."value");
CREATE UNIQUE INDEX IF NOT EXISTS "Shipment_code_key" ON "Shipment" ("code");

-- Lo que faltó al preparar y ya se corrigió en el albarán. Con valor, la falta
-- está aplicada y la tarea no se puede cambiar.
ALTER TABLE "PickingTask" ADD COLUMN IF NOT EXISTS "shortageQty" DOUBLE PRECISION;
