-- La etiqueta del transportista es un PDF entero: en su propia tabla, para que no viaje
-- en cada listado de envíos. Sustituye a la columna "carrierLabel", que nunca llegó a
-- guardar nada.
CREATE TABLE IF NOT EXISTS "ShipmentCarrierLabel" (
  "shipmentId" TEXT PRIMARY KEY REFERENCES "Shipment"(id) ON DELETE CASCADE,
  pdf TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "Shipment" DROP COLUMN IF EXISTS "carrierLabel";
