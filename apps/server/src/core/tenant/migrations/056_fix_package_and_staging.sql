-- 056_fix_package_and_staging.sql
-- Arregla columnas faltantes en Package y tabla StagingAreaItem

-- 1. Agregar pickedAt y pickedByUserId a Package
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = '{{schema}}' AND table_name = 'Package' AND column_name = 'pickedAt'
  ) THEN
    ALTER TABLE "{{schema}}"."Package" ADD COLUMN "pickedAt" TIMESTAMP;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = '{{schema}}' AND table_name = 'Package' AND column_name = 'pickedByUserId'
  ) THEN
    ALTER TABLE "{{schema}}"."Package" ADD COLUMN "pickedByUserId" TEXT;
  END IF;
END $$;

-- 2. Crear StagingAreaItem si no existe
CREATE TABLE IF NOT EXISTS "{{schema}}"."StagingAreaItem" (
  "id" TEXT PRIMARY KEY,
  "stagingAreaId" TEXT NOT NULL REFERENCES "{{schema}}"."StagingArea"("id") ON DELETE CASCADE,
  "itemId" TEXT NOT NULL REFERENCES "{{schema}}"."Item"("id") ON DELETE CASCADE,
  "expectedQty" DOUBLE PRECISION,
  "notes" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
