-- Cifrado de mensajes en reposo: una clave aleatoria por empresa, guardada
-- cifrada con la clave maestra MESSAGING_DATA_KEY (que no está en la base de
-- datos). El texto y el contenido pasan a guardarse sellados ("enc:v1:…"),
-- también en `payload` como cadena JSON: ver `crypto.rs`.
CREATE TABLE tenant_key (
    tenant_id   text        PRIMARY KEY,
    wrapped_key text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
