-- Esquema `messaging`: lo crea el servicio antes de migrar y es el primero
-- del search_path, así que aquí no se cualifica nada.
--
-- Los ids de usuario y de empresa son los del ERP (text), sin clave foránea:
-- viven en `public` y son de otra aplicación.

CREATE TABLE conversation (
    id              uuid PRIMARY KEY,
    tenant_id       text        NOT NULL,
    kind            text        NOT NULL CHECK (kind IN ('direct', 'group')),
    -- Canal por el que viaja: 'internal' en esta fase; 'telegram', 'whatsapp'…
    -- son adaptadores que llegarán después sin tocar el resto.
    channel         text        NOT NULL DEFAULT 'internal',
    -- Identificador de la conversación en el proveedor externo (chat de Telegram…).
    external_ref    text,
    title           text,
    -- "usuarioA:usuarioB" ordenado; solo en las directas, para no duplicarlas.
    direct_key      text,
    created_by      text        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz
);

CREATE UNIQUE INDEX conversation_direct_uq
    ON conversation (tenant_id, channel, direct_key) WHERE direct_key IS NOT NULL;
CREATE UNIQUE INDEX conversation_external_uq
    ON conversation (tenant_id, channel, external_ref) WHERE external_ref IS NOT NULL;

CREATE TABLE participant (
    id                   uuid PRIMARY KEY,
    conversation_id      uuid        NOT NULL REFERENCES conversation (id) ON DELETE CASCADE,
    tenant_id            text        NOT NULL,
    -- 'user' es alguien de la empresa; 'contact', un cliente al otro lado de un canal.
    kind                 text        NOT NULL CHECK (kind IN ('user', 'contact')),
    user_id              text,
    contact_ref          text,
    role                 text        NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    last_read_message_id uuid,
    muted                boolean     NOT NULL DEFAULT false,
    joined_at            timestamptz NOT NULL DEFAULT now(),
    left_at              timestamptz,
    CHECK ((kind = 'user' AND user_id IS NOT NULL) OR (kind = 'contact' AND contact_ref IS NOT NULL))
);

CREATE UNIQUE INDEX participant_user_uq
    ON participant (conversation_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX participant_user_idx
    ON participant (tenant_id, user_id) WHERE left_at IS NULL;

CREATE TABLE message (
    id                    uuid PRIMARY KEY, -- v7: ordenar por id es ordenar por fecha
    conversation_id       uuid        NOT NULL REFERENCES conversation (id) ON DELETE CASCADE,
    tenant_id             text        NOT NULL,
    author_participant_id uuid        REFERENCES participant (id),
    kind                  text        NOT NULL CHECK (kind IN ('text', 'document', 'attachment', 'system')),
    body                  text,
    payload               jsonb,
    -- Lo genera el navegador: si reintenta el envío no se duplica el mensaje.
    client_msg_id         text,
    edited_at             timestamptz,
    deleted_at            timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX message_conversation_idx ON message (conversation_id, id DESC);
CREATE UNIQUE INDEX message_client_uq
    ON message (author_participant_id, client_msg_id) WHERE client_msg_id IS NOT NULL;
