-- Recuento de inventario y reposición. Solo añade: ninguna fila existente cambia.

-- ── Reposición, en la ficha del artículo ────────────────────────────────────
ALTER TABLE "{{schema}}"."Item" ADD COLUMN IF NOT EXISTS "reorderQty" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "{{schema}}"."Item" ADD COLUMN IF NOT EXISTS "preferredSupplierId" TEXT
  REFERENCES "{{schema}}"."BusinessPartner"("id") ON DELETE SET NULL;
ALTER TABLE "{{schema}}"."Item" ADD COLUMN IF NOT EXISTS "leadTimeDays" INTEGER;

-- ── La salida también dice de qué documento viene, como ya hace la entrada ──
ALTER TABLE "{{schema}}"."GoodsIssue" ADD COLUMN IF NOT EXISTS "sourceDocType" TEXT;
ALTER TABLE "{{schema}}"."GoodsIssue" ADD COLUMN IF NOT EXISTS "sourceDocId" TEXT;

-- ── Recuento ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "{{schema}}"."InventoryCount" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL REFERENCES "{{schema}}"."Warehouse"("id"),
  "zoneId" TEXT REFERENCES "{{schema}}"."WarehouseZone"("id"),
  "categoryId" TEXT REFERENCES "{{schema}}"."Category"("id"),
  "blind" BOOLEAN NOT NULL DEFAULT FALSE,
  -- open | review | closed | cancelled
  "status" TEXT NOT NULL DEFAULT 'open',
  "notes" TEXT,
  "receiptId" TEXT,
  "issueId" TEXT,
  "createdBy" TEXT,
  "closedBy" TEXT,
  "closedAt" TIMESTAMP,
  "cancelledBy" TEXT,
  "cancelledAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryCount_code_key"
  ON "{{schema}}"."InventoryCount" ("code");
CREATE INDEX IF NOT EXISTS "InventoryCount_warehouse_status_idx"
  ON "{{schema}}"."InventoryCount" ("warehouseId", "status");

CREATE TABLE IF NOT EXISTS "{{schema}}"."InventoryCountLine" (
  "id" TEXT PRIMARY KEY,
  "countId" TEXT NOT NULL REFERENCES "{{schema}}"."InventoryCount"("id") ON DELETE CASCADE,
  "itemId" TEXT NOT NULL REFERENCES "{{schema}}"."Item"("id"),
  "zoneId" TEXT REFERENCES "{{schema}}"."WarehouseZone"("id"),
  "batchNum" TEXT,
  -- Lo que decía el sistema al abrir el recuento.
  "expectedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "countedQty" DOUBLE PRECISION,
  -- Lo que decía el sistema al contar: la diferencia se mide contra esto.
  "systemAtCount" DOUBLE PRECISION,
  "countedAt" TIMESTAMP,
  "countedBy" TEXT,
  -- No estaba al abrir: se encontró contando.
  "addedDuringCount" BOOLEAN NOT NULL DEFAULT FALSE,
  -- De qué lote es la diferencia, cuando el sistema no lo puede saber.
  "allocations" JSONB,
  -- Al cerrar: lo que se aplicó y a qué coste medio.
  "appliedQty" DOUBLE PRECISION,
  "unitCost" DECIMAL(18, 6)
);
CREATE INDEX IF NOT EXISTS "InventoryCountLine_count_idx"
  ON "{{schema}}"."InventoryCountLine" ("countId");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryCountLine_identity_key"
  ON "{{schema}}"."InventoryCountLine" ("countId", "itemId", COALESCE("zoneId", ''), COALESCE("batchNum", ''));
