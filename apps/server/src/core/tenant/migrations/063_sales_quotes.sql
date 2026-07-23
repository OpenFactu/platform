-- 063: Presupuestos de venta (SalesQuote / SalesQuoteLine).
-- Clon de SalesOrder/SalesOrderLine SIN campos de entrega (deliveryDate,
-- deliveredQty, almacén/zona — un presupuesto no mueve ni reserva stock),
-- CON validez (validUntil) y ciclo O=Abierto / A=Aceptado / R=Rechazado /
-- X=Cancelado. Aditiva: no toca datos existentes.

CREATE TABLE IF NOT EXISTS "{{schema}}"."SalesQuote" (
  "id" TEXT PRIMARY KEY,
  "seriesId" TEXT NOT NULL REFERENCES "{{schema}}"."DocumentSeries"("id"),
  "docNum" INTEGER NOT NULL,
  "periodId" TEXT NOT NULL REFERENCES "{{schema}}"."AccountingPeriod"("id"),
  "partnerId" TEXT NOT NULL REFERENCES "{{schema}}"."BusinessPartner"("id"),
  "date" TIMESTAMP NOT NULL,
  "documentDate" TIMESTAMP,
  "validUntil" TIMESTAMP,
  "status" TEXT DEFAULT 'O' NOT NULL,
  "billToAddress" TEXT,
  "shipToAddress" TEXT,
  "internalOrderId" TEXT REFERENCES "{{schema}}"."InternalOrder"("id") ON DELETE SET NULL,
  "subtotal" DECIMAL(15, 4) DEFAULT 0 NOT NULL,
  "taxTotal" DECIMAL(15, 4) DEFAULT 0 NOT NULL,
  "total" DECIMAL(15, 4) DEFAULT 0 NOT NULL,
  "taxBreakdown" TEXT,
  "salesAgentId" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "{{schema}}"."SalesQuoteLine" (
  "id" TEXT PRIMARY KEY,
  "quoteId" TEXT NOT NULL REFERENCES "{{schema}}"."SalesQuote"("id") ON DELETE CASCADE,
  "lineNum" INTEGER NOT NULL,
  "itemId" TEXT NOT NULL REFERENCES "{{schema}}"."Item"("id"),
  "quantity" DECIMAL(12, 4) NOT NULL,
  "price" DECIMAL(15, 4) NOT NULL,
  "taxGroupId" TEXT REFERENCES "{{schema}}"."TaxGroup"("id"),
  "lineTotal" DECIMAL(15, 4) NOT NULL,
  "uomId" TEXT REFERENCES "{{schema}}"."UnitOfMeasure"("id"),
  "uomFactor" DECIMAL(12, 4) DEFAULT 1.0000,
  "pluginData" JSONB DEFAULT '{}',
  "description" TEXT,
  "discountRate" DECIMAL(5, 2) DEFAULT 0,
  "discountAmount" DECIMAL(15, 4) DEFAULT 0,
  "taxRate" DECIMAL(5, 2),
  "taxAmount" DECIMAL(15, 4),
  "withholdingRate" DECIMAL(5, 2),
  "withholdingAmount" DECIMAL(15, 4),
  "costCenterId" TEXT,
  "profitCenterId" TEXT,
  "internalOrderId" TEXT
);

-- Enlace Presupuesto → Pedido (nullable: los pedidos existentes no se tocan).
ALTER TABLE "{{schema}}"."SalesOrder"
  ADD COLUMN IF NOT EXISTS "quoteId" TEXT REFERENCES "{{schema}}"."SalesQuote"("id");
