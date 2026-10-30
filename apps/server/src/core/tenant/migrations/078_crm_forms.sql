-- CRM F4: formularios y encuestas propios, respuestas e invitaciones con enlace personal.
CREATE TABLE IF NOT EXISTS "{{schema}}"."CrmForm" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'form' CHECK ("kind" IN ('form', 'survey')),
  "slug" TEXT NOT NULL UNIQUE,
  "title" TEXT,
  "intro" TEXT,
  "fields" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "{{schema}}"."CrmFormInvite" (
  "id" TEXT PRIMARY KEY,
  "formId" TEXT NOT NULL REFERENCES "{{schema}}"."CrmForm"("id") ON DELETE CASCADE,
  "contactId" TEXT REFERENCES "{{schema}}"."Contact"("id") ON DELETE SET NULL,
  "partnerId" TEXT REFERENCES "{{schema}}"."BusinessPartner"("id") ON DELETE SET NULL,
  "token" TEXT NOT NULL UNIQUE,
  "sentAt" TIMESTAMP,
  "respondedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmFormInvite_form_idx" ON "{{schema}}"."CrmFormInvite" ("formId");
CREATE TABLE IF NOT EXISTS "{{schema}}"."CrmFormResponse" (
  "id" TEXT PRIMARY KEY,
  "formId" TEXT NOT NULL REFERENCES "{{schema}}"."CrmForm"("id") ON DELETE CASCADE,
  "inviteId" TEXT REFERENCES "{{schema}}"."CrmFormInvite"("id") ON DELETE SET NULL,
  "answers" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "partnerId" TEXT REFERENCES "{{schema}}"."BusinessPartner"("id") ON DELETE SET NULL,
  "contactId" TEXT REFERENCES "{{schema}}"."Contact"("id") ON DELETE SET NULL,
  "opportunityId" TEXT REFERENCES "{{schema}}"."Opportunity"("id") ON DELETE SET NULL,
  "meta" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmFormResponse_form_idx" ON "{{schema}}"."CrmFormResponse" ("formId", "createdAt");
CREATE INDEX IF NOT EXISTS "CrmFormResponse_partner_idx" ON "{{schema}}"."CrmFormResponse" ("partnerId");
