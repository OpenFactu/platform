-- 064: Módulo Website — landing builder por tenant. Un site por tenant en el
-- MVP (el modelo ya soporta N), con páginas de bloques JSON (draft/published)
-- y buzón de envíos del formulario de contacto público. La resolución pública
-- slug/host → tenant vive en public."WebsiteHost" (bootstrap de server.ts).

CREATE TABLE IF NOT EXISTS "{{schema}}"."WebsiteSite" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "themeOverrides" JSONB,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "ogImageUrl" TEXT,
  "publishedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "{{schema}}"."WebsitePage" (
  "id" TEXT PRIMARY KEY,
  "siteId" TEXT NOT NULL REFERENCES "{{schema}}"."WebsiteSite"("id") ON DELETE CASCADE,
  "path" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "ogImageUrl" TEXT,
  "isHome" BOOLEAN NOT NULL DEFAULT FALSE,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "blocksDraft" JSONB NOT NULL DEFAULT '{"version":1,"blocks":[]}',
  "blocksPublished" JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("siteId", "path")
);

CREATE TABLE IF NOT EXISTS "{{schema}}"."WebsiteFormSubmission" (
  "id" TEXT PRIMARY KEY,
  "siteId" TEXT NOT NULL,
  "pageId" TEXT,
  "blockId" TEXT,
  "name" TEXT,
  "email" TEXT,
  "message" TEXT,
  "meta" JSONB,
  "read" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "WebsiteFormSubmission_createdAt_idx"
  ON "{{schema}}"."WebsiteFormSubmission" ("createdAt");
