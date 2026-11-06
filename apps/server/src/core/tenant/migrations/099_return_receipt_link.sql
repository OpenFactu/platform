-- La entrada de una devolución de logística recuerda de qué albarán y de qué línea viene, para que
-- abono, factura y cancelación sepan lo que ya ha vuelto. Solo añade.
ALTER TABLE "GoodsReceipt" ADD COLUMN IF NOT EXISTS "sourceDocType" TEXT;
ALTER TABLE "GoodsReceipt" ADD COLUMN IF NOT EXISTS "sourceDocId" TEXT;
ALTER TABLE "GoodsReceiptLine" ADD COLUMN IF NOT EXISTS "sourceLineId" TEXT;
CREATE INDEX IF NOT EXISTS "GoodsReceipt_source_idx" ON "GoodsReceipt" ("sourceDocId") WHERE "sourceDocId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "GoodsReceiptLine_source_idx" ON "GoodsReceiptLine" ("sourceLineId") WHERE "sourceLineId" IS NOT NULL;
