use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::domain::message::{MessageKind, ValidMessage};

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MessageDto {
    pub id: Uuid,
    pub conversation_id: Uuid,
    /// Usuario autor; `None` en los mensajes de sistema.
    pub author_id: Option<String>,
    pub kind: String,
    pub body: Option<String>,
    pub payload: Option<Value>,
    pub client_msg_id: Option<String>,
    pub reply_to_id: Option<Uuid>,
    /// `[{ emoji, userIds }]`, en el orden en que apareció cada emoji.
    pub reactions: Value,
    pub edited_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Reacciones agrupadas por emoji, como las pinta la web.
const REACTIONS_SQL: &str = r#"
COALESCE((SELECT json_agg(json_build_object('emoji', r.emoji, 'userIds', r.user_ids) ORDER BY r.first_at)
            FROM (SELECT emoji, array_agg(user_id ORDER BY created_at) AS user_ids,
                         min(created_at) AS first_at
                    FROM message_reaction WHERE message_id = m.id GROUP BY emoji) r),
         '[]'::json)
"#;

fn select() -> String {
    format!(
        "SELECT m.id, m.conversation_id, ap.user_id AS author_id, m.kind, m.body, m.payload,
                m.client_msg_id, m.reply_to_id, {REACTIONS_SQL} AS reactions,
                m.edited_at, m.deleted_at, m.created_at
           FROM message m
           LEFT JOIN participant ap ON ap.id = m.author_participant_id"
    )
}

pub async fn get(db: &PgPool, id: Uuid) -> Result<Option<MessageDto>, sqlx::Error> {
    sqlx::query_as(&format!("{} WHERE m.id = $1", select()))
        .bind(id)
        .fetch_optional(db)
        .await
}

/// Una página de mensajes anteriores a `before`, en orden cronológico.
pub async fn page(
    db: &PgPool,
    conversation_id: Uuid,
    before: Option<Uuid>,
    limit: i64,
) -> Result<Vec<MessageDto>, sqlx::Error> {
    let mut rows: Vec<MessageDto> = sqlx::query_as(&format!(
        "{} WHERE m.conversation_id = $1 AND ($2::uuid IS NULL OR m.id < $2)
          ORDER BY m.id DESC LIMIT $3",
        select()
    ))
    .bind(conversation_id)
    .bind(before)
    .bind(limit)
    .fetch_all(db)
    .await?;
    rows.reverse();
    Ok(rows)
}

/// Guarda el mensaje. Si el mismo autor ya mandó ese `client_msg_id`, devuelve
/// el que había (`created = false`) en vez de duplicarlo.
pub async fn insert(
    db: &PgPool,
    tenant_id: &str,
    conversation_id: Uuid,
    author_participant_id: Uuid,
    msg: &ValidMessage,
) -> Result<(MessageDto, bool), sqlx::Error> {
    let mut tx = db.begin().await?;
    let id = Uuid::now_v7();
    let inserted: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO message (id, conversation_id, tenant_id, author_participant_id, kind, body, payload, client_msg_id, reply_to_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (author_participant_id, client_msg_id) WHERE client_msg_id IS NOT NULL
         DO NOTHING
         RETURNING id",
    )
    .bind(id)
    .bind(conversation_id)
    .bind(tenant_id)
    .bind(author_participant_id)
    .bind(msg.kind.as_str())
    .bind(&msg.body)
    .bind(&msg.payload)
    .bind(&msg.client_msg_id)
    .bind(msg.reply_to_id)
    .fetch_optional(&mut *tx)
    .await?;

    let (id, created) = match inserted {
        Some(id) => {
            sqlx::query(
                "UPDATE conversation SET last_message_at = now(), updated_at = now() WHERE id = $1",
            )
            .bind(conversation_id)
            .execute(&mut *tx)
            .await?;
            // Lo que uno escribe no le cuenta como no leído.
            sqlx::query("UPDATE participant SET last_read_message_id = $2 WHERE id = $1")
                .bind(author_participant_id)
                .bind(id)
                .execute(&mut *tx)
                .await?;
            (id, true)
        }
        None => {
            let existing: Uuid = sqlx::query_scalar(
                "SELECT id FROM message WHERE author_participant_id = $1 AND client_msg_id = $2",
            )
            .bind(author_participant_id)
            .bind(&msg.client_msg_id)
            .fetch_one(&mut *tx)
            .await?;
            (existing, false)
        }
    };
    tx.commit().await?;

    let dto = get(db, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    Ok((dto, created))
}

/// Autor (participante) y tipo de un mensaje, para decidir si se puede tocar.
pub struct MessageOwner {
    pub conversation_id: Uuid,
    pub author_participant_id: Option<Uuid>,
    pub kind: MessageKind,
    pub deleted: bool,
}

#[derive(FromRow)]
struct OwnerRow {
    conversation_id: Uuid,
    author_participant_id: Option<Uuid>,
    kind: String,
    deleted_at: Option<DateTime<Utc>>,
}

pub async fn owner(
    db: &PgPool,
    tenant_id: &str,
    id: Uuid,
) -> Result<Option<MessageOwner>, sqlx::Error> {
    let row: Option<OwnerRow> = sqlx::query_as(
        "SELECT conversation_id, author_participant_id, kind, deleted_at
           FROM message WHERE id = $1 AND tenant_id = $2",
    )
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(db)
    .await?;
    Ok(row.and_then(|r| {
        Some(MessageOwner {
            conversation_id: r.conversation_id,
            author_participant_id: r.author_participant_id,
            kind: MessageKind::parse(&r.kind)?,
            deleted: r.deleted_at.is_some(),
        })
    }))
}

pub async fn edit(db: &PgPool, id: Uuid, body: &str) -> Result<MessageDto, sqlx::Error> {
    sqlx::query("UPDATE message SET body = $2, edited_at = now() WHERE id = $1")
        .bind(id)
        .bind(body)
        .execute(db)
        .await?;
    get(db, id).await?.ok_or(sqlx::Error::RowNotFound)
}

/// Borrado suave: queda el hueco ("mensaje eliminado") pero no el contenido.
pub async fn soft_delete(db: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE message SET deleted_at = now(), body = NULL, payload = NULL
          WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .execute(db)
    .await?;
    Ok(())
}

/// Avanza el "leído hasta aquí". Nunca retrocede: devuelve `false` si ya estaba
/// más adelante o si el mensaje no es de esa conversación.
pub async fn mark_read(
    db: &PgPool,
    participant_id: Uuid,
    conversation_id: Uuid,
    message_id: Uuid,
) -> Result<bool, sqlx::Error> {
    let done = sqlx::query(
        "UPDATE participant SET last_read_message_id = $3
          WHERE id = $1
            AND (last_read_message_id IS NULL OR last_read_message_id < $3)
            AND EXISTS (SELECT 1 FROM message WHERE id = $3 AND conversation_id = $2)",
    )
    .bind(participant_id)
    .bind(conversation_id)
    .bind(message_id)
    .execute(db)
    .await?;
    // Leerla quita también el "marcar como no leída".
    sqlx::query("UPDATE participant SET marked_unread = false WHERE id = $1 AND marked_unread")
        .bind(participant_id)
        .execute(db)
        .await?;
    Ok(done.rows_affected() > 0)
}

/// ¿Ese mensaje es de esa conversación? (para responder o fijar)
pub async fn belongs_to(
    db: &PgPool,
    message_id: Uuid,
    conversation_id: Uuid,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM message WHERE id = $1 AND conversation_id = $2)",
    )
    .bind(message_id)
    .bind(conversation_id)
    .fetch_one(db)
    .await
}

/// Pone o quita una reacción y devuelve cómo quedan las del mensaje.
pub async fn set_reaction(
    db: &PgPool,
    message_id: Uuid,
    user_id: &str,
    emoji: &str,
    active: bool,
) -> Result<Value, sqlx::Error> {
    if active {
        sqlx::query(
            "INSERT INTO message_reaction (message_id, user_id, emoji) VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING",
        )
    } else {
        sqlx::query(
            "DELETE FROM message_reaction WHERE message_id = $1 AND user_id = $2 AND emoji = $3",
        )
    }
    .bind(message_id)
    .bind(user_id)
    .bind(emoji)
    .execute(db)
    .await?;

    sqlx::query_scalar(&format!(
        "SELECT {REACTIONS_SQL} FROM message m WHERE m.id = $1"
    ))
    .bind(message_id)
    .fetch_one(db)
    .await
}
