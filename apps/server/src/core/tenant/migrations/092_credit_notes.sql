-- Abonos: una factura con un tipo rectificativo apunta a la que corrige, y cada línea
-- recuerda si la mercancía volvió, para deshacerlo al cancelar el borrador.
ALTER TABLE "SalesInvoice" ADD COLUMN IF NOT EXISTS "rectifiesInvoiceId" TEXT REFERENCES "SalesInvoice"("id");
ALTER TABLE "PurchaseInvoice" ADD COLUMN IF NOT EXISTS "rectifiesInvoiceId" TEXT REFERENCES "PurchaseInvoice"("id");
ALTER TABLE "SalesInvoiceLine" ADD COLUMN IF NOT EXISTS "stockReturned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PurchaseInvoiceLine" ADD COLUMN IF NOT EXISTS "stockReturned" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "SalesInvoice_rectifiesInvoiceId_idx" ON "SalesInvoice" ("rectifiesInvoiceId");
CREATE INDEX IF NOT EXISTS "PurchaseInvoice_rectifiesInvoiceId_idx" ON "PurchaseInvoice" ("rectifiesInvoiceId");
