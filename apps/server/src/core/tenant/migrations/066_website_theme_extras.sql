-- 066: Extras de tema del módulo Website — redondez de esquinas (guardada en
-- themeOverrides jsonb, sin migración) y CSS personalizado del sitio (columna
-- dedicada, igual que seoTitle/seoDescription).

ALTER TABLE "{{schema}}"."WebsiteSite" ADD COLUMN IF NOT EXISTS "customCss" TEXT;
