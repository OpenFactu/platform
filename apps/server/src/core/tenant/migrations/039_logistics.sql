-- Módulo de logística: cajas como artículos + acopios + paquetes + rutas + envíos + tracking
-- Todo opcional: el front solo lo usa si `flags.logisticsEnabled = true`.

-- 1. Extender Item con kind y dimensiones de caja.
ALTER TABLE "{{schema}}"."Item" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'product';
ALTER TABLE "{{schema}}"."Item" ADD COLUMN IF NOT EXISTS "boxLengthMm" INTEGER;
ALTER TABLE "{{schema}}"."Item" ADD COLUMN IF NOT EXISTS "boxWidthMm" INTEGER;
ALTER TABLE "{{schema}}"."Item" ADD COLUMN IF NOT EXISTS "boxHeightMm" INTEGER;
ALTER TABLE "{{schema}}"."Item" ADD COLUMN IF NOT EXISTS "boxMaxWeightKg" DOUBLE PRECISION;
ALTER TABLE "{{schema}}"."Item" ADD COLUMN IF NOT EXISTS "boxTareWeightKg" DOUBLE PRECISION;

-- 2. Acopios (staging areas) — zonas físicas donde se agrupan paquetes.
CREATE TABLE IF NOT EXISTS "{{schema}}"."StagingArea" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "warehouseId" TEXT REFERENCES "{{schema}}"."Warehouse"("id") ON DELETE SET NULL,
  "partnerId" TEXT,
  "platformId" TEXT,
  "address" TEXT,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "notes" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "{{schema}}"."StagingAreaItem" (
  "id" TEXT PRIMARY KEY,
  "stagingAreaId" TEXT NOT NULL REFERENCES "{{schema}}"."StagingArea"("id") ON DELETE CASCADE,
  "itemId" TEXT NOT NULL REFERENCES "{{schema}}"."Item"("id") ON DELETE CASCADE,
  "expectedQty" DOUBLE PRECISION,
  "notes" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Envíos.
CREATE TABLE IF NOT EXISTS "{{schema}}"."Shipment" (
  "id" TEXT PRIMARY KEY,
  "deliveryNoteId" TEXT,
  "carrier" TEXT NOT NULL DEFAULT 'propio',
  "carrierAccountId" TEXT,
  "trackingNumber" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "preparationStatus" TEXT NOT NULL DEFAULT 'draft',
  "sourceDocType" TEXT,
  "sourceDocId" TEXT,
  "sourceOrderType" TEXT,
  "sourceOrderId" TEXT,
  "preparedAt" TIMESTAMP,
  "preparedByUserId" TEXT,
  "dispatchedAt" TIMESTAMP,
  "receivedAt" TIMESTAMP,
  "driverName" TEXT,
  "driverPhone" TEXT,
  "vehiclePlate" TEXT,
  "reportToken" TEXT NOT NULL UNIQUE,
  "destinationAddress" TEXT,
  "destinationLat" DOUBLE PRECISION,
  "destinationLng" DOUBLE PRECISION,
  "lastLat" DOUBLE PRECISION,
  "lastLng" DOUBLE PRECISION,
  "lastLocationAt" TIMESTAMP,
  "estimatedDelivery" TIMESTAMP,
  "deliveredAt" TIMESTAMP,
  "kind" TEXT NOT NULL DEFAULT 'delivery',
  "returnWarehouseId" TEXT,
  "recipientName" TEXT,
  "recipientEmail" TEXT,
  "recipientPhone" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "{{schema}}"."ShipmentEvent" (
  "id" TEXT PRIMARY KEY,
  "shipmentId" TEXT NOT NULL REFERENCES "{{schema}}"."Shipment"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL DEFAULT 'note',
  "status" TEXT,
  "description" TEXT,
  "location" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "{{schema}}"."ShipmentPosition" (
  "id" TEXT PRIMARY KEY,
  "shipmentId" TEXT NOT NULL REFERENCES "{{schema}}"."Shipment"("id") ON DELETE CASCADE,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "speedKmh" DOUBLE PRECISION,
  "heading" DOUBLE PRECISION,
  "accuracyMeters" DOUBLE PRECISION,
  "reportedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Paquetes (cajas con contenido).
CREATE TABLE IF NOT EXISTS "{{schema}}"."Package" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "deliveryNoteId" TEXT,
  "shipmentId" TEXT REFERENCES "{{schema}}"."Shipment"("id") ON DELETE SET NULL,
  "boxItemId" TEXT REFERENCES "{{schema}}"."Item"("id") ON DELETE SET NULL,
  "stagingAreaId" TEXT REFERENCES "{{schema}}"."StagingArea"("id") ON DELETE SET NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "weightKg" DOUBLE PRECISION,
  "notes" TEXT,
  "pickedAt" TIMESTAMP,
  "pickedByUserId" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sealedAt" TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "{{schema}}"."PackageLine" (
  "id" TEXT PRIMARY KEY,
  "packageId" TEXT NOT NULL REFERENCES "{{schema}}"."Package"("id") ON DELETE CASCADE,
  "itemId" TEXT NOT NULL REFERENCES "{{schema}}"."Item"("id"),
  "quantity" DOUBLE PRECISION NOT NULL,
  "sourceLineId" TEXT
);

-- 5. Rutas.
CREATE TABLE IF NOT EXISTS "{{schema}}"."Route" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "plannedDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "driverName" TEXT,
  "driverPhone" TEXT,
  "vehiclePlate" TEXT,
  "vehicleId" TEXT,
  "driverEmployeeId" TEXT,
  "startedAt" TIMESTAMP,
  "completedAt" TIMESTAMP,
  "notes" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "{{schema}}"."RouteStop" (
  "id" TEXT PRIMARY KEY,
  "routeId" TEXT NOT NULL REFERENCES "{{schema}}"."Route"("id") ON DELETE CASCADE,
  "sequence" INTEGER NOT NULL,
  "shipmentId" TEXT REFERENCES "{{schema}}"."Shipment"("id") ON DELETE SET NULL,
  "address" TEXT,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "plannedAt" TIMESTAMP,
  "arrivedAt" TIMESTAMP,
  "departedAt" TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "notes" TEXT
);

-- 6. Índices útiles.
CREATE INDEX IF NOT EXISTS "Shipment_status_idx" ON "{{schema}}"."Shipment" ("status");
CREATE INDEX IF NOT EXISTS "Shipment_deliveryNoteId_idx" ON "{{schema}}"."Shipment" ("deliveryNoteId");
CREATE INDEX IF NOT EXISTS "Shipment_reportToken_idx" ON "{{schema}}"."Shipment" ("reportToken");
CREATE INDEX IF NOT EXISTS "ShipmentPosition_shipment_time_idx" ON "{{schema}}"."ShipmentPosition" ("shipmentId", "reportedAt" DESC);
CREATE INDEX IF NOT EXISTS "Package_shipmentId_idx" ON "{{schema}}"."Package" ("shipmentId");
CREATE INDEX IF NOT EXISTS "Package_status_idx" ON "{{schema}}"."Package" ("status");
CREATE INDEX IF NOT EXISTS "RouteStop_routeId_seq_idx" ON "{{schema}}"."RouteStop" ("routeId", "sequence");
CREATE INDEX IF NOT EXISTS "Route_status_idx" ON "{{schema}}"."Route" ("status");
