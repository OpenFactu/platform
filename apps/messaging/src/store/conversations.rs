use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::domain::conversation::{ConversationKind, Role, ValidConversation, ValidPatch};

/// Lo que ve un participante de una conversación en su lista.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    pub id: Uuid,
    pub kind: String,
    pub channel: String,
    pub title: Option<String>,
    pub created_by: String,
    pub created_at: DateTime<Utc>,
    pub last_message_at: Option<DateTime<Utc>>,
    pub my_role: String,
    pub muted: bool,
    pub favorite: bool,
    pub archived: bool,
    pub marked_unread: bool,
    pub last_read_message_id: Option<Uuid>,
    pub unread: i64,
    pub participant_ids: Vec<String>,
    pub pinned_message_ids: Vec<Uuid>,
    pub last_message: Option<LastMessage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LastMessage {
    pub id: Uuid,
    pub kind: String,
    pub body: Option<String>,
    pub author_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub deleted: bool,
}

#[derive(FromRow)]
struct SummaryRow {
    id: Uuid,
    kind: String,
    channel: String,
    title: Option<String>,
    created_by: String,
    created_at: DateTime<Utc>,
    last_message_at: Option<DateTime<Utc>>,
    my_role: String,
    muted: bool,
    favorite: bool,
    archived: bool,
    marked_unread: bool,
    last_read_message_id: Option<Uuid>,
    unread: i64,
    participant_ids: Vec<String>,
    pinned_message_ids: Vec<Uuid>,
    lm_id: Option<Uuid>,
    lm_kind: Option<String>,
    lm_body: Option<String>,
    lm_author_id: Option<String>,
    lm_created_at: Option<DateTime<Utc>>,
    lm_deleted_at: Option<DateTime<Utc>>,
}

impl From<SummaryRow> for ConversationSummary {
    fn from(r: SummaryRow) -> Self {
        let last_message = match (r.lm_id, r.lm_kind, r.lm_created_at) {
            (Some(id), Some(kind), Some(created_at)) => Some(LastMessage {
                id,
                kind,
                body: if r.lm_deleted_at.is_some() {
                    None
                } else {
                    r.lm_body
                },
                author_id: r.lm_author_id,
                created_at,
                deleted: r.lm_deleted_at.is_some(),
            }),
            _ => None,
        };
        Self {
            id: r.id,
            kind: r.kind,
            channel: r.channel,
            title: r.title,
            created_by: r.created_by,
            created_at: r.created_at,
            last_message_at: r.last_message_at,
            my_role: r.my_role,
            muted: r.muted,
            favorite: r.favorite,
            archived: r.archived,
            marked_unread: r.marked_unread,
            last_read_message_id: r.last_read_message_id,
            unread: r.unread,
            participant_ids: r.participant_ids,
            pinned_message_ids: r.pinned_message_ids,
            last_message,
        }
    }
}

const SUMMARY_SQL: &str = r#"
SELECT c.id, c.kind, c.channel, c.title, c.created_by, c.created_at, c.last_message_at,
       me.role AS my_role, me.muted, me.favorite, me.archived, me.marked_unread,
       me.last_read_message_id,
       (SELECT count(*) FROM message m
         WHERE m.conversation_id = c.id
           AND m.deleted_at IS NULL
           AND m.author_participant_id IS DISTINCT FROM me.id
           AND (me.last_read_message_id IS NULL OR m.id > me.last_read_message_id)) AS unread,
       COALESCE((SELECT array_agg(p.user_id ORDER BY p.joined_at) FROM participant p
                  WHERE p.conversation_id = c.id AND p.left_at IS NULL AND p.user_id IS NOT NULL),
                '{}'::text[]) AS participant_ids,
       COALESCE((SELECT array_agg(pm.message_id ORDER BY pm.pinned_at) FROM pinned_message pm
                  WHERE pm.conversation_id = c.id),
                '{}'::uuid[]) AS pinned_message_ids,
       lm.id AS lm_id, lm.kind AS lm_kind, lm.body AS lm_body, lm.author_id AS lm_author_id,
       lm.created_at AS lm_created_at, lm.deleted_at AS lm_deleted_at
  FROM participant me
  JOIN conversation c ON c.id = me.conversation_id
  LEFT JOIN LATERAL (
       SELECT m.id, m.kind, m.body, m.created_at, m.deleted_at, ap.user_id AS author_id
         FROM message m
         LEFT JOIN participant ap ON ap.id = m.author_participant_id
        WHERE m.conversation_id = c.id
        ORDER BY m.id DESC
        LIMIT 1) lm ON true
 WHERE me.tenant_id = $1 AND me.user_id = $2 AND me.left_at IS NULL
   AND ($3::uuid IS NULL OR c.id = $3)
 ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
"#;

/// Conversaciones activas del usuario (o solo `only`, si se pasa).
pub async fn list_for_user(
    db: &PgPool,
    tenant_id: &str,
    user_id: &str,
    only: Option<Uuid>,
) -> Result<Vec<ConversationSummary>, sqlx::Error> {
    let rows: Vec<SummaryRow> = sqlx::query_as(SUMMARY_SQL)
        .bind(tenant_id)
        .bind(user_id)
        .bind(only)
        .fetch_all(db)
        .await?;
    Ok(rows.into_iter().map(Into::into).collect())
}

pub async fn summary_for_user(
    db: &PgPool,
    tenant_id: &str,
    user_id: &str,
    conversation_id: Uuid,
) -> Result<Option<ConversationSummary>, sqlx::Error> {
    Ok(list_for_user(db, tenant_id, user_id, Some(conversation_id))
        .await?
        .into_iter()
        .next())
}

/// Cómo participa alguien en una conversación. `None` si no está (o ya salió),
/// que para la API es lo mismo que no existir.
#[derive(Debug, Clone)]
pub struct Membership {
    pub participant_id: Uuid,
    pub role: Role,
    pub kind: ConversationKind,
    pub channel: String,
}

pub async fn membership(
    db: &PgPool,
    tenant_id: &str,
    conversation_id: Uuid,
    user_id: &str,
) -> Result<Option<Membership>, sqlx::Error> {
    let row: Option<(Uuid, String, String, String)> = sqlx::query_as(
        r#"SELECT me.id, me.role, c.kind, c.channel
             FROM participant me
             JOIN conversation c ON c.id = me.conversation_id
            WHERE c.id = $1 AND c.tenant_id = $2 AND me.user_id = $3 AND me.left_at IS NULL"#,
    )
    .bind(conversation_id)
    .bind(tenant_id)
    .bind(user_id)
    .fetch_optional(db)
    .await?;
    Ok(row.and_then(|(participant_id, role, kind, channel)| {
        Some(Membership {
            participant_id,
            role: Role::parse(&role),
            kind: ConversationKind::parse(&kind)?,
            channel,
        })
    }))
}

/// Usuarios que siguen dentro: a quién avisar de lo que pasa en la conversación.
pub async fn active_user_ids(
    db: &PgPool,
    conversation_id: Uuid,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT user_id FROM participant
          WHERE conversation_id = $1 AND left_at IS NULL AND user_id IS NOT NULL",
    )
    .bind(conversation_id)
    .fetch_all(db)
    .await
}

async fn find_direct(db: &PgPool, tenant_id: &str, key: &str) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT id FROM conversation
          WHERE tenant_id = $1 AND channel = 'internal' AND direct_key = $2",
    )
    .bind(tenant_id)
    .bind(key)
    .fetch_optional(db)
    .await
}

/// Crea la conversación. Para las directas, si ya existe devuelve esa
/// (`created = false`): abrir un chat con alguien siempre lleva al mismo.
pub async fn create(
    db: &PgPool,
    tenant_id: &str,
    creator: &str,
    conv: &ValidConversation,
) -> Result<(Uuid, bool), sqlx::Error> {
    if let Some(key) = &conv.direct_key {
        if let Some(id) = find_direct(db, tenant_id, key).await? {
            return Ok((id, false));
        }
    }

    let id = Uuid::now_v7();
    let mut tx = db.begin().await?;
    let inserted = sqlx::query(
        "INSERT INTO conversation (id, tenant_id, kind, channel, title, direct_key, created_by)
         VALUES ($1, $2, $3, 'internal', $4, $5, $6)",
    )
    .bind(id)
    .bind(tenant_id)
    .bind(conv.kind.as_str())
    .bind(&conv.title)
    .bind(&conv.direct_key)
    .bind(creator)
    .execute(&mut *tx)
    .await;

    if let Err(e) = inserted {
        // Dos personas abriendo el mismo chat a la vez: gana una y la otra lo reutiliza.
        let duplicated = e
            .as_database_error()
            .is_some_and(|d| d.is_unique_violation());
        if let (true, Some(key)) = (duplicated, &conv.direct_key) {
            tx.rollback().await?;
            if let Some(existing) = find_direct(db, tenant_id, key).await? {
                return Ok((existing, false));
            }
        }
        return Err(e);
    }

    let mut ids = vec![Uuid::now_v7()];
    let mut users = vec![creator.to_string()];
    let mut roles = vec!["owner".to_string()];
    for other in &conv.others {
        ids.push(Uuid::now_v7());
        users.push(other.clone());
        roles.push("member".to_string());
    }
    sqlx::query(
        "INSERT INTO participant (id, conversation_id, tenant_id, kind, user_id, role)
         SELECT p.id, $1, $2, 'user', p.user_id, p.role
           FROM UNNEST($3::uuid[], $4::text[], $5::text[]) AS p(id, user_id, role)",
    )
    .bind(id)
    .bind(tenant_id)
    .bind(&ids)
    .bind(&users)
    .bind(&roles)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok((id, true))
}

pub async fn apply_patch(
    db: &PgPool,
    tenant_id: &str,
    conversation_id: Uuid,
    patch: &ValidPatch,
) -> Result<(), sqlx::Error> {
    let mut tx = db.begin().await?;

    if let Some(title) = &patch.title {
        sqlx::query("UPDATE conversation SET title = $2, updated_at = now() WHERE id = $1")
            .bind(conversation_id)
            .bind(title)
            .execute(&mut *tx)
            .await?;
    }

    if !patch.add.is_empty() {
        let ids: Vec<Uuid> = patch.add.iter().map(|_| Uuid::now_v7()).collect();
        // Quien ya estuvo y salió vuelve a entrar con la misma fila.
        sqlx::query(
            "INSERT INTO participant (id, conversation_id, tenant_id, kind, user_id, role)
             SELECT p.id, $1, $2, 'user', p.user_id, 'member'
               FROM UNNEST($3::uuid[], $4::text[]) AS p(id, user_id)
             ON CONFLICT (conversation_id, user_id) WHERE user_id IS NOT NULL
             DO UPDATE SET left_at = NULL, joined_at = now(), role = 'member'
               WHERE participant.left_at IS NOT NULL",
        )
        .bind(conversation_id)
        .bind(tenant_id)
        .bind(&ids)
        .bind(&patch.add)
        .execute(&mut *tx)
        .await?;
    }

    if !patch.remove.is_empty() {
        sqlx::query(
            "UPDATE participant SET left_at = now()
              WHERE conversation_id = $1 AND user_id = ANY($2) AND left_at IS NULL",
        )
        .bind(conversation_id)
        .bind(&patch.remove)
        .execute(&mut *tx)
        .await?;

        // Si se fue el último propietario, hereda el miembro más antiguo.
        sqlx::query(
            "UPDATE participant SET role = 'owner'
              WHERE id = (SELECT id FROM participant
                           WHERE conversation_id = $1 AND left_at IS NULL
                           ORDER BY joined_at LIMIT 1)
                AND NOT EXISTS (SELECT 1 FROM participant
                                 WHERE conversation_id = $1 AND left_at IS NULL AND role = 'owner')",
        )
        .bind(conversation_id)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query("UPDATE conversation SET updated_at = now() WHERE id = $1")
        .bind(conversation_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await
}

/// Preferencias de una persona sobre una conversación. `None` no toca el campo.
#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    pub favorite: Option<bool>,
    pub archived: Option<bool>,
    pub muted: Option<bool>,
    pub marked_unread: Option<bool>,
}

pub async fn set_prefs(
    db: &PgPool,
    participant_id: Uuid,
    prefs: &Prefs,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE participant
            SET favorite      = COALESCE($2, favorite),
                archived      = COALESCE($3, archived),
                muted         = COALESCE($4, muted),
                marked_unread = COALESCE($5, marked_unread)
          WHERE id = $1",
    )
    .bind(participant_id)
    .bind(prefs.favorite)
    .bind(prefs.archived)
    .bind(prefs.muted)
    .bind(prefs.marked_unread)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn set_pinned(
    db: &PgPool,
    conversation_id: Uuid,
    message_id: Uuid,
    user_id: &str,
    pinned: bool,
) -> Result<(), sqlx::Error> {
    if pinned {
        sqlx::query(
            "INSERT INTO pinned_message (conversation_id, message_id, pinned_by) VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING",
        )
        .bind(conversation_id)
        .bind(message_id)
        .bind(user_id)
        .execute(db)
        .await?;
    } else {
        sqlx::query("DELETE FROM pinned_message WHERE conversation_id = $1 AND message_id = $2")
            .bind(conversation_id)
            .bind(message_id)
            .execute(db)
            .await?;
    }
    Ok(())
}
