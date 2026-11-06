//! Migra a cifrado lo que se guardó antes de haberlo: en segundo plano y por
//! lotes, para no retrasar el arranque. Se puede cortar y volver a empezar, y
//! entretanto el servicio lee los dos formatos (ver `TenantCipher::open`).

use std::time::Duration;

use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::crypto::{Vault, SEALED_PREFIX};

const BATCH: i64 = 500;
const PAUSE: Duration = Duration::from_millis(50);

#[derive(FromRow)]
struct PlainMessage {
    id: Uuid,
    tenant_id: String,
    body: Option<String>,
    payload: Option<Value>,
}

#[derive(FromRow)]
struct PlainMeeting {
    id: Uuid,
    tenant_id: String,
    title: String,
    join_url: Option<String>,
}

fn is_sealed(s: &str) -> bool {
    s.starts_with(SEALED_PREFIX)
}

pub async fn backfill(db: PgPool, vault: Vault) {
    match run(&db, &vault).await {
        Ok((0, 0)) => {}
        Ok((messages, meetings)) => {
            tracing::info!(messages, meetings, "Contenido anterior cifrado")
        }
        // No es grave: lo que falte se lee en claro y se reintenta al arrancar.
        Err(e) => tracing::error!(error = %e, "No se pudo terminar de cifrar lo anterior"),
    }
}

async fn run(db: &PgPool, vault: &Vault) -> Result<(u64, u64), sqlx::Error> {
    let like = format!("{SEALED_PREFIX}%");
    let mut messages = 0;
    loop {
        let rows: Vec<PlainMessage> = sqlx::query_as(
            "SELECT id, tenant_id, body, payload FROM message
              WHERE (body IS NOT NULL AND body NOT LIKE $1)
                 OR (payload IS NOT NULL AND jsonb_typeof(payload) <> 'string')
              ORDER BY id LIMIT $2",
        )
        .bind(&like)
        .bind(BATCH)
        .fetch_all(db)
        .await?;
        if rows.is_empty() {
            break;
        }
        for row in rows {
            let cipher = vault.tenant(&row.tenant_id).await?;
            let body = match &row.body {
                Some(b) if !is_sealed(b) => Some(cipher.seal(b)),
                other => other.clone(),
            };
            let payload = match &row.payload {
                Some(p) if !p.is_string() => Some(cipher.seal_json(p)),
                other => other.clone(),
            };
            // Solo si nadie lo ha cambiado desde que se leyó: si no, el nuevo
            // valor ya va cifrado y este lote no debe pisarlo.
            sqlx::query(
                "UPDATE message SET body = $2, payload = $3
                  WHERE id = $1 AND body IS NOT DISTINCT FROM $4
                    AND payload IS NOT DISTINCT FROM $5",
            )
            .bind(row.id)
            .bind(body)
            .bind(payload)
            .bind(&row.body)
            .bind(&row.payload)
            .execute(db)
            .await?;
            messages += 1;
        }
        tokio::time::sleep(PAUSE).await;
    }

    let mut meetings = 0;
    loop {
        let rows: Vec<PlainMeeting> = sqlx::query_as(
            "SELECT id, tenant_id, title, join_url FROM meeting
              WHERE title NOT LIKE $1 OR (join_url IS NOT NULL AND join_url NOT LIKE $1)
              ORDER BY id LIMIT $2",
        )
        .bind(&like)
        .bind(BATCH)
        .fetch_all(db)
        .await?;
        if rows.is_empty() {
            break;
        }
        for row in rows {
            let cipher = vault.tenant(&row.tenant_id).await?;
            let title = if is_sealed(&row.title) {
                row.title.clone()
            } else {
                cipher.seal(&row.title)
            };
            let join_url = match &row.join_url {
                Some(u) if !is_sealed(u) => Some(cipher.seal(u)),
                other => other.clone(),
            };
            sqlx::query(
                "UPDATE meeting SET title = $2, join_url = $3
                  WHERE id = $1 AND title = $4 AND join_url IS NOT DISTINCT FROM $5",
            )
            .bind(row.id)
            .bind(title)
            .bind(join_url)
            .bind(&row.title)
            .bind(&row.join_url)
            .execute(db)
            .await?;
            meetings += 1;
        }
        tokio::time::sleep(PAUSE).await;
    }
    Ok((messages, meetings))
}
