-- Coste del artículo: precio medio ponderado en toda la empresa, y el coste con el que
-- salió cada línea, que ya no cambia aunque luego cambie la media.
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "averageCost" DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "lastPurchaseCost" DECIMAL(18,6);
ALTER TABLE "SalesInvoiceLine" ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(18,6);
ALTER TABLE "SalesDeliveryNoteLine" ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(18,6);
ALTER TABLE "PurchaseInvoiceLine" ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(18,6);
ALTER TABLE "PurchaseDeliveryNoteLine" ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(18,6);
ALTER TABLE "GoodsReceiptLine" ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(18,6);
ALTER TABLE "GoodsIssueLine" ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(18,6);

-- Por qué cambió la media de cada artículo.
CREATE TABLE IF NOT EXISTS "ItemCostMovement" (
  "id" TEXT PRIMARY KEY,
  "itemId" TEXT NOT NULL REFERENCES "Item"("id"),
  "kind" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "stockBefore" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "costBefore" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "costAfter" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "docType" TEXT,
  "docId" TEXT,
  "lineId" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "ItemCostMovement_item_idx" ON "ItemCostMovement" ("itemId", "createdAt");

-- Lo existente arranca con el último precio de compra de cada artículo.
WITH purchases AS (
  SELECT l."itemId", h."date",
    (l."quantity" * l."price" - COALESCE(l."discountAmount", 0))
      / NULLIF(l."quantity" * COALESCE(l."uomFactor", 1), 0) AS "cost"
  FROM "PurchaseInvoiceLine" l
  JOIN "PurchaseInvoice" h ON h."id" = l."invoiceId"
  WHERE h."status" NOT IN ('D', 'X') AND l."quantity" > 0
  UNION ALL
  SELECT l."itemId", h."date",
    (l."quantity" * l."price" - COALESCE(l."discountAmount", 0))
      / NULLIF(l."quantity" * COALESCE(l."uomFactor", 1), 0) AS "cost"
  FROM "PurchaseDeliveryNoteLine" l
  JOIN "PurchaseDeliveryNote" h ON h."id" = l."deliveryId"
  WHERE h."status" <> 'X' AND l."quantity" > 0
),
latest AS (
  SELECT DISTINCT ON ("itemId") "itemId", ROUND("cost", 6) AS "cost"
  FROM purchases
  WHERE "cost" IS NOT NULL AND "cost" > 0
  ORDER BY "itemId", "date" DESC
)
UPDATE "Item" i
SET "averageCost" = latest."cost", "lastPurchaseCost" = latest."cost"
FROM latest
WHERE latest."itemId" = i."id" AND i."averageCost" = 0;

INSERT INTO "ItemCostMovement" ("id", "itemId", "kind", "unitCost", "stockBefore", "costAfter")
SELECT 'opening-' || i."id", i."id", 'opening', i."averageCost", i."stock", i."averageCost"
FROM "Item" i
WHERE i."averageCost" > 0
ON CONFLICT ("id") DO NOTHING;

-- Las salidas que ya había: con ese coste, para que sus márgenes no dependan de la media
-- futura. Un abono que no devolvió mercancía no devuelve coste.
UPDATE "SalesInvoiceLine" l
SET "unitCost" = CASE WHEN l."quantity" < 0 AND NOT l."stockReturned" THEN 0 ELSE i."averageCost" END
FROM "Item" i
WHERE i."id" = l."itemId" AND l."unitCost" IS NULL AND i."averageCost" > 0;

UPDATE "SalesDeliveryNoteLine" l
SET "unitCost" = i."averageCost"
FROM "Item" i
WHERE i."id" = l."itemId" AND l."unitCost" IS NULL AND i."averageCost" > 0;
