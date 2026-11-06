//! Cuentas de canal (el bot de la empresa) y contactos de fuera.

use serde::Serialize;
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Debug, Clone, FromRow)]
pub struct ChannelAccount {
    pub id: Uuid,
    pub tenant_id: String,
    pub channel: String,
    pub display_name: String,
    pub config: Value,
    pub secret_enc: String,
    pub status: String,
    pub last_error: Option<String>,
    pub cursor: i64,
}

/// Lo que se enseña de una cuenta: nunca la credencial.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelAccountView {
    pub channel: String,
    pub display_name: String,
    pub config: Value,
    pub status: String,
    pub last_error: Option<String>,
}

impl From<&ChannelAccount> for ChannelAccountView {
    fn from(a: &ChannelAccount) -> Self {
        Self {
            channel: a.channel.clone(),
            display_name: a.display_name.clone(),
            config: a.config.clone(),
            status: a.status.clone(),
            last_error: a.last_error.clone(),
        }
    }
}

const ACCOUNT_COLS: &str =
    "id, tenant_id, channel, display_name, config, secret_enc, status, last_error, cursor";

pub async fn accounts_for_tenant(
    db: &PgPool,
    tenant_id: &str,
) -> Result<Vec<ChannelAccount>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {ACCOUNT_COLS} FROM channel_account WHERE tenant_id = $1 ORDER BY channel"
    ))
    .bind(tenant_id)
    .fetch_all(db)
    .await
}

pub async fn account(
    db: &PgPool,
    tenant_id: &str,
    channel: &str,
) -> Result<Option<ChannelAccount>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {ACCOUNT_COLS} FROM channel_account WHERE tenant_id = $1 AND channel = $2"
    ))
    .bind(tenant_id)
    .bind(channel)
    .fetch_optional(db)
    .await
}

/// Todas las cuentas activas de un canal (para arrancar sus lectores al iniciar).
pub async fn active_accounts(
    db: &PgPool,
    channel: &str,
) -> Result<Vec<ChannelAccount>, sqlx::Error> {
    sqlx::query_as(&format!(
        "SELECT {ACCOUNT_COLS} FROM channel_account WHERE channel = $1 AND status <> 'disabled'"
    ))
    .bind(channel)
    .fetch_all(db)
    .await
}

/// Conecta (o reconecta con otra credencial) la cuenta del canal de la empresa.
pub async fn upsert_account(
    db: &PgPool,
    tenant_id: &str,
    channel: &str,
    display_name: &str,
    config: &Value,
    secret_enc: &str,
    created_by: &str,
) -> Result<ChannelAccount, sqlx::Error> {
    sqlx::query_as(&format!(
        "INSERT INTO channel_account (id, tenant_id, channel, display_name, config, secret_enc, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, channel) DO UPDATE
            SET display_name = EXCLUDED.display_name, config = EXCLUDED.config,
                secret_enc = EXCLUDED.secret_enc, status = 'active', last_error = NULL,
                cursor = 0, updated_at = now()
         RETURNING {ACCOUNT_COLS}"
    ))
    .bind(Uuid::now_v7())
    .bind(tenant_id)
    .bind(channel)
    .bind(display_name)
    .bind(config)
    .bind(secret_enc)
    .bind(created_by)
    .fetch_one(db)
    .await
}

pub async fn delete_account(
    db: &PgPool,
    tenant_id: &str,
    channel: &str,
) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM channel_account WHERE tenant_id = $1 AND channel = $2")
        .bind(tenant_id)
        .bind(channel)
        .execute(db)
        .await?;
    Ok(done.rows_affected() > 0)
}

pub async fn set_status(
    db: &PgPool,
    account_id: Uuid,
    status: &str,
    last_error: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE channel_account SET status = $2, last_error = $3, updated_at = now() WHERE id = $1",
    )
    .bind(account_id)
    .bind(status)
    .bind(last_error)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn set_cursor(db: &PgPool, account_id: Uuid, cursor: i64) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE channel_account SET cursor = $2 WHERE id = $1")
        .bind(account_id)
        .bind(cursor)
        .execute(db)
        .await?;
    Ok(())
}

// ── Contactos ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, FromRow)]
pub struct Contact {
    pub id: Uuid,
    pub display_name: String,
}

/// El contacto de esa persona en ese canal; se crea la primera vez que escribe
/// y se le actualiza el nombre si lo cambió en el proveedor.
pub async fn upsert_contact(
    db: &PgPool,
    tenant_id: &str,
    channel: &str,
    external_id: &str,
    display_name: &str,
    username: Option<&str>,
) -> Result<Contact, sqlx::Error> {
    sqlx::query_as(
        "INSERT INTO contact (id, tenant_id, channel, external_id, display_name, username)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, channel, external_id) DO UPDATE
            SET display_name = EXCLUDED.display_name, username = EXCLUDED.username,
                updated_at = now()
         RETURNING id, display_name",
    )
    .bind(Uuid::now_v7())
    .bind(tenant_id)
    .bind(channel)
    .bind(external_id)
    .bind(display_name)
    .bind(username)
    .fetch_one(db)
    .await
}

/// Vincula (o desvincula, con `None`) el contacto a un interlocutor del ERP.
/// Devuelve las conversaciones del contacto, para avisar del cambio.
pub async fn link_partner(
    db: &PgPool,
    tenant_id: &str,
    contact_id: Uuid,
    partner: Option<(&str, &str)>,
) -> Result<Option<Vec<Uuid>>, sqlx::Error> {
    let done = sqlx::query(
        "UPDATE contact SET partner_id = $3, partner_name = $4, updated_at = now()
          WHERE id = $1 AND tenant_id = $2",
    )
    .bind(contact_id)
    .bind(tenant_id)
    .bind(partner.map(|p| p.0))
    .bind(partner.map(|p| p.1))
    .execute(db)
    .await?;
    if done.rows_affected() == 0 {
        return Ok(None);
    }
    let convs = sqlx::query_scalar("SELECT id FROM conversation WHERE contact_id = $1")
        .bind(contact_id)
        .fetch_all(db)
        .await?;
    Ok(Some(convs))
}
