-- Bancos: cuentas de la empresa, extractos, conciliación y remesas. Solo añade.
CREATE TABLE IF NOT EXISTS "CompanyBankAccount" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "iban" TEXT,
  "swift" TEXT,
  "bankName" TEXT,
  "currencyId" TEXT REFERENCES "Currency"("id"),
  "accountId" TEXT REFERENCES "ChartOfAccount"("id"),
  -- Con qué se identifica la empresa ante el banco al cobrar por remesa.
  "creditorId" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyBankAccount_default_idx" ON "CompanyBankAccount" ("isDefault") WHERE "isDefault";

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT REFERENCES "CompanyBankAccount"("id");
CREATE INDEX IF NOT EXISTS "Payment_bankAccount_idx" ON "Payment" ("bankAccountId") WHERE "bankAccountId" IS NOT NULL;

-- El mandato de cobro del cliente, sin suponer un país.
ALTER TABLE "BusinessPartner" ADD COLUMN IF NOT EXISTS "mandateRef" TEXT;
ALTER TABLE "BusinessPartner" ADD COLUMN IF NOT EXISTS "mandateDate" DATE;

CREATE TABLE IF NOT EXISTS "BankStatementImport" (
  "id" TEXT PRIMARY KEY,
  "bankAccountId" TEXT NOT NULL REFERENCES "CompanyBankAccount"("id"),
  "fileName" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "addedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "BankStatementLine" (
  "id" TEXT PRIMARY KEY,
  "bankAccountId" TEXT NOT NULL REFERENCES "CompanyBankAccount"("id"),
  "importId" TEXT REFERENCES "BankStatementImport"("id") ON DELETE SET NULL,
  "date" DATE NOT NULL,
  "valueDate" DATE,
  -- Positivo si entra en la cuenta, negativo si sale.
  "amount" NUMERIC(15, 2) NOT NULL,
  "description" TEXT,
  "reference" TEXT,
  "counterparty" TEXT,
  "balance" NUMERIC(15, 2),
  -- Identifica el movimiento: importar otra vez el mismo fichero no lo repite.
  "fingerprint" TEXT NOT NULL,
  -- open | matched | ignored
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "BankStatementLine_fingerprint_idx" ON "BankStatementLine" ("bankAccountId", "fingerprint");
CREATE INDEX IF NOT EXISTS "BankStatementLine_status_idx" ON "BankStatementLine" ("bankAccountId", "status", "date");

CREATE TABLE IF NOT EXISTS "BankMatch" (
  "id" TEXT PRIMARY KEY,
  "statementLineId" TEXT NOT NULL REFERENCES "BankStatementLine"("id") ON DELETE CASCADE,
  "paymentId" TEXT REFERENCES "Payment"("id"),
  "journalEntryId" TEXT,
  -- Con su signo: lo que explica del movimiento.
  "amount" NUMERIC(15, 2) NOT NULL,
  -- Nació de la conciliación: deshacerla lo deshace también.
  "createdFromLine" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "BankMatch_line_idx" ON "BankMatch" ("statementLineId");
-- Un cobro solo se puede conciliar una vez.
CREATE UNIQUE INDEX IF NOT EXISTS "BankMatch_payment_idx" ON "BankMatch" ("paymentId") WHERE "paymentId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "PaymentBatch" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  -- collection: cobros a clientes | payment: pagos a proveedores
  "kind" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL REFERENCES "CompanyBankAccount"("id"),
  -- draft | generated | closed
  "status" TEXT NOT NULL DEFAULT 'draft',
  "chargeDate" DATE NOT NULL,
  "total" NUMERIC(15, 2) NOT NULL DEFAULT 0,
  "exporterId" TEXT,
  "fileName" TEXT,
  "fileType" TEXT,
  "fileContent" TEXT,
  "notes" TEXT,
  "createdBy" TEXT,
  "generatedAt" TIMESTAMP,
  "closedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PaymentBatchLine" (
  "id" TEXT PRIMARY KEY,
  "batchId" TEXT NOT NULL REFERENCES "PaymentBatch"("id") ON DELETE CASCADE,
  "salesInvoiceId" TEXT REFERENCES "SalesInvoice"("id"),
  "purchaseInvoiceId" TEXT REFERENCES "PurchaseInvoice"("id"),
  "partnerId" TEXT NOT NULL REFERENCES "BusinessPartner"("id"),
  "dueDate" DATE NOT NULL,
  "amount" NUMERIC(15, 2) NOT NULL,
  -- Los datos del interlocutor al crearla: un fichero generado no cambia.
  "iban" TEXT,
  "swift" TEXT,
  "mandateRef" TEXT,
  "mandateDate" DATE,
  "paymentId" TEXT REFERENCES "Payment"("id"),
  -- open | returned
  "status" TEXT NOT NULL DEFAULT 'open',
  "returnedAt" TIMESTAMP,
  "returnReason" TEXT
);
CREATE INDEX IF NOT EXISTS "PaymentBatchLine_batch_idx" ON "PaymentBatchLine" ("batchId");
CREATE INDEX IF NOT EXISTS "PaymentBatchLine_sales_idx" ON "PaymentBatchLine" ("salesInvoiceId") WHERE "salesInvoiceId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "PaymentBatchLine_purchase_idx" ON "PaymentBatchLine" ("purchaseInvoiceId") WHERE "purchaseInvoiceId" IS NOT NULL;
