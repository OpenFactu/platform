-- 054: Añadir columnas faltantes a Shipment
-- El schema de Drizzle las define pero la migración 039 no las creó.
-- Esto causaba errores al consultar preparationStatus, sourceDocType, etc.

ALTER TABLE "{{schema}}"."Shipment" ADD COLUMN IF NOT EXISTS "carrierAccountId" TEXT;
ALTER TABLE "{{schema}}"."Shipment" ADD COLUMN IF NOT EXISTS "preparationStatus" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "{{schema}}"."Shipment" ADD COLUMN IF NOT EXISTS "sourceDocType" TEXT;
ALTER TABLE "{{schema}}"."Shipment" ADD COLUMN IF NOT EXISTS "sourceDocId" TEXT;
ALTER TABLE "{{schema}}"."Shipment" ADD COLUMN IF NOT EXISTS "sourceOrderType" TEXT;
ALTER TABLE "{{schema}}"."Shipment" ADD COLUMN IF NOT EXISTS "sourceOrderId" TEXT;
ALTER TABLE "{{schema}}"."Shipment" ADD COLUMN IF NOT EXISTS "preparedAt" TIMESTAMP;
ALTER TABLE "{{schema}}"."Shipment" ADD COLUMN IF NOT EXISTS "preparedByUserId" TEXT;
ALTER TABLE "{{schema}}"."Shipment" ADD COLUMN IF NOT EXISTS "dispatchedAt" TIMESTAMP;
ALTER TABLE "{{schema}}"."Shipment" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP;
ALTER TABLE "{{schema}}"."Shipment" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'delivery';
ALTER TABLE "{{schema}}"."Shipment" ADD COLUMN IF NOT EXISTS "returnWarehouseId" TEXT;
ALTER TABLE "{{schema}}"."Shipment" ADD COLUMN IF NOT EXISTS "recipientName" TEXT;
ALTER TABLE "{{schema}}"."Shipment" ADD COLUMN IF NOT EXISTS "recipientEmail" TEXT;
ALTER TABLE "{{schema}}"."Shipment" ADD COLUMN IF NOT EXISTS "recipientPhone" TEXT;
