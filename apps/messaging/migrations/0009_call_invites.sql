-- Enlaces para invitar a una videollamada a gente sin cuenta. Del token solo se
-- guarda el hash: quien lea la base de datos no puede entrar con él. Valen para
-- una llamada (mueren con ella) o para una reunión (hasta que termina).
CREATE TABLE call_invite (
    id              uuid        PRIMARY KEY,
    token_hash      text        NOT NULL UNIQUE,
    tenant_id       text        NOT NULL,
    conversation_id uuid        NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
    call_id         uuid        REFERENCES call(id) ON DELETE CASCADE,
    meeting_id      uuid        REFERENCES meeting(id) ON DELETE CASCADE,
    created_by      text        NOT NULL,
    expires_at      timestamptz NOT NULL,
    revoked_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX call_invite_conversation_idx ON call_invite (conversation_id);
