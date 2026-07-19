-- 058: Trazabilidad de lotes por almacén.
-- Hasta ahora ItemBatch solo guardaba una cantidad GLOBAL por lote — la
-- "ubicación" que mostraba la app se deducía del albarán de compra ORIGINAL
-- que trajo el lote, que nunca cambiaba. Un traspaso/entrada/salida/factura
-- que moviera un lote entre almacenes actualizaba el stock agregado
-- (ItemWarehouseStock) pero nunca esta ubicación derivada, dejando la
-- trazabilidad desactualizada en cuanto un lote se movía de su almacén de
-- origen.
--
-- ItemBatchStock guarda la cantidad de cada lote POR almacén (mismo patrón
-- que ItemWarehouseStock), y se mantiene con upserts por delta desde todos
-- los flujos que tocan lotes (traspasos, entradas/salidas, facturas y
-- albaranes de venta/compra, incluidas sus cancelaciones).

CREATE TABLE IF NOT EXISTS "{{schema}}"."ItemBatchStock" (
  "itemId" TEXT NOT NULL REFERENCES "{{schema}}"."Item"("id") ON DELETE CASCADE,
  "batchNum" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL REFERENCES "{{schema}}"."Warehouse"("id") ON DELETE CASCADE,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("itemId", "batchNum", "warehouseId")
);

-- Backfill: siembra la ubicación de cada lote existente a partir de su
-- albarán de compra original (misma fuente que usaba la consulta antigua),
-- con fallback al almacén por defecto del artículo y, si tampoco lo tiene,
-- al almacén marcado como isDefault del tenant — así ningún lote existente
-- desaparece de la vista de inventario tras esta migración.
INSERT INTO "{{schema}}"."ItemBatchStock" ("itemId", "batchNum", "warehouseId", "quantity", "updatedAt")
SELECT
  ib."itemId",
  ib."batchNum",
  COALESCE(
    pdnl."warehouseId",
    i."defaultWarehouseId",
    (SELECT w."id" FROM "{{schema}}"."Warehouse" w WHERE w."isDefault" = TRUE LIMIT 1)
  ) AS "warehouseId",
  ib."quantity",
  CURRENT_TIMESTAMP
FROM "{{schema}}"."ItemBatch" ib
JOIN "{{schema}}"."Item" i ON i."id" = ib."itemId"
LEFT JOIN LATERAL (
  SELECT pdnl2."warehouseId"
  FROM "{{schema}}"."PurchaseDeliveryNoteLineBatch" pdnlb
  JOIN "{{schema}}"."PurchaseDeliveryNoteLine" pdnl2 ON pdnl2."id" = pdnlb."deliveryLineId"
  WHERE pdnlb."batchNum" = ib."batchNum" AND pdnl2."itemId" = ib."itemId"
  LIMIT 1
) pdnl ON TRUE
WHERE ib."quantity" > 0
  AND COALESCE(
    pdnl."warehouseId",
    i."defaultWarehouseId",
    (SELECT w."id" FROM "{{schema}}"."Warehouse" w WHERE w."isDefault" = TRUE LIMIT 1)
  ) IS NOT NULL
ON CONFLICT ("itemId", "batchNum", "warehouseId") DO NOTHING;
