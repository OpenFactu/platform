//! Acceso a Postgres. Las tablas propias viven en el esquema `messaging`; de
//! `public` solo se lee quién pertenece a qué empresa.

pub mod calls;
pub mod channels;
pub mod conversations;
pub mod encryption;
pub mod invites;
pub mod meetings;
pub mod messages;
pub mod transfer;

use anyhow::Context;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{Connection, PgConnection, PgPool};

pub const SCHEMA: &str = "messaging";
const CONNECT_ATTEMPTS: u32 = 30;
const CONNECT_RETRY_EVERY: std::time::Duration = std::time::Duration::from_secs(2);

/// Crea el esquema si falta, abre el pool con `search_path=messaging` y aplica
/// las migraciones (su tabla de control también queda en `messaging`).
pub async fn connect(database_url: &str) -> anyhow::Result<PgPool> {
    let options: PgConnectOptions = database_url
        .parse()
        .context("DATABASE_URL no es una URL de Postgres válida")?;

    // Antes de fijar el search_path: si el esquema no existiera, sqlx crearía su
    // tabla de migraciones en `public`.
    let mut bootstrap = connect_with_retries(&options).await?;
    sqlx::query(&format!("CREATE SCHEMA IF NOT EXISTS {SCHEMA}"))
        .execute(&mut bootstrap)
        .await?;
    bootstrap.close().await?;

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect_with(options.options([("search_path", SCHEMA)]))
        .await?;
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .context("Fallaron las migraciones del esquema messaging")?;
    Ok(pool)
}

/// Espera a Postgres: al arrancar todo a la vez (`dev:all`, Docker), la base de
/// datos puede tardar unos segundos en aceptar conexiones. Solo se reintenta si
/// no hay conexión; una contraseña mala falla a la primera.
async fn connect_with_retries(options: &PgConnectOptions) -> anyhow::Result<PgConnection> {
    let mut attempt = 1;
    loop {
        match PgConnection::connect_with(options).await {
            Ok(conn) => return Ok(conn),
            Err(sqlx::Error::Io(e)) if attempt < CONNECT_ATTEMPTS => {
                tracing::warn!(attempt, error = %e, "Postgres aún no responde; se reintenta");
                attempt += 1;
                tokio::time::sleep(CONNECT_RETRY_EVERY).await;
            }
            Err(e) => return Err(e).context("No se pudo conectar a Postgres"),
        }
    }
}

/// De esos usuarios, los que pertenecen a la empresa.
pub async fn tenant_members(
    db: &PgPool,
    tenant_id: &str,
    user_ids: &[String],
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar(
        r#"SELECT "userId" FROM public."UserTenantMembership"
           WHERE "tenantId" = $1 AND "userId" = ANY($2)"#,
    )
    .bind(tenant_id)
    .bind(user_ids)
    .fetch_all(db)
    .await
}
