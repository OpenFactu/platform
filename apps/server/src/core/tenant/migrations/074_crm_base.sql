-- CRM F0: origen, motivo de pérdida, última actividad e historial de etapas.
ALTER TABLE "{{schema}}"."Opportunity" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "{{schema}}"."Opportunity" ADD COLUMN IF NOT EXISTS "lostReason" TEXT;
ALTER TABLE "{{schema}}"."Opportunity" ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP;
CREATE TABLE IF NOT EXISTS "{{schema}}"."OpportunityStageHistory" (
  "id" TEXT PRIMARY KEY,
  "opportunityId" TEXT NOT NULL REFERENCES "{{schema}}"."Opportunity"("id") ON DELETE CASCADE,
  "fromStageId" TEXT REFERENCES "{{schema}}"."OpportunityStage"("id") ON DELETE SET NULL,
  "toStageId" TEXT REFERENCES "{{schema}}"."OpportunityStage"("id") ON DELETE SET NULL,
  "userId" TEXT,
  "changedAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "OpportunityStageHistory_opp_idx" ON "{{schema}}"."OpportunityStageHistory" ("opportunityId", "changedAt");
