-- Respuestas, reacciones, mensajes fijados y preferencias de cada persona
-- sobre una conversación (favorita, archivada, silenciada, marcada sin leer).

ALTER TABLE message ADD COLUMN reply_to_id uuid REFERENCES message (id) ON DELETE SET NULL;

CREATE TABLE message_reaction (
    message_id uuid        NOT NULL REFERENCES message (id) ON DELETE CASCADE,
    user_id    text        NOT NULL,
    emoji      text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id, emoji)
);

-- Fijados: son de la conversación, los ve todo el mundo.
CREATE TABLE pinned_message (
    conversation_id uuid        NOT NULL REFERENCES conversation (id) ON DELETE CASCADE,
    message_id      uuid        NOT NULL REFERENCES message (id) ON DELETE CASCADE,
    pinned_by       text        NOT NULL,
    pinned_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, message_id)
);

-- Estas, en cambio, son de cada participante.
ALTER TABLE participant ADD COLUMN favorite      boolean NOT NULL DEFAULT false;
ALTER TABLE participant ADD COLUMN archived      boolean NOT NULL DEFAULT false;
ALTER TABLE participant ADD COLUMN marked_unread boolean NOT NULL DEFAULT false;
