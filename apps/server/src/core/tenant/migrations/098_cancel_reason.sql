-- El motivo de una cancelación, cuando se pide. Hasta ahora solo quedaba en la auditoría. Solo añade.
ALTER TABLE "SalesQuote" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
ALTER TABLE "SalesDeliveryNote" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
ALTER TABLE "SalesInvoice" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
ALTER TABLE "PurchaseDeliveryNote" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
ALTER TABLE "PurchaseInvoice" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
