-- 059: Modo de numeración por serie (automática vs manual).
-- Hasta ahora toda serie numeraba en automático: el motor leía nextNumber,
-- lo estampaba en docNum e incrementaba. Añadimos un modo por serie:
--   'AUTO'   → comportamiento actual (auto-incremento desde nextNumber).
--   'MANUAL' → el número lo teclea el usuario al crear cada documento.
-- Las series existentes quedan como 'AUTO' por el DEFAULT.

ALTER TABLE "{{schema}}"."DocumentSeries"
  ADD COLUMN IF NOT EXISTS "numberingMode" TEXT NOT NULL DEFAULT 'AUTO';
