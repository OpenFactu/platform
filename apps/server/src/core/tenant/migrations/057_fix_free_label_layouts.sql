-- 057: Reclasificar a LABEL las plantillas FREE que son etiquetas por contenido.
-- Complementa a 053 (que lo hizo por nombre). Una plantilla FREE con
-- canvasLayout.simpleLabel fue creada con el editor simple de etiquetas → es una
-- etiqueta, no un Documento Libre. El resto de FREE queda como Documento Libre.
-- No destructivo: sólo cambia el docType, conserva el diseño guardado.

UPDATE "{{schema}}"."DocumentTemplate"
SET "docType" = 'LABEL', "updatedAt" = NOW()
WHERE "docType" = 'FREE'
  AND "canvasLayout" IS NOT NULL
  AND "canvasLayout" -> 'simpleLabel' IS NOT NULL;
