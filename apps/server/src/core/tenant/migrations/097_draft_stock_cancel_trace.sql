-- El stock de una factura se mueve al asentarla. Solo añade. Lo que ya existe queda en TRUE,
-- porque ya lo movió al crearse; las nuevas entran en FALSE. Y cada documento recuerda quién lo
-- canceló y cuándo. Los lotes elegidos en un borrador guardan su caducidad para cuando entren.
ALTER TABLE "SalesInvoice" ADD COLUMN IF NOT EXISTS "stockMoved" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "PurchaseInvoice" ADD COLUMN IF NOT EXISTS "stockMoved" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "SalesInvoiceLineBatch" ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP;
ALTER TABLE "PurchaseInvoiceLineBatch" ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP;

ALTER TABLE "SalesQuote" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP;
ALTER TABLE "SalesQuote" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;
ALTER TABLE "SalesDeliveryNote" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP;
ALTER TABLE "SalesDeliveryNote" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;
ALTER TABLE "SalesInvoice" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP;
ALTER TABLE "SalesInvoice" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;
ALTER TABLE "PurchaseDeliveryNote" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP;
ALTER TABLE "PurchaseDeliveryNote" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;
ALTER TABLE "PurchaseInvoice" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP;
ALTER TABLE "PurchaseInvoice" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;
