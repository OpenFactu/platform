-- 055: Crear tablas de logística faltantes (Vehicle, PickingTask)
-- Definidas en schema.ts pero nunca creadas en migraciones.
-- Esto causaba errores al listar vehículos y al consultar picking tasks.

-- ── Vehículos ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "{{schema}}"."Vehicle" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "plate" TEXT NOT NULL UNIQUE,
  "brand" TEXT,
  "model" TEXT,
  "capacityKg" DOUBLE PRECISION,
  "capacityM3" DOUBLE PRECISION,
  "status" TEXT NOT NULL DEFAULT 'active',
  "defaultDriverEmployeeId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Vehicle_status_idx" ON "{{schema}}"."Vehicle" ("status");

-- ── Tareas de picking ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "{{schema}}"."PickingTask" (
  "id" TEXT PRIMARY KEY,
  "docType" TEXT NOT NULL,
  "docId" TEXT NOT NULL,
  "docLineId" TEXT,
  "itemId" TEXT,
  "warehouseId" TEXT,
  "zoneId" TEXT,
  "batchNumber" TEXT,
  "requestedQty" DOUBLE PRECISION NOT NULL,
  "pickedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "shipmentId" TEXT,
  "assignedUserId" TEXT,
  "pickedByUserId" TEXT,
  "pickedAt" TIMESTAMP,
  "notes" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "PickingTask_shipment_idx" ON "{{schema}}"."PickingTask" ("shipmentId");
CREATE INDEX IF NOT EXISTS "PickingTask_status_idx" ON "{{schema}}"."PickingTask" ("status");
CREATE INDEX IF NOT EXISTS "PickingTask_doc_idx" ON "{{schema}}"."PickingTask" ("docType", "docId");
