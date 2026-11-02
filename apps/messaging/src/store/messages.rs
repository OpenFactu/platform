use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::crypto::Vault;
use crate::domain::message::{MessageKind, ValidMessage};

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MessageDto {
    pub id: Uuid,
    pub conversation_id: Uuid,
    /// Con qué clave se abre. No sale del servicio.
    #[serde(skip)]
    pub tenant_id: String,
    /// Usuario autor; `None` si lo escribió un cliente o el sistema.
    pub author_id: Option<String>,
    /// Contacto autor, en las conversaciones con clientes.
    pub author_contact_id: Option<String>,
    pub kind: String,
    pub body: Option<String>,
    pub payload: Option<Value>,
    pub client_msg_id: Option<String>,
    pub reply_to_id: Option<Uuid>,
    /// `[{ emoji, userIds }]`, en el orden en que apareció cada emoji.
    pub reactions: Value,
    /// Si el proveedor (Telegram…) no aceptó el mensaje, por qué.
    pub delivery_error: Option<String>,
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
        "SELECT m.id, m.conversation_id, m.tenant_id, ap.user_id AS author_id,
                ap.contact_ref AS author_contact_id, m.kind, m.body, m.payload,
                m.client_msg_id, m.reply_to_id, {REACTIONS_SQL} AS reactions, m.delivery_error,
                m.edited_at, m.deleted_at, m.created_at
           FROM message m
           LEFT JOIN participant ap ON ap.id = m.author_participant_id"
    )
}

/// Texto y contenido, tal como se leen de la base de datos, en claro.
async fn opened(vault: &Vault, mut dto: MessageDto) -> Result<MessageDto, sqlx::Error> {
    let cipher = vault.tenant(&dto.tenant_id).await?;
    dto.body = cipher.open_opt(dto.body.take());
    dto.payload = cipher.open_json(dto.payload.take());
    Ok(dto)
}

pub async fn get(db: &PgPool, vault: &Vault, id: Uuid) -> Result<Option<MessageDto>, sqlx::Error> {
    let row: Option<MessageDto> = sqlx::query_as(&format!("{} WHERE m.id = $1", select()))
        .bind(id)
        .fetch_optional(db)
        .await?;
    match row {
        Some(dto) => opened(vault, dto).await.map(Some),
        None => Ok(None),
    }
}

/// Una página de mensajes anteriores a `before`, en orden cronológico.
pub async fn page(
    db: &PgPool,
    vault: &Vault,
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
    let mut messages = Vec::with_capacity(rows.len());
    for dto in rows {
        messages.push(opened(vault, dto).await?);
    }
    Ok(messages)
}

/// Guarda el mensaje. Si el mismo autor ya mandó ese `client_msg_id`, devuelve
/// el que había (`created = false`) en vez de duplicarlo.
pub async fn insert(
    db: &PgPool,
    vault: &Vault,
    tenant_id: &str,
    conversation_id: Uuid,
    author_participant_id: Uuid,
    msg: &ValidMessage,
) -> Result<(MessageDto, bool), sqlx::Error> {
    let cipher = vault.tenant(tenant_id).await?;
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
    .bind(cipher.seal_opt(msg.body.as_deref()))
    .bind(msg.payload.as_ref().map(|p| cipher.seal_json(p)))
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
            sqlx::query(
                "UPDATE participant SET last_read_message_id = $2, last_read_at = now() WHERE id = $1",
            )
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

    let dto = get(db, vault, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    Ok((dto, created))
}

/// Autor (participante) y tipo de un mensaje, para decidir si se puede tocar.
pub struct MessageOwner {
    pub conversation_id: Uuid,
    pub author_participant_id: Option<Uuid>,
    pub kind: MessageKind,
    pub deleted: bool,
    /// Su id en el proveedor del canal (Telegram…), si pasó por uno.
    pub external_id: Option<String>,
}

#[derive(FromRow)]
struct OwnerRow {
    conversation_id: Uuid,
    author_participant_id: Option<Uuid>,
    kind: String,
    deleted_at: Option<DateTime<Utc>>,
    external_id: Option<String>,
}

pub async fn owner(
    db: &PgPool,
    tenant_id: &str,
    id: Uuid,
) -> Result<Option<MessageOwner>, sqlx::Error> {
    let row: Option<OwnerRow> = sqlx::query_as(
        "SELECT conversation_id, author_participant_id, kind, deleted_at, external_id
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
            external_id: r.external_id,
        })
    }))
}

/// El mensaje de esa conversación que el proveedor conoce con ese id.
pub async fn find_by_external(
    db: &PgPool,
    conversation_id: Uuid,
    external_id: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar("SELECT id FROM message WHERE conversation_id = $1 AND external_id = $2")
        .bind(conversation_id)
        .bind(external_id)
        .fetch_optional(db)
        .await
}

/// Lo que reacciona alguien de fuera llega como "sus reacciones ahora son
/// estas": se sustituyen las que tuviera en el mensaje.
pub async fn replace_reactions(
    db: &PgPool,
    message_id: Uuid,
    user_id: &str,
    emojis: &[String],
) -> Result<Value, sqlx::Error> {
    let mut tx = db.begin().await?;
    sqlx::query("DELETE FROM message_reaction WHERE message_id = $1 AND user_id = $2")
        .bind(message_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    for emoji in emojis {
        sqlx::query(
            "INSERT INTO message_reaction (message_id, user_id, emoji) VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING",
        )
        .bind(message_id)
        .bind(user_id)
        .bind(emoji)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    sqlx::query_scalar(&format!(
        "SELECT {REACTIONS_SQL} FROM message m WHERE m.id = $1"
    ))
    .bind(message_id)
    .fetch_one(db)
    .await
}

/// La reacción más reciente del equipo (no de clientes) en el mensaje: la que
/// el bot pone en el proveedor, que solo deja una por mensaje.
pub async fn latest_team_reaction(
    db: &PgPool,
    message_id: Uuid,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT emoji FROM message_reaction
          WHERE message_id = $1 AND user_id NOT LIKE 'contact:%'
          ORDER BY created_at DESC LIMIT 1",
    )
    .bind(message_id)
    .fetch_optional(db)
    .await
}

pub async fn edit(
    db: &PgPool,
    vault: &Vault,
    tenant_id: &str,
    id: Uuid,
    body: &str,
) -> Result<MessageDto, sqlx::Error> {
    let cipher = vault.tenant(tenant_id).await?;
    sqlx::query("UPDATE message SET body = $2, edited_at = now() WHERE id = $1")
        .bind(id)
        .bind(cipher.seal(body))
        .execute(db)
        .await?;
    get(db, vault, id).await?.ok_or(sqlx::Error::RowNotFound)
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
        "UPDATE participant SET last_read_message_id = $3, last_read_at = now()
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

/// Resultado de entregarlo al proveedor: su id allí o el error.
pub async fn set_delivery(
    db: &PgPool,
    id: Uuid,
    external_id: Option<&str>,
    error: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE message SET external_id = $2, delivery_error = $3 WHERE id = $1")
        .bind(id)
        .bind(external_id)
        .bind(error)
        .execute(db)
        .await?;
    Ok(())
}
