-- Límite de crédito, reclamación de impagos y facturas recurrentes. Solo añade.
ALTER TABLE "BusinessPartner" ADD COLUMN IF NOT EXISTS "creditLimit" DECIMAL(15,2);
ALTER TABLE "BusinessPartner" ADD COLUMN IF NOT EXISTS "dunningExcluded" BOOLEAN NOT NULL DEFAULT FALSE;

-- Cada reclamación enviada a un cliente. Las que fallan se quedan, pero no suben de nivel.
CREATE TABLE IF NOT EXISTS "DunningLetter" (
  "id" TEXT PRIMARY KEY,
  "partnerId" TEXT NOT NULL REFERENCES "BusinessPartner"("id"),
  "level" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'sending',
  "toAddress" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "total" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "auto" BOOLEAN NOT NULL DEFAULT FALSE,
  "error" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "sentAt" TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DunningLetter_partner_idx" ON "DunningLetter" ("partnerId", "createdAt");
-- De dos envíos a la vez al mismo cliente, solo entra uno.
CREATE UNIQUE INDEX IF NOT EXISTS "DunningLetter_sending_idx" ON "DunningLetter" ("partnerId") WHERE "status" = 'sending';

-- Las facturas que iban en cada reclamación y el nivel con el que salieron.
CREATE TABLE IF NOT EXISTS "DunningLetterLine" (
  "id" TEXT PRIMARY KEY,
  "letterId" TEXT NOT NULL REFERENCES "DunningLetter"("id") ON DELETE CASCADE,
  "invoiceId" TEXT NOT NULL REFERENCES "SalesInvoice"("id"),
  "level" INTEGER NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "dueDate" DATE,
  "daysOverdue" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "DunningLetterLine_invoice_idx" ON "DunningLetterLine" ("invoiceId");
CREATE INDEX IF NOT EXISTS "DunningLetterLine_letter_idx" ON "DunningLetterLine" ("letterId");

-- Una factura que se repite. Las fechas salen siempre de "startDate", para que un día 31
-- siga siendo fin de mes después de pasar por febrero.
CREATE TABLE IF NOT EXISTS "RecurringDocument" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "docType" TEXT NOT NULL DEFAULT 'SINV',
  "partnerId" TEXT NOT NULL REFERENCES "BusinessPartner"("id"),
  "seriesId" TEXT,
  "warehouseId" TEXT,
  "header" JSONB NOT NULL DEFAULT '{}',
  "lines" JSONB NOT NULL DEFAULT '[]',
  "frequency" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "nextDate" DATE,
  "endDate" DATE,
  "status" TEXT NOT NULL DEFAULT 'active',
  "autoPost" BOOLEAN NOT NULL DEFAULT FALSE,
  "autoSend" BOOLEAN NOT NULL DEFAULT FALSE,
  "lastError" TEXT,
  "lastErrorAt" TIMESTAMP,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "RecurringDocument_due_idx" ON "RecurringDocument" ("status", "nextDate");

-- Lo generado por periodo. El índice único es lo que impide generar dos veces el mismo.
CREATE TABLE IF NOT EXISTS "RecurringDocumentRun" (
  "id" TEXT PRIMARY KEY,
  "recurringId" TEXT NOT NULL REFERENCES "RecurringDocument"("id") ON DELETE CASCADE,
  "periodDate" DATE NOT NULL,
  "documentId" TEXT NOT NULL,
  "docNum" INTEGER,
  "note" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "RecurringDocumentRun_period_idx" ON "RecurringDocumentRun" ("recurringId", "periodDate");
