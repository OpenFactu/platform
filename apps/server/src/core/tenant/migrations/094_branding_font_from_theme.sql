-- La fuente «sans» guardada hasta ahora significaba «la del tema»: el valor por defecto
-- cedía ante la del preset. Ahora eso lo dice el vacío, y «sans» es una elección más.
UPDATE "SystemConfig" SET "value" = '' WHERE "key" = 'branding_font_family' AND "value" = 'sans';
