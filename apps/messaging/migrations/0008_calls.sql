-- Videollamadas (fase 4). Una llamada activa por conversación: si ya hay una,
-- «Llamar» entra en ella. Quién está dentro vive en memoria, en el servicio. Al
-- terminar deja un mensaje `call` en la conversación.
ALTER TABLE message DROP CONSTRAINT IF EXISTS message_kind_check;
ALTER TABLE message ADD CONSTRAINT message_kind_check
    CHECK (kind IN ('text', 'document', 'attachment', 'system', 'meeting', 'call'));

CREATE TABLE call (
    id              uuid        PRIMARY KEY,
    tenant_id       text        NOT NULL,
    conversation_id uuid        NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
    meeting_id      uuid        REFERENCES meeting(id) ON DELETE SET NULL,
    started_by      text        NOT NULL,
    started_at      timestamptz NOT NULL DEFAULT now(),
    ended_at        timestamptz
);

CREATE UNIQUE INDEX call_one_active_idx ON call (conversation_id) WHERE ended_at IS NULL;
