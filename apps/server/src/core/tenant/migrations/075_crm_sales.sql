-- CRM F1: productos de interés de la oportunidad y enlace presupuesto → oportunidad.
CREATE TABLE IF NOT EXISTS "{{schema}}"."OpportunityLine" (
  "id" TEXT PRIMARY KEY,
  "opportunityId" TEXT NOT NULL REFERENCES "{{schema}}"."Opportunity"("id") ON DELETE CASCADE,
  "itemId" TEXT REFERENCES "{{schema}}"."Item"("id") ON DELETE SET NULL,
  "description" TEXT,
  "quantity" NUMERIC(15, 4) NOT NULL DEFAULT 1,
  "price" NUMERIC(15, 4) NOT NULL DEFAULT 0,
  "discount" NUMERIC(5, 2) NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "OpportunityLine_opp_idx" ON "{{schema}}"."OpportunityLine" ("opportunityId");
ALTER TABLE "{{schema}}"."SalesQuote" ADD COLUMN IF NOT EXISTS "opportunityId" TEXT REFERENCES "{{schema}}"."Opportunity"("id") ON DELETE SET NULL;
ALTER TABLE "{{schema}}"."SalesQuote" ADD COLUMN IF NOT EXISTS "expiryNotifiedAt" TIMESTAMP;
CREATE INDEX IF NOT EXISTS "SalesQuote_opportunityId_idx" ON "{{schema}}"."SalesQuote" ("opportunityId");
