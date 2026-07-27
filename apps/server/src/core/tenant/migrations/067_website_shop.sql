-- 067: Ecommerce del módulo Website — catálogo por flag en el artículo.
-- "webVisible" marca qué artículos aparecen en la tienda de la web pública;
-- "webDescription" es el texto de la ficha web (independiente de la
-- descripción interna) y "webImages" un array JSON de URLs públicas elegidas
-- de la biblioteca de medios del site (assets WebsiteAsset, ya servibles sin
-- autenticación por /site/<slug>/assets/...).

ALTER TABLE "{{schema}}"."Item" ADD COLUMN IF NOT EXISTS "webVisible" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "{{schema}}"."Item" ADD COLUMN IF NOT EXISTS "webDescription" TEXT;
ALTER TABLE "{{schema}}"."Item" ADD COLUMN IF NOT EXISTS "webImages" JSONB NOT NULL DEFAULT '[]';

-- Índice parcial: la tienda solo consulta los visibles.
CREATE INDEX IF NOT EXISTS "Item_webVisible_idx" ON "{{schema}}"."Item" ("webVisible") WHERE "webVisible" = TRUE;
