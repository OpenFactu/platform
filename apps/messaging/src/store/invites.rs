use base64::engine::general_purpose::{STANDARD as B64, URL_SAFE_NO_PAD};
use base64::Engine;
use chrono::{DateTime, Utc};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::crypto::random_bytes;

#[derive(Debug, Clone, FromRow)]
pub struct InviteRow {
    pub id: Uuid,
    pub tenant_id: String,
    pub conversation_id: Uuid,
    pub call_id: Option<Uuid>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct InviteDto {
    pub id: Uuid,
    pub call_id: Option<Uuid>,
    pub meeting_id: Option<Uuid>,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

/// Solo el hash va a la base de datos.
fn hash(token: &str) -> String {
    B64.encode(Sha256::digest(token.as_bytes()))
}

pub struct NewInvite<'a> {
    pub tenant_id: &'a str,
    pub conversation_id: Uuid,
    pub call_id: Option<Uuid>,
    pub meeting_id: Option<Uuid>,
    pub created_by: &'a str,
    pub expires_at: DateTime<Utc>,
}

/// Crea el enlace. El token (256 bits al azar) solo se ve aquí, una vez.
pub async fn create(db: &PgPool, new: NewInvite<'_>) -> Result<(InviteDto, String), sqlx::Error> {
    let token = URL_SAFE_NO_PAD.encode(random_bytes());
    let dto = sqlx::query_as(
        "INSERT INTO call_invite (id, token_hash, tenant_id, conversation_id, call_id, meeting_id,
                                  created_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, call_id, meeting_id, expires_at, created_at",
    )
    .bind(Uuid::now_v7())
    .bind(hash(&token))
    .bind(new.tenant_id)
    .bind(new.conversation_id)
    .bind(new.call_id)
    .bind(new.meeting_id)
    .bind(new.created_by)
    .bind(new.expires_at)
    .fetch_one(db)
    .await?;
    Ok((dto, token))
}

/// El enlace, si sigue valiendo: sin revocar ni caducar, con su llamada viva y
/// su reunión sin cancelar.
pub async fn find_valid(db: &PgPool, token: &str) -> Result<Option<InviteRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT i.id, i.tenant_id, i.conversation_id, i.call_id
           FROM call_invite i
           LEFT JOIN call c ON c.id = i.call_id
           LEFT JOIN meeting m ON m.id = i.meeting_id
          WHERE i.token_hash = $1 AND i.revoked_at IS NULL AND i.expires_at > now()
            AND (i.call_id IS NULL OR c.ended_at IS NULL)
            AND (i.meeting_id IS NULL OR m.cancelled_at IS NULL)",
    )
    .bind(hash(token))
    .fetch_optional(db)
    .await
}

pub async fn list_active(
    db: &PgPool,
    tenant_id: &str,
    conversation_id: Uuid,
) -> Result<Vec<InviteDto>, sqlx::Error> {
    sqlx::query_as(
        "SELECT i.id, i.call_id, i.meeting_id, i.expires_at, i.created_at
           FROM call_invite i
           LEFT JOIN call c ON c.id = i.call_id
          WHERE i.tenant_id = $1 AND i.conversation_id = $2 AND i.revoked_at IS NULL
            AND i.expires_at > now() AND (i.call_id IS NULL OR c.ended_at IS NULL)
          ORDER BY i.created_at DESC",
    )
    .bind(tenant_id)
    .bind(conversation_id)
    .fetch_all(db)
    .await
}

/// La conversación del enlace, para comprobar quién puede revocarlo.
pub async fn conversation_of(
    db: &PgPool,
    tenant_id: &str,
    id: Uuid,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar("SELECT conversation_id FROM call_invite WHERE id = $1 AND tenant_id = $2")
        .bind(id)
        .bind(tenant_id)
        .fetch_optional(db)
        .await
}

pub async fn revoke(db: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE call_invite SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL")
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_hash_no_revela_el_token() {
        assert_ne!(hash("abc"), "abc");
        assert_eq!(hash("abc"), hash("abc"));
        assert_ne!(hash("abc"), hash("abd"));
    }
}
