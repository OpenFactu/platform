-- CRM F3: oportunidades de prospectos (aún sin ficha de cliente).
ALTER TABLE "{{schema}}"."Opportunity" ALTER COLUMN "partnerId" DROP NOT NULL;
ALTER TABLE "{{schema}}"."Opportunity" ADD COLUMN IF NOT EXISTS "prospectName" TEXT;
ALTER TABLE "{{schema}}"."Opportunity" ADD COLUMN IF NOT EXISTS "prospectCompany" TEXT;
ALTER TABLE "{{schema}}"."Opportunity" ADD COLUMN IF NOT EXISTS "prospectEmail" TEXT;
ALTER TABLE "{{schema}}"."Opportunity" ADD COLUMN IF NOT EXISTS "prospectPhone" TEXT;
CREATE INDEX IF NOT EXISTS "Opportunity_prospectEmail_idx" ON "{{schema}}"."Opportunity" (lower("prospectEmail"));
