-- CRM básico: etapas del embudo, oportunidades y actividades. Los contactos reutilizan "Contact" (mig 032).
CREATE TABLE IF NOT EXISTS "{{schema}}"."OpportunityStage" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "probability" INTEGER NOT NULL DEFAULT 0 CHECK ("probability" BETWEEN 0 AND 100),
  "kind" TEXT NOT NULL DEFAULT 'open' CHECK ("kind" IN ('open', 'won', 'lost')),
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
INSERT INTO "{{schema}}"."OpportunityStage" ("id", "name", "sortOrder", "probability", "kind") VALUES
  ('stage-new', 'Nueva', 10, 10, 'open'),
  ('stage-qualified', 'Cualificada', 20, 30, 'open'),
  ('stage-proposal', 'Propuesta', 30, 60, 'open'),
  ('stage-won', 'Ganada', 40, 100, 'won'),
  ('stage-lost', 'Perdida', 50, 0, 'lost')
ON CONFLICT ("id") DO NOTHING;
CREATE TABLE IF NOT EXISTS "{{schema}}"."Opportunity" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL REFERENCES "{{schema}}"."BusinessPartner"("id") ON DELETE CASCADE,
  "contactId" TEXT REFERENCES "{{schema}}"."Contact"("id") ON DELETE SET NULL,
  "stageId" TEXT NOT NULL REFERENCES "{{schema}}"."OpportunityStage"("id") ON DELETE RESTRICT,
  "amount" NUMERIC(15, 4) NOT NULL DEFAULT 0,
  "expectedCloseDate" DATE,
  "ownerUserId" TEXT,
  "notes" TEXT,
  "closedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Opportunity_partnerId_idx" ON "{{schema}}"."Opportunity" ("partnerId");
CREATE INDEX IF NOT EXISTS "Opportunity_stageId_idx" ON "{{schema}}"."Opportunity" ("stageId");
CREATE TABLE IF NOT EXISTS "{{schema}}"."CrmActivity" (
  "id" TEXT PRIMARY KEY,
  "type" TEXT NOT NULL CHECK ("type" IN ('call', 'meeting', 'email', 'note', 'task')),
  "subject" TEXT NOT NULL,
  "body" TEXT,
  "partnerId" TEXT REFERENCES "{{schema}}"."BusinessPartner"("id") ON DELETE CASCADE,
  "contactId" TEXT REFERENCES "{{schema}}"."Contact"("id") ON DELETE SET NULL,
  "opportunityId" TEXT REFERENCES "{{schema}}"."Opportunity"("id") ON DELETE CASCADE,
  "dueAt" TIMESTAMP,
  "doneAt" TIMESTAMP,
  "ownerUserId" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmActivity_partnerId_idx" ON "{{schema}}"."CrmActivity" ("partnerId");
CREATE INDEX IF NOT EXISTS "CrmActivity_opportunityId_idx" ON "{{schema}}"."CrmActivity" ("opportunityId");
CREATE INDEX IF NOT EXISTS "CrmActivity_pending_idx" ON "{{schema}}"."CrmActivity" ("dueAt") WHERE "doneAt" IS NULL;
