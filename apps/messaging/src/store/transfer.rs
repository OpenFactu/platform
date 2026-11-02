//! Exportar e importar la mensajería de una empresa, para sus copias de
//! seguridad. El ERP no toca estas tablas: pide esto y lo mete en su zip.
//!
//! Sale en claro (el zip lo cifra el ERP con su clave de copias): así una copia
//! se restaura en otro servidor sin depender de su `MESSAGING_DATA_KEY`.
//! Las cuentas de canal no viajan: dos servicios leyendo el mismo bot se
//! pisarían, y su token se vuelve a pegar al restaurar.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::crypto::{TenantCipher, Vault};

const VERSION: u32 = 1;
/// Quién reaccionó, si fue un cliente (ver `channels/inbound.rs`).
const CONTACT_PREFIX: &str = "contact:";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TenantExport {
    version: u32,
    contacts: Vec<Value>,
    conversations: Vec<Value>,
    participants: Vec<Value>,
    messages: Vec<Value>,
    reactions: Vec<Value>,
    pins: Vec<Value>,
    meetings: Vec<Value>,
}

#[derive(Debug, thiserror::Error)]
pub enum TransferError {
    #[error(transparent)]
    Db(#[from] sqlx::Error),
    #[error("Hay contenido cifrado que no se puede abrir: la copia quedaría incompleta")]
    Unreadable,
    #[error("Versión de la copia no admitida: {0}")]
    Version(u32),
    #[error("La empresa ya tiene mensajería: solo se importa en una vacía")]
    NotEmpty,
}

async fn rows(db: &PgPool, sql: &str, tenant_id: &str) -> Result<Vec<Value>, sqlx::Error> {
    sqlx::query_scalar(sql).bind(tenant_id).fetch_all(db).await
}

pub async fn export(
    db: &PgPool,
    vault: &Vault,
    tenant_id: &str,
) -> Result<TenantExport, TransferError> {
    let cipher = vault.tenant(tenant_id).await?;
    let mut messages = rows(
        db,
        "SELECT to_jsonb(t) FROM message t WHERE tenant_id = $1 ORDER BY id",
        tenant_id,
    )
    .await?;
    for m in &mut messages {
        open_text(&cipher, m, "body")?;
        open_payload(&cipher, m)?;
    }
    let mut meetings = rows(
        db,
        "SELECT to_jsonb(t) FROM meeting t WHERE tenant_id = $1 ORDER BY id",
        tenant_id,
    )
    .await?;
    for m in &mut meetings {
        open_text(&cipher, m, "title")?;
        open_text(&cipher, m, "join_url")?;
    }
    Ok(TenantExport {
        version: VERSION,
        contacts: rows(
            db,
            "SELECT to_jsonb(t) FROM contact t WHERE tenant_id = $1",
            tenant_id,
        )
        .await?,
        conversations: rows(
            db,
            "SELECT to_jsonb(t) FROM conversation t WHERE tenant_id = $1",
            tenant_id,
        )
        .await?,
        participants: rows(
            db,
            "SELECT to_jsonb(t) FROM participant t WHERE tenant_id = $1",
            tenant_id,
        )
        .await?,
        reactions: rows(
            db,
            "SELECT to_jsonb(t) FROM message_reaction t
               JOIN message m ON m.id = t.message_id WHERE m.tenant_id = $1",
            tenant_id,
        )
        .await?,
        pins: rows(
            db,
            "SELECT to_jsonb(t) FROM pinned_message t
               JOIN conversation c ON c.id = t.conversation_id WHERE c.tenant_id = $1",
            tenant_id,
        )
        .await?,
        messages,
        meetings,
    })
}

/// Restaura en una empresa nueva. Los ids se renuevan, porque la original puede
/// seguir existiendo, y se conserva su orden: comparar ids de mensaje es
/// comparar fechas (UUID v7).
pub async fn import(
    db: &PgPool,
    vault: &Vault,
    tenant_id: &str,
    mut data: TenantExport,
) -> Result<(), TransferError> {
    if data.version != VERSION {
        return Err(TransferError::Version(data.version));
    }
    let existing: i64 =
        sqlx::query_scalar("SELECT count(*) FROM conversation WHERE tenant_id = $1")
            .bind(tenant_id)
            .fetch_one(db)
            .await?;
    if existing > 0 {
        return Err(TransferError::NotEmpty);
    }

    let ids = renewed_ids(&data);
    let cipher = vault.tenant(tenant_id).await?;
    for table in [
        &mut data.contacts,
        &mut data.conversations,
        &mut data.participants,
        &mut data.messages,
        &mut data.reactions,
        &mut data.pins,
        &mut data.meetings,
    ] {
        for row in table.iter_mut() {
            remap(row, &ids);
            if row.get("tenant_id").is_some() {
                row["tenant_id"] = Value::String(tenant_id.to_string());
            }
        }
    }
    for m in &mut data.messages {
        seal_text(&cipher, m, "body");
        if let Some(p) = m.get("payload").filter(|p| !p.is_null()).cloned() {
            m["payload"] = cipher.seal_json(&p);
        }
    }
    for m in &mut data.meetings {
        seal_text(&cipher, m, "title");
        seal_text(&cipher, m, "join_url");
    }

    // En este orden por las claves foráneas; los mensajes van por id, así una
    // respuesta entra después del mensaje al que responde.
    let mut tx = db.begin().await?;
    for (table, rows) in [
        ("contact", &data.contacts),
        ("conversation", &data.conversations),
        ("participant", &data.participants),
        ("message", &data.messages),
        ("message_reaction", &data.reactions),
        ("pinned_message", &data.pins),
        ("meeting", &data.meetings),
    ] {
        let sql =
            format!("INSERT INTO {table} SELECT * FROM jsonb_populate_record(NULL::{table}, $1)");
        for row in rows {
            sqlx::query(&sql).bind(row).execute(&mut *tx).await?;
        }
    }
    tx.commit().await?;
    Ok(())
}

/// Id nuevo para cada fila con id propio. Los de usuarios y adjuntos no cambian:
/// son del ERP.
fn renewed_ids(data: &TenantExport) -> HashMap<String, String> {
    [
        &data.contacts,
        &data.conversations,
        &data.participants,
        &data.messages,
        &data.meetings,
    ]
    .into_iter()
    .flatten()
    .filter_map(|row| row.get("id")?.as_str())
    .filter_map(|id| Some((id.to_string(), renew(Uuid::parse_str(id).ok()?).to_string())))
    .collect()
}

/// Mismo instante (los 48 bits de delante de un UUID v7), resto nuevo.
fn renew(old: Uuid) -> Uuid {
    let mut bytes = *Uuid::now_v7().as_bytes();
    bytes[..6].copy_from_slice(&old.as_bytes()[..6]);
    Uuid::from_bytes(bytes)
}

/// Cambia los ids allí donde aparezcan, también dentro del contenido de un
/// mensaje (el `meetingId` de su reunión).
fn remap(value: &mut Value, ids: &HashMap<String, String>) {
    match value {
        Value::String(s) => {
            if let Some(new) = ids.get(s.as_str()) {
                *s = new.clone();
            } else if let Some(new) = s.strip_prefix(CONTACT_PREFIX).and_then(|c| ids.get(c)) {
                *s = format!("{CONTACT_PREFIX}{new}");
            }
        }
        Value::Array(items) => items.iter_mut().for_each(|v| remap(v, ids)),
        Value::Object(map) => map.values_mut().for_each(|v| remap(v, ids)),
        _ => {}
    }
}

fn open_text(cipher: &TenantCipher, row: &mut Value, field: &str) -> Result<(), TransferError> {
    if let Some(stored) = row.get(field).and_then(Value::as_str).map(str::to_string) {
        let plain = cipher.open(stored).ok_or(TransferError::Unreadable)?;
        row[field] = Value::String(plain);
    }
    Ok(())
}

fn open_payload(cipher: &TenantCipher, row: &mut Value) -> Result<(), TransferError> {
    if let Some(stored) = row.get("payload").filter(|p| !p.is_null()).cloned() {
        row["payload"] = cipher
            .open_json(Some(stored))
            .ok_or(TransferError::Unreadable)?;
    }
    Ok(())
}

fn seal_text(cipher: &TenantCipher, row: &mut Value, field: &str) {
    if let Some(plain) = row.get(field).and_then(Value::as_str).map(str::to_string) {
        row[field] = Value::String(cipher.seal(&plain));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn renovar_conserva_el_orden_por_fecha() {
        let old = Uuid::parse_str("019a5b2e-1111-7222-8333-444455556666").unwrap();
        let new = renew(old);
        assert_ne!(old, new);
        assert_eq!(old.as_bytes()[..6], new.as_bytes()[..6]);
        assert_eq!(new.get_version_num(), 7);
    }

    #[test]
    fn remap_alcanza_contenido_y_reacciones_pero_no_lo_ajeno() {
        let ids = HashMap::from([
            ("m1".to_string(), "M1".to_string()),
            ("c1".to_string(), "C1".to_string()),
        ]);
        let mut row = json!({
            "id": "m1",
            "payload": { "meetingId": "m1", "files": [{ "attachmentId": "a1" }] },
            "user_id": "contact:c1",
            "author": "u1",
        });
        remap(&mut row, &ids);
        assert_eq!(
            row,
            json!({
                "id": "M1",
                "payload": { "meetingId": "M1", "files": [{ "attachmentId": "a1" }] },
                "user_id": "contact:C1",
                "author": "u1",
            })
        );
    }
}
