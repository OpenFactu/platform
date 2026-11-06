use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Debug, Clone, FromRow)]
pub struct CallRow {
    pub id: Uuid,
    pub tenant_id: String,
    pub conversation_id: Uuid,
    pub meeting_id: Option<Uuid>,
    pub started_by: String,
    pub started_at: DateTime<Utc>,
}

const COLUMNS: &str = "id, tenant_id, conversation_id, meeting_id, started_by, started_at";

/// La llamada activa de la conversación; si no hay, la empieza. `true` si la ha
/// empezado ahora.
pub async fn start_or_get(
    db: &PgPool,
    tenant_id: &str,
    conversation_id: Uuid,
    meeting_id: Option<Uuid>,
    user_id: &str,
) -> Result<(CallRow, bool), sqlx::Error> {
    let created: Option<CallRow> = sqlx::query_as(&format!(
        "INSERT INTO call (id, tenant_id, conversation_id, meeting_id, started_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (conversation_id) WHERE ended_at IS NULL DO NOTHING
         RETURNING {COLUMNS}"
    ))
    .bind(Uuid::now_v7())
    .bind(tenant_id)
    .bind(conversation_id)
    .bind(meeting_id)
    .bind(user_id)
    .fetch_optional(db)
    .await?;
    if let Some(row) = created {
        return Ok((row, true));
    }
    let row = sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM call WHERE conversation_id = $1 AND ended_at IS NULL"
    ))
    .bind(conversation_id)
    .fetch_one(db)
    .await?;
    Ok((row, false))
}

/// Una llamada activa de la empresa.
pub async fn active(
    db: &PgPool,
    tenant_id: &str,
    id: Uuid,
) -> Result<Option<CallRow>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM call WHERE id = $1 AND tenant_id = $2 AND ended_at IS NULL"
    ))
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(db)
    .await
}

/// La activa de una conversación, si hay.
pub async fn active_in_conversation(
    db: &PgPool,
    tenant_id: &str,
    conversation_id: Uuid,
) -> Result<Option<CallRow>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM call
          WHERE conversation_id = $1 AND tenant_id = $2 AND ended_at IS NULL"
    ))
    .bind(conversation_id)
    .bind(tenant_id)
    .fetch_optional(db)
    .await
}

/// Las activas en las conversaciones en las que está alguien.
pub async fn active_for_user(
    db: &PgPool,
    tenant_id: &str,
    user_id: &str,
) -> Result<Vec<CallRow>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM call c
          WHERE c.tenant_id = $1 AND c.ended_at IS NULL
            AND EXISTS (SELECT 1 FROM participant p
                         WHERE p.conversation_id = c.conversation_id AND p.user_id = $2
                           AND p.left_at IS NULL)"
    ))
    .bind(tenant_id)
    .bind(user_id)
    .fetch_all(db)
    .await
}

/// La termina; `None` si ya estaba terminada.
pub async fn end(db: &PgPool, id: Uuid) -> Result<Option<CallRow>, sqlx::Error> {
    sqlx::query_as(&format!(
        "UPDATE call SET ended_at = now() WHERE id = $1 AND ended_at IS NULL RETURNING {COLUMNS}"
    ))
    .bind(id)
    .fetch_optional(db)
    .await
}

/// Al arrancar nadie está dentro: lo que quedó abierto es de antes de un reinicio.
pub async fn close_all_open(db: &PgPool) -> Result<u64, sqlx::Error> {
    let done = sqlx::query("UPDATE call SET ended_at = now() WHERE ended_at IS NULL")
        .execute(db)
        .await?;
    Ok(done.rows_affected())
}

/// Las abiertas desde hace un rato: se empezaron y quizá nadie llegó a entrar.
pub async fn open_older_than(db: &PgPool, age_secs: i64) -> Result<Vec<CallRow>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM call
          WHERE ended_at IS NULL AND started_at < now() - make_interval(secs => $1)"
    ))
    .bind(age_secs as f64)
    .fetch_all(db)
    .await
}

/// El participante de la conversación que representa a ese usuario.
pub async fn participant_of(
    db: &PgPool,
    conversation_id: Uuid,
    user_id: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar("SELECT id FROM participant WHERE conversation_id = $1 AND user_id = $2")
        .bind(conversation_id)
        .bind(user_id)
        .fetch_optional(db)
        .await
}
