-- Formularios como módulo propio: las tablas del CRM pasan a ser del módulo (se conservan los datos).
ALTER TABLE IF EXISTS "{{schema}}"."CrmForm" RENAME TO "Form";
ALTER TABLE IF EXISTS "{{schema}}"."CrmFormInvite" RENAME TO "FormInvite";
ALTER TABLE IF EXISTS "{{schema}}"."CrmFormResponse" RENAME TO "FormResponse";
ALTER TABLE "{{schema}}"."Form" ADD COLUMN IF NOT EXISTS "definition" JSONB;
ALTER TABLE "{{schema}}"."Form" ADD COLUMN IF NOT EXISTS "theme" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "{{schema}}"."Form" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;
ALTER TABLE "{{schema}}"."FormResponse" ADD COLUMN IF NOT EXISTS "respondentEmail" TEXT;
ALTER TABLE "{{schema}}"."FormResponse" ADD COLUMN IF NOT EXISTS "score" NUMERIC(10, 2);
ALTER TABLE "{{schema}}"."FormResponse" ADD COLUMN IF NOT EXISTS "maxScore" NUMERIC(10, 2);
ALTER TABLE "{{schema}}"."FormResponse" ADD COLUMN IF NOT EXISTS "grades" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "{{schema}}"."FormResponse" ADD COLUMN IF NOT EXISTS "gradedAt" TIMESTAMP;
ALTER TABLE "{{schema}}"."FormResponse" ADD COLUMN IF NOT EXISTS "editToken" TEXT;
ALTER TABLE "{{schema}}"."FormResponse" ADD COLUMN IF NOT EXISTS "browserKey" TEXT;
ALTER TABLE "{{schema}}"."FormResponse" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'complete';
ALTER TABLE "{{schema}}"."FormResponse" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS "FormResponse_editToken_idx" ON "{{schema}}"."FormResponse" ("editToken") WHERE "editToken" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "FormResponse_email_idx" ON "{{schema}}"."FormResponse" ("formId", lower("respondentEmail"));
CREATE INDEX IF NOT EXISTS "FormResponse_browser_idx" ON "{{schema}}"."FormResponse" ("formId", "browserKey");
ALTER TABLE "{{schema}}"."FormInvite" ADD COLUMN IF NOT EXISTS "email" TEXT;
-- El flag nuevo hereda el del CRM: quien tenía los formularios activos los sigue teniendo.
INSERT INTO "{{schema}}"."SystemConfig" (id, key, value)
SELECT gen_random_uuid()::text, 'flags_forms_enabled', 'true'
WHERE EXISTS (SELECT 1 FROM "{{schema}}"."SystemConfig" WHERE key = 'flags_crm_forms_enabled' AND value = 'true')
  AND NOT EXISTS (SELECT 1 FROM "{{schema}}"."SystemConfig" WHERE key = 'flags_forms_enabled');
