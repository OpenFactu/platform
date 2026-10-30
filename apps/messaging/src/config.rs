//! Configuración por variables de entorno. Comparte el `.env` de la raíz del
//! monorepo con el ERP (`dotenvy` lo busca subiendo desde el directorio actual).

use std::net::IpAddr;

use anyhow::{bail, Context};

/// Secreto de los tickets cuando no se configura uno, solo fuera de producción.
/// El ERP usa el mismo valor en el mismo caso (`apps/server/src/api/messaging.ts`).
pub const DEV_TICKET_SECRET: &str = "keirost-messaging-dev-secret";

#[derive(Debug, Clone)]
pub struct Config {
    pub host: IpAddr,
    pub port: u16,
    pub database_url: String,
    pub ticket_secret: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let production = std::env::var("NODE_ENV").is_ok_and(|v| v == "production");

        let host = env_or("MESSAGING_HOST", "0.0.0.0")
            .parse()
            .context("MESSAGING_HOST no es una IP válida")?;
        let port = env_or("MESSAGING_PORT", "3100")
            .parse()
            .context("MESSAGING_PORT no es un puerto válido")?;
        let database_url = std::env::var("DATABASE_URL")
            .context("Falta DATABASE_URL (la misma base que el ERP)")?;

        let ticket_secret = match std::env::var("MESSAGING_TICKET_SECRET") {
            Ok(s) if !s.trim().is_empty() => s,
            _ if production => bail!("Falta MESSAGING_TICKET_SECRET: en producción es obligatorio"),
            _ => {
                tracing::warn!(
                    "MESSAGING_TICKET_SECRET no está definido: se usa el secreto de desarrollo"
                );
                DEV_TICKET_SECRET.to_string()
            }
        };

        Ok(Self {
            host,
            port,
            database_url,
            ticket_secret,
        })
    }
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key)
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| default.to_string())
}
