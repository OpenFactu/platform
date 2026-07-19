-- 060: Separar "plantilla de fábrica" de "plantilla predeterminada".
--
-- Bug: MigrationManager.resyncDefaultTemplates() regeneraba en cada
-- reinicio del servidor el html de la fila DocumentTemplate marcada
-- isDefault=true, para mantenerla al día con el genérico de @openfactu/pdf.
-- Pero si un usuario promovía SU plantilla personalizada (p.ej. diseñada
-- con el canvas) a predeterminada, esa misma fila quedaba marcada
-- isDefault=true y el siguiente reinicio le sobreescribía html Y name con
-- el genérico de fábrica — el diseño del usuario desaparecía en silencio,
-- aunque la fila (y su id) seguían "existiendo" en la tabla.
--
-- isFactoryDefault marca la fila sembrada por el sistema
-- (seedDefaultTemplates/resyncDefaultTemplates), independiente de cuál esté
-- activa como predeterminada (isDefault). El resync solo toca filas
-- isFactoryDefault=true — nunca una plantilla custom.
--
-- Backfill conservador: solo marcamos isFactoryDefault=true en la fila
-- isDefault=true que use HTML "de formulario" (legacyHtml=true) — las
-- plantillas de canvas (legacyHtml=false, como la que reportó el bug) NUNCA
-- se marcan, así que dejan de poder ser sobreescritas de aquí en adelante.
-- El caso restante (una plantilla legacyHtml=true editada a mano y
-- promovida a predeterminada) puede sufrir UNA última regeneración con este
-- despliegue, pero no volverá a ocurrir después.
ALTER TABLE "{{schema}}"."DocumentTemplate"
  ADD COLUMN IF NOT EXISTS "isFactoryDefault" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "{{schema}}"."DocumentTemplate"
   SET "isFactoryDefault" = TRUE
 WHERE "isDefault" = TRUE
   AND "legacyHtml" = TRUE;
