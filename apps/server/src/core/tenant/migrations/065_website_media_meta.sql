-- 065: Metadatos de organización para la biblioteca de medios del módulo
-- Website (carpetas y etiquetas). Se añaden a "Attachment" (tabla genérica de
-- adjuntos ya usada por entityType='WebsiteAsset') en vez de crear una tabla
-- paralela: son columnas opcionales, no afectan a los demás consumidores de
-- Attachment (facturas, items, etc.).

ALTER TABLE "{{schema}}"."Attachment" ADD COLUMN IF NOT EXISTS "folder" TEXT;
ALTER TABLE "{{schema}}"."Attachment" ADD COLUMN IF NOT EXISTS "tags" TEXT[];

CREATE INDEX IF NOT EXISTS "Attachment_folder_idx" ON "{{schema}}"."Attachment" ("folder");
