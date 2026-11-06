-- Franja en la que el cliente puede recibir el envío, como HH:mm.
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "timeWindowFrom" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "timeWindowTo" TEXT;
