-- Reuniones (fase 3). Cada una vive en una conversación y se anuncia con un
-- mensaje `meeting`, cuyo payload es una foto de la reunión: al reprogramarla o
-- cancelarla se reescribe y se avisa como un mensaje editado.
ALTER TABLE message DROP CONSTRAINT IF EXISTS message_kind_check;
ALTER TABLE message ADD CONSTRAINT message_kind_check
    CHECK (kind IN ('text', 'document', 'attachment', 'system', 'meeting'));

CREATE TABLE meeting (
    id              uuid        PRIMARY KEY,
    tenant_id       text        NOT NULL,
    conversation_id uuid        NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
    message_id      uuid        NOT NULL REFERENCES message(id) ON DELETE CASCADE,
    organizer_id    text        NOT NULL,
    title           text        NOT NULL,
    starts_at       timestamptz NOT NULL,
    ends_at         timestamptz NOT NULL CHECK (ends_at > starts_at),
    -- 'link' (un enlace pegado a mano); luego 'google_meet', 'ms_teams', 'keirost'.
    provider        text        NOT NULL,
    join_url        text,
    -- Id del evento en el proveedor, para reprogramarlo o cancelarlo allí.
    external_id     text,
    cancelled_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX meeting_conversation_idx ON meeting (conversation_id, starts_at);
CREATE INDEX meeting_tenant_starts_idx ON meeting (tenant_id, starts_at) WHERE cancelled_at IS NULL;
