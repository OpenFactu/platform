-- 053: Separar plantillas de etiqueta de FREE a LABEL
-- Las plantillas cuyo nombre contiene "etiqueta" o "label" se mueven a LABEL.
-- El resto de FREE se queda como Documento Libre (recibos, cartas, etc.).

UPDATE "{{schema}}"."DocumentTemplate"
SET "docType" = 'LABEL'
WHERE "docType" = 'FREE'
  AND (
    LOWER("name") LIKE '%etiqueta%'
    OR LOWER("name") LIKE '%label%'
  );
