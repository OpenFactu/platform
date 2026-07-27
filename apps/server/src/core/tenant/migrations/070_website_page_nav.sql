-- 070: Control del menú automático del site. Las páginas enlazadas
-- automáticamente (autoPageLinks del navbar/footer) se pueden ordenar
-- ("navOrder", menor primero, NULL al final) y ocultar del menú
-- ("showInNav" = false) sin dejar de estar publicadas/accesibles por URL.

ALTER TABLE "{{schema}}"."WebsitePage" ADD COLUMN IF NOT EXISTS "navOrder" INTEGER;
ALTER TABLE "{{schema}}"."WebsitePage" ADD COLUMN IF NOT EXISTS "showInNav" BOOLEAN NOT NULL DEFAULT TRUE;
