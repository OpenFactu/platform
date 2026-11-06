use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::crypto::{TenantCipher, Vault};
use crate::domain::meeting::{MeetingSnapshot, ValidMeeting};
use crate::domain::message::MessageKind;

#[derive(Debug, Clone, FromRow)]
pub struct MeetingRow {
    pub id: Uuid,
    pub tenant_id: String,
    pub conversation_id: Uuid,
    pub message_id: Uuid,
    pub organizer_id: String,
    pub title: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub provider: String,
    pub join_url: Option<String>,
    pub external_id: Option<String>,
    pub cancelled_at: Option<DateTime<Utc>>,
}

impl MeetingRow {
    pub fn snapshot(&self) -> MeetingSnapshot {
        MeetingSnapshot {
            meeting_id: self.id,
            title: self.title.clone(),
            starts_at: self.starts_at,
            ends_at: self.ends_at,
            provider: self.provider.clone(),
            join_url: self.join_url.clone(),
            organizer_id: self.organizer_id.clone(),
            cancelled: self.cancelled_at.is_some(),
        }
    }
}

/// Próximas reuniones de alguien, para la lista de "Reuniones".
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingDto {
    pub conversation_id: Uuid,
    pub message_id: Uuid,
    #[serde(flatten)]
    pub meeting: MeetingSnapshot,
}

const COLUMNS: &str = "id, tenant_id, conversation_id, message_id, organizer_id, title, starts_at,
                       ends_at, provider, join_url, external_id, cancelled_at";

pub struct NewMeeting<'a> {
    pub tenant_id: &'a str,
    pub conversation_id: Uuid,
    pub author_participant_id: Uuid,
    pub organizer_id: &'a str,
    pub meeting: &'a ValidMeeting,
    pub join_url: Option<String>,
    pub external_id: Option<String>,
}

/// Guarda la reunión y su mensaje de anuncio, todo o nada. Devuelve la reunión;
/// el mensaje se lee luego con `messages::get(message_id)`.
pub async fn create(
    db: &PgPool,
    vault: &Vault,
    new: NewMeeting<'_>,
) -> Result<MeetingRow, sqlx::Error> {
    let id = Uuid::now_v7();
    let message_id = Uuid::now_v7();
    let row = MeetingRow {
        id,
        tenant_id: new.tenant_id.to_string(),
        conversation_id: new.conversation_id,
        message_id,
        organizer_id: new.organizer_id.to_string(),
        title: new.meeting.title.clone(),
        starts_at: new.meeting.starts_at,
        ends_at: new.meeting.ends_at,
        provider: new.meeting.provider.clone(),
        join_url: new.join_url,
        external_id: new.external_id,
        cancelled_at: None,
    };
    let payload = serde_json::to_value(row.snapshot()).expect("MeetingSnapshot siempre serializa");

    let cipher = vault.tenant(new.tenant_id).await?;
    let mut tx = db.begin().await?;
    sqlx::query(
        "INSERT INTO message (id, conversation_id, tenant_id, author_participant_id, kind, body, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(message_id)
    .bind(row.conversation_id)
    .bind(&row.tenant_id)
    .bind(new.author_participant_id)
    .bind(MessageKind::Meeting.as_str())
    .bind(cipher.seal_opt(new.meeting.summary.as_deref()))
    .bind(cipher.seal_json(&payload))
    .execute(&mut *tx)
    .await?;
    sqlx::query(&format!(
        "INSERT INTO meeting ({COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)"
    ))
    .bind(row.id)
    .bind(&row.tenant_id)
    .bind(row.conversation_id)
    .bind(row.message_id)
    .bind(&row.organizer_id)
    .bind(cipher.seal(&row.title))
    .bind(row.starts_at)
    .bind(row.ends_at)
    .bind(&row.provider)
    .bind(cipher.seal_opt(row.join_url.as_deref()))
    .bind(&row.external_id)
    .bind(row.cancelled_at)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "UPDATE conversation SET last_message_at = now(), updated_at = now() WHERE id = $1",
    )
    .bind(row.conversation_id)
    .execute(&mut *tx)
    .await?;
    // Lo que uno programa no le cuenta como no leído.
    sqlx::query(
        "UPDATE participant SET last_read_message_id = $2, last_read_at = now() WHERE id = $1",
    )
    .bind(new.author_participant_id)
    .bind(message_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(row)
}

/// Asunto y enlace en claro.
fn opened(cipher: &TenantCipher, mut row: MeetingRow) -> MeetingRow {
    row.title = cipher
        .open(std::mem::take(&mut row.title))
        .unwrap_or_default();
    row.join_url = cipher.open_opt(row.join_url.take());
    row
}

pub async fn get(
    db: &PgPool,
    vault: &Vault,
    tenant_id: &str,
    id: Uuid,
) -> Result<Option<MeetingRow>, sqlx::Error> {
    let row: Option<MeetingRow> = sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM meeting WHERE id = $1 AND tenant_id = $2"
    ))
    .bind(id)
    .bind(tenant_id)
    .fetch_optional(db)
    .await?;
    let cipher = vault.tenant(tenant_id).await?;
    Ok(row.map(|r| opened(&cipher, r)))
}

/// Reescribe la reunión y la foto de su mensaje (y el texto para quien solo
/// recibe texto, si llega uno nuevo).
pub async fn save(
    db: &PgPool,
    vault: &Vault,
    row: &MeetingRow,
    summary: Option<&str>,
) -> Result<(), sqlx::Error> {
    let payload = serde_json::to_value(row.snapshot()).expect("MeetingSnapshot siempre serializa");
    let cipher = vault.tenant(&row.tenant_id).await?;
    let mut tx = db.begin().await?;
    sqlx::query(
        "UPDATE meeting SET title = $2, starts_at = $3, ends_at = $4, join_url = $5,
                external_id = $6, cancelled_at = $7, updated_at = now()
          WHERE id = $1",
    )
    .bind(row.id)
    .bind(cipher.seal(&row.title))
    .bind(row.starts_at)
    .bind(row.ends_at)
    .bind(cipher.seal_opt(row.join_url.as_deref()))
    .bind(&row.external_id)
    .bind(row.cancelled_at)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "UPDATE message SET payload = $2, body = COALESCE($3, body), edited_at = now() WHERE id = $1",
    )
    .bind(row.message_id)
    .bind(cipher.seal_json(&payload))
    .bind(cipher.seal_opt(summary))
    .execute(&mut *tx)
    .await?;
    tx.commit().await
}

/// Qué reuniones listar.
pub enum Window {
    /// Las que aún no han terminado, sin las canceladas.
    Upcoming,
    /// Las que caen en ese tramo, también las canceladas: el calendario las tacha.
    Range(DateTime<Utc>, DateTime<Utc>),
}

/// Las reuniones de las conversaciones en las que está alguien, las que organiza
/// y, si atiende clientes, las de la bandeja. Por orden de inicio.
pub async fn list(
    db: &PgPool,
    vault: &Vault,
    tenant_id: &str,
    user_id: &str,
    customers: bool,
    window: Window,
    limit: i64,
) -> Result<Vec<MeetingDto>, sqlx::Error> {
    let (from, to) = match window {
        Window::Upcoming => (None, None),
        Window::Range(from, to) => (Some(from), Some(to)),
    };
    let rows: Vec<MeetingRow> = sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM meeting m
          WHERE m.tenant_id = $1
            AND (($4::timestamptz IS NULL AND m.cancelled_at IS NULL AND m.ends_at > now())
                 OR (m.ends_at > $4 AND m.starts_at < $5))
            AND (m.organizer_id = $2
                 OR EXISTS (SELECT 1 FROM participant p
                             WHERE p.conversation_id = m.conversation_id AND p.user_id = $2
                               AND p.left_at IS NULL)
                 OR ($6 AND EXISTS (SELECT 1 FROM conversation c
                                     WHERE c.id = m.conversation_id AND c.kind = 'customer')))
          ORDER BY m.starts_at
          LIMIT $3"
    ))
    .bind(tenant_id)
    .bind(user_id)
    .bind(limit)
    .bind(from)
    .bind(to)
    .bind(customers)
    .fetch_all(db)
    .await?;
    let cipher = vault.tenant(tenant_id).await?;
    Ok(rows
        .into_iter()
        .map(|r| opened(&cipher, r))
        .map(|r| MeetingDto {
            conversation_id: r.conversation_id,
            message_id: r.message_id,
            meeting: r.snapshot(),
        })
        .collect())
}
