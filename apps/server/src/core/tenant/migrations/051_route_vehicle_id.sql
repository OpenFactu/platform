-- 051: Añadir vehicleId a Route (faltaba en 039_logistics.sql)
ALTER TABLE "{{schema}}"."Route" ADD COLUMN IF NOT EXISTS "vehicleId" TEXT;
