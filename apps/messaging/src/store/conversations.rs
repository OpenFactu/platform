use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::crypto::Vault;
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
    /// Hasta dónde ha leído cada persona del equipo: `[{ userId, lastReadMessageId, readAt }]`.
    pub read_states: Value,
    pub last_message: Option<LastMessage>,
    /// En las conversaciones con clientes: quién es el cliente.
    pub contact: Option<ContactInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactInfo {
    pub id: Uuid,
    pub display_name: String,
    pub username: Option<String>,
    pub partner_id: Option<String>,
    pub partner_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LastMessage {
    pub id: Uuid,
    pub kind: String,
    pub body: Option<String>,
    pub author_id: Option<String>,
    pub author_contact_id: Option<String>,
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
    read_states: Value,
    ct_id: Option<Uuid>,
    ct_name: Option<String>,
    ct_username: Option<String>,
    ct_partner_id: Option<String>,
    ct_partner_name: Option<String>,
    lm_id: Option<Uuid>,
    lm_kind: Option<String>,
    lm_body: Option<String>,
    lm_author_id: Option<String>,
    lm_author_contact_id: Option<String>,
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
                author_contact_id: r.lm_author_contact_id,
                created_at,
                deleted: r.lm_deleted_at.is_some(),
            }),
            _ => None,
        };
        let contact = match (r.ct_id, r.ct_name) {
            (Some(id), Some(display_name)) => Some(ContactInfo {
                id,
                display_name,
                username: r.ct_username,
                partner_id: r.ct_partner_id,
                partner_name: r.ct_partner_name,
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
            read_states: r.read_states,
            last_message,
            contact,
        }
    }
}

/// Las conversaciones en las que está (directas y grupos) y, si puede atender
/// clientes, todas las de clientes de la empresa: esas son de la bandeja, no de
/// quien participa, así que se ven aunque nunca las haya abierto.
const SUMMARY_SQL: &str = r#"
SELECT c.id, c.kind, c.channel, c.title, c.created_by, c.created_at, c.last_message_at,
       COALESCE(me.role, 'member') AS my_role, COALESCE(me.muted, false) AS muted,
       COALESCE(me.favorite, false) AS favorite, COALESCE(me.archived, false) AS archived,
       COALESCE(me.marked_unread, false) AS marked_unread,
       me.last_read_message_id,
       (SELECT count(*) FROM message m
          LEFT JOIN participant ap ON ap.id = m.author_participant_id
         WHERE m.conversation_id = c.id
           AND m.deleted_at IS NULL
           AND m.author_participant_id IS DISTINCT FROM me.id
           -- En las de clientes solo cuenta lo que escribe el cliente.
           AND (c.kind <> 'customer' OR ap.kind = 'contact')
           AND (me.last_read_message_id IS NULL OR m.id > me.last_read_message_id)) AS unread,
       COALESCE((SELECT array_agg(p.user_id ORDER BY p.joined_at) FROM participant p
                  WHERE p.conversation_id = c.id AND p.left_at IS NULL AND p.user_id IS NOT NULL),
                '{}'::text[]) AS participant_ids,
       COALESCE((SELECT array_agg(pm.message_id ORDER BY pm.pinned_at) FROM pinned_message pm
                  WHERE pm.conversation_id = c.id),
                '{}'::uuid[]) AS pinned_message_ids,
       COALESCE((SELECT json_agg(json_build_object(
                          'userId', p.user_id,
                          'lastReadMessageId', p.last_read_message_id,
                          'readAt', p.last_read_at))
                   FROM participant p
                  WHERE p.conversation_id = c.id AND p.left_at IS NULL
                    AND p.user_id IS NOT NULL AND p.last_read_message_id IS NOT NULL),
                '[]'::json) AS read_states,
       ct.id AS ct_id, ct.display_name AS ct_name, ct.username AS ct_username,
       ct.partner_id AS ct_partner_id, ct.partner_name AS ct_partner_name,
       lm.id AS lm_id, lm.kind AS lm_kind, lm.body AS lm_body, lm.author_id AS lm_author_id,
       lm.author_contact_id AS lm_author_contact_id,
       lm.created_at AS lm_created_at, lm.deleted_at AS lm_deleted_at
  FROM conversation c
  LEFT JOIN participant me
         ON me.conversation_id = c.id AND me.user_id = $2 AND me.left_at IS NULL
  LEFT JOIN contact ct ON ct.id = c.contact_id
  LEFT JOIN LATERAL (
       SELECT m.id, m.kind, m.body, m.created_at, m.deleted_at,
              ap.user_id AS author_id, ap.contact_ref AS author_contact_id
         FROM message m
         LEFT JOIN participant ap ON ap.id = m.author_participant_id
        WHERE m.conversation_id = c.id
        ORDER BY m.id DESC
        LIMIT 1) lm ON true
 WHERE c.tenant_id = $1
   AND ((c.kind <> 'customer' AND me.id IS NOT NULL) OR (c.kind = 'customer' AND $4))
   AND ($3::uuid IS NULL OR c.id = $3)
 ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
"#;

/// Conversaciones que ve el usuario (o solo `only`, si se pasa).
pub async fn list_for_user(
    db: &PgPool,
    vault: &Vault,
    tenant_id: &str,
    user_id: &str,
    customers: bool,
    only: Option<Uuid>,
) -> Result<Vec<ConversationSummary>, sqlx::Error> {
    let rows: Vec<SummaryRow> = sqlx::query_as(SUMMARY_SQL)
        .bind(tenant_id)
        .bind(user_id)
        .bind(only)
        .bind(customers)
        .fetch_all(db)
        .await?;
    let cipher = vault.tenant(tenant_id).await?;
    Ok(rows
        .into_iter()
        .map(|row| {
            let mut summary = ConversationSummary::from(row);
            if let Some(last) = &mut summary.last_message {
                last.body = cipher.open_opt(last.body.take());
            }
            summary
        })
        .collect())
}

pub async fn summary_for_user(
    db: &PgPool,
    vault: &Vault,
    tenant_id: &str,
    user_id: &str,
    customers: bool,
    conversation_id: Uuid,
) -> Result<Option<ConversationSummary>, sqlx::Error> {
    Ok(list_for_user(
        db,
        vault,
        tenant_id,
        user_id,
        customers,
        Some(conversation_id),
    )
    .await?
    .into_iter()
    .next())
}

/// Cómo accede alguien a una conversación. `None` si no puede, que para la API
/// es lo mismo que no existir.
#[derive(Debug, Clone)]
pub struct Membership {
    pub participant_id: Uuid,
    pub role: Role,
    pub kind: ConversationKind,
    pub channel: String,
    /// Identificador de la conversación en el proveedor (chat de Telegram…).
    pub external_ref: Option<String>,
}

#[derive(FromRow)]
struct AccessRow {
    kind: String,
    channel: String,
    external_ref: Option<String>,
    participant_id: Option<Uuid>,
    role: Option<String>,
}

/// En directas y grupos hay que estar dentro. En las de clientes basta con
/// poder atenderlos: la primera vez que entra se le apunta como participante,
/// que es lo que guarda su "leído hasta aquí".
pub async fn access(
    db: &PgPool,
    tenant_id: &str,
    conversation_id: Uuid,
    user_id: &str,
    customers: bool,
) -> Result<Option<Membership>, sqlx::Error> {
    let row: Option<AccessRow> = sqlx::query_as(
        r#"SELECT c.kind, c.channel, c.external_ref, me.id AS participant_id, me.role
             FROM conversation c
             LEFT JOIN participant me
                    ON me.conversation_id = c.id AND me.user_id = $3 AND me.left_at IS NULL
            WHERE c.id = $1 AND c.tenant_id = $2"#,
    )
    .bind(conversation_id)
    .bind(tenant_id)
    .bind(user_id)
    .fetch_optional(db)
    .await?;
    let Some(row) = row else { return Ok(None) };
    let Some(kind) = ConversationKind::parse(&row.kind) else {
        return Ok(None);
    };

    let participant_id = match (kind, row.participant_id) {
        (ConversationKind::Customer, _) if !customers => return Ok(None),
        (_, Some(id)) => id,
        (ConversationKind::Customer, None) => {
            sqlx::query_scalar(
                "INSERT INTO participant (id, conversation_id, tenant_id, kind, user_id, role)
                 VALUES ($1, $2, $3, 'user', $4, 'member')
                 ON CONFLICT (conversation_id, user_id) WHERE user_id IS NOT NULL
                 DO UPDATE SET left_at = NULL
                 RETURNING id",
            )
            .bind(Uuid::now_v7())
            .bind(conversation_id)
            .bind(tenant_id)
            .bind(user_id)
            .fetch_one(db)
            .await?
        }
        (_, None) => return Ok(None),
    };

    Ok(Some(Membership {
        participant_id,
        role: Role::parse(row.role.as_deref().unwrap_or("member")),
        kind,
        channel: row.channel,
        external_ref: row.external_ref,
    }))
}

/// Tipo de una conversación (para saber a quién avisar).
pub async fn kind_of(
    db: &PgPool,
    conversation_id: Uuid,
) -> Result<Option<ConversationKind>, sqlx::Error> {
    let kind: Option<String> = sqlx::query_scalar("SELECT kind FROM conversation WHERE id = $1")
        .bind(conversation_id)
        .fetch_optional(db)
        .await?;
    Ok(kind.as_deref().and_then(ConversationKind::parse))
}

/// La conversación de un cliente por un canal: la que ya había o una nueva.
/// Devuelve su id, el participante del cliente y si se acaba de crear.
pub async fn find_or_create_customer(
    db: &PgPool,
    tenant_id: &str,
    channel: &str,
    external_ref: &str,
    contact_id: Uuid,
    title: &str,
) -> Result<(Uuid, Uuid, bool), sqlx::Error> {
    let mut tx = db.begin().await?;
    let inserted: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO conversation (id, tenant_id, kind, channel, external_ref, title, contact_id, created_by)
         VALUES ($1, $2, 'customer', $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, channel, external_ref) WHERE external_ref IS NOT NULL
         DO NOTHING
         RETURNING id",
    )
    .bind(Uuid::now_v7())
    .bind(tenant_id)
    .bind(channel)
    .bind(external_ref)
    .bind(title)
    .bind(contact_id)
    .bind(format!("channel:{channel}"))
    .fetch_optional(&mut *tx)
    .await?;
    let created = inserted.is_some();
    let conversation_id = match inserted {
        Some(id) => id,
        None => {
            sqlx::query_scalar(
                "SELECT id FROM conversation WHERE tenant_id = $1 AND channel = $2 AND external_ref = $3",
            )
            .bind(tenant_id)
            .bind(channel)
            .bind(external_ref)
            .fetch_one(&mut *tx)
            .await?
        }
    };

    let contact_ref = contact_id.to_string();
    let existing: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM participant WHERE conversation_id = $1 AND kind = 'contact' AND contact_ref = $2",
    )
    .bind(conversation_id)
    .bind(&contact_ref)
    .fetch_optional(&mut *tx)
    .await?;
    let participant_id = match existing {
        Some(id) => id,
        None => {
            let id = Uuid::now_v7();
            sqlx::query(
                "INSERT INTO participant (id, conversation_id, tenant_id, kind, contact_ref, role)
                 VALUES ($1, $2, $3, 'contact', $4, 'member')",
            )
            .bind(id)
            .bind(conversation_id)
            .bind(tenant_id)
            .bind(&contact_ref)
            .execute(&mut *tx)
            .await?;
            id
        }
    };
    tx.commit().await?;
    Ok((conversation_id, participant_id, created))
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

/// La conversación de un cliente por su id en el proveedor, con su contacto.
pub async fn customer_by_external(
    db: &PgPool,
    tenant_id: &str,
    channel: &str,
    external_ref: &str,
) -> Result<Option<(Uuid, Uuid)>, sqlx::Error> {
    let row: Option<(Uuid, Option<Uuid>)> = sqlx::query_as(
        "SELECT id, contact_id FROM conversation
          WHERE tenant_id = $1 AND channel = $2 AND external_ref = $3 AND kind = 'customer'",
    )
    .bind(tenant_id)
    .bind(channel)
    .bind(external_ref)
    .fetch_optional(db)
    .await?;
    Ok(row.and_then(|(id, contact)| contact.map(|c| (id, c))))
}
