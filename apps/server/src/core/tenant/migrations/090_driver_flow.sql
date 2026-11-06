-- Cargar antes de salir: cuándo subió el bulto a la furgoneta.
ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "loadedAt" TIMESTAMP;
-- A quién o dónde se dejó la entrega: en mano, en portería, en un sitio seguro…
ALTER TABLE "RouteStop" ADD COLUMN IF NOT EXISTS "handover" TEXT;
