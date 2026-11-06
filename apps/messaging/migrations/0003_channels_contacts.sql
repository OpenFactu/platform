-- Canales externos (Telegram ya; WhatsApp y otros después) y las personas de
-- fuera que escriben por ellos.

-- Una cuenta de canal por empresa y canal: el bot de Telegram de la empresa.
CREATE TABLE channel_account (
    id            uuid PRIMARY KEY,
    tenant_id     text        NOT NULL,
    channel       text        NOT NULL,
    -- Lo que se puede enseñar: nombre visible, @usuario del bot…
    display_name  text        NOT NULL,
    config        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    -- Credencial cifrada (AES-256-GCM, ver crypto.rs). Nunca sale de aquí.
    secret_enc    text        NOT NULL,
    status        text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'disabled')),
    last_error    text,
    -- Por dónde va la lectura de mensajes del proveedor (offset de getUpdates).
    cursor        bigint      NOT NULL DEFAULT 0,
    created_by    text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, channel)
);

-- Alguien de fuera: un cliente que escribe por un canal.
CREATE TABLE contact (
    id            uuid PRIMARY KEY,
    tenant_id     text        NOT NULL,
    channel       text        NOT NULL,
    -- Su identificador en el proveedor (chat id de Telegram…).
    external_id   text        NOT NULL,
    display_name  text        NOT NULL,
    username      text,
    -- Interlocutor del ERP al que se ha vinculado (id + nombre para pintarlo
    -- sin consultar el ERP; el ERP es la fuente de verdad).
    partner_id    text,
    partner_name  text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, channel, external_id)
);

-- Conversaciones con clientes: no son de quien participa, son de la bandeja.
ALTER TABLE conversation DROP CONSTRAINT IF EXISTS conversation_kind_check;
ALTER TABLE conversation ADD CONSTRAINT conversation_kind_check
    CHECK (kind IN ('direct', 'group', 'customer'));
ALTER TABLE conversation ADD COLUMN contact_id uuid REFERENCES contact (id) ON DELETE SET NULL;

-- Entrega al proveedor: qué id le dio y si falló.
ALTER TABLE message ADD COLUMN external_id text;
ALTER TABLE message ADD COLUMN delivery_error text;
