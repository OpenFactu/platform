-- CRM F2: aviso de actividades vencidas ya enviado y etiquetas.
ALTER TABLE "{{schema}}"."CrmActivity" ADD COLUMN IF NOT EXISTS "notifiedAt" TIMESTAMP;
ALTER TABLE "{{schema}}"."Opportunity" ADD COLUMN IF NOT EXISTS "tags" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "{{schema}}"."Contact" ADD COLUMN IF NOT EXISTS "tags" JSONB NOT NULL DEFAULT '[]'::jsonb;
