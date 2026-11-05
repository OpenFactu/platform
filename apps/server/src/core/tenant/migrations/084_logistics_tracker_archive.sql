-- Token propio del dispositivo que envía la posición. Hasta ahora se usaba el
-- mismo del enlace que recibe el cliente por correo, con lo que cualquier
-- destinatario podía falsear dónde está su reparto. Los enlaces ya enviados
-- siguen valiendo: `reportToken` no cambia.
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "trackerToken" TEXT;
UPDATE "Shipment"
  SET "trackerToken" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  WHERE "trackerToken" IS NULL;
ALTER TABLE "Shipment"
  ALTER COLUMN "trackerToken" SET DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  ALTER COLUMN "trackerToken" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Shipment_trackerToken_key" ON "Shipment" ("trackerToken");

-- Lo que tiene historia no se borra: se archiva.
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP;
ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP;
