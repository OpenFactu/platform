-- Un solo estado de envío. Hasta ahora había dos columnas que podían no coincidir
-- (`status` y `preparationStatus`). Gana la más avanzada, salvo en las compras
-- recibidas, donde lo que cuenta es la recepción. Es la misma tabla que
-- `canonicalState` en core/logistics/shipmentLifecycle.ts.
--
-- Los valores antiguos de las filas que cambian quedan en "_ShipmentStateBackup".
CREATE TABLE IF NOT EXISTS "_ShipmentStateBackup" AS
  SELECT id, status, "preparationStatus", now() AS "migratedAt"
  FROM "Shipment"
  WHERE status IS DISTINCT FROM "preparationStatus";

WITH rank(state, position) AS (
  VALUES
    ('pending', 1), ('picking', 2), ('packed', 3), ('ready', 4), ('dispatched', 5),
    ('in_transit', 6), ('out_for_delivery', 7), ('postponed', 7), ('receiving', 8),
    ('received', 9), ('delivered', 10), ('exception', 11), ('returned', 11), ('cancelled', 11)
),
resolved AS (
  SELECT
    s.id,
    CASE
      WHEN s."preparationStatus" = 'received' OR s.status = 'received' THEN 'received'
      WHEN s."preparationStatus" = 'receiving' THEN
        CASE WHEN s.status = 'delivered' THEN 'received' ELSE 'receiving' END
      WHEN p.position IS NULL THEN COALESCE(q.state, 'pending')
      WHEN q.position IS NULL THEN p.state
      WHEN p.position >= q.position THEN p.state
      ELSE q.state
    END AS state
  FROM "Shipment" s
  LEFT JOIN rank p ON p.state = s."preparationStatus"
  LEFT JOIN rank q ON q.state = s.status
)
UPDATE "Shipment" AS s
SET status = r.state, "preparationStatus" = r.state
FROM resolved r
WHERE r.id = s.id
  AND (s.status IS DISTINCT FROM r.state OR s."preparationStatus" IS DISTINCT FROM r.state);

ALTER TABLE "Shipment" ALTER COLUMN "preparationStatus" SET DEFAULT 'pending';
