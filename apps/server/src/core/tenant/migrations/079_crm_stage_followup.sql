-- CRM F5: actividad de seguimiento que se crea sola al entrar en una etapa.
ALTER TABLE "{{schema}}"."OpportunityStage" ADD COLUMN IF NOT EXISTS "followUpType" TEXT;
ALTER TABLE "{{schema}}"."OpportunityStage" ADD COLUMN IF NOT EXISTS "followUpDays" INTEGER;
ALTER TABLE "{{schema}}"."OpportunityStage" ADD COLUMN IF NOT EXISTS "followUpSubject" TEXT;
