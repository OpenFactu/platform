-- Referencia externa de la factura: en compras, el número de la factura del
-- proveedor (obligatorio al registrarla); en ventas, la referencia del cliente
-- (su número de pedido, opcional).
ALTER TABLE "{{schema}}"."PurchaseInvoice" ADD COLUMN IF NOT EXISTS "externalRef" TEXT;
ALTER TABLE "{{schema}}"."SalesInvoice" ADD COLUMN IF NOT EXISTS "externalRef" TEXT;

-- Para detectar la misma factura de proveedor registrada dos veces.
CREATE INDEX IF NOT EXISTS "PurchaseInvoice_partner_externalRef_idx"
  ON "{{schema}}"."PurchaseInvoice" ("partnerId", "externalRef");
