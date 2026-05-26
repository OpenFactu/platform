-- 052: Añadir columnas faltantes a StagingArea (partnerId, platformId, lat, lng)
ALTER TABLE "{{schema}}"."StagingArea" ADD COLUMN IF NOT EXISTS "partnerId" TEXT;
ALTER TABLE "{{schema}}"."StagingArea" ADD COLUMN IF NOT EXISTS "platformId" TEXT;
ALTER TABLE "{{schema}}"."StagingArea" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;
ALTER TABLE "{{schema}}"."StagingArea" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;
