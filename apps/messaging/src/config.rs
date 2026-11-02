//! Configuración por variables de entorno. Comparte el `.env` de la raíz del
//! monorepo con el ERP (`dotenvy` lo busca subiendo desde el directorio actual).

use std::net::IpAddr;

use anyhow::{bail, Context};

/// Secreto de los tickets cuando no se configura uno, solo fuera de producción.
/// El ERP usa el mismo valor en el mismo caso (`apps/server/src/api/messaging.ts`).
pub const DEV_TICKET_SECRET: &str = "keirost-messaging-dev-secret";

/// Clave maestra de los datos cuando no se configura una, solo fuera de producción.
pub const DEV_DATA_KEY: &str = "keirost-messaging-dev-data-key-not-for-production";
const MIN_DATA_KEY: usize = 32;

#[derive(Debug, Clone)]
pub struct Config {
    pub host: IpAddr,
    pub port: u16,
    pub database_url: String,
    pub ticket_secret: String,
    /// Clave maestra que protege las claves de cifrado de cada empresa.
    pub data_key: String,
    /// Dónde está la API del ERP (para guardar y leer ficheros de los canales).
    pub erp_url: String,
    pub rtc: RtcConfig,
}

/// El vídeo: cada instalación es distinta (ver `docs/videollamadas.md`).
#[derive(Debug, Clone)]
pub struct RtcConfig {
    /// Puerto UDP único por el que va todo el audio y vídeo.
    pub port: u16,
    /// IP que se anuncia a los navegadores. Sin ella, la de la red local.
    pub public_ip: Option<IpAddr>,
    pub max_peers: usize,
    /// TURN opcional, para las redes que bloquean UDP: `turn:host:puerto`.
    pub turn: Option<TurnConfig>,
}

#[derive(Debug, Clone)]
pub struct TurnConfig {
    pub url: String,
    pub secret: String,
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

        let data_key = match std::env::var("MESSAGING_DATA_KEY") {
            Ok(k) if k.trim().len() >= MIN_DATA_KEY => k.trim().to_string(),
            Ok(k) if !k.trim().is_empty() => {
                bail!("MESSAGING_DATA_KEY es demasiado corta: mínimo {MIN_DATA_KEY} caracteres")
            }
            _ if production => bail!("Falta MESSAGING_DATA_KEY: en producción es obligatoria"),
            _ => {
                tracing::warn!(
                    "MESSAGING_DATA_KEY no está definida: los mensajes se cifran con la clave de desarrollo"
                );
                DEV_DATA_KEY.to_string()
            }
        };

        let erp_url = env_or("MESSAGING_ERP_URL", "http://localhost:3000");

        let public_ip = match std::env::var("MESSAGING_RTC_PUBLIC_IP") {
            Ok(ip) if !ip.trim().is_empty() => Some(
                ip.trim()
                    .parse()
                    .context("MESSAGING_RTC_PUBLIC_IP no es una IP válida")?,
            ),
            _ => None,
        };
        let turn = match (
            std::env::var("MESSAGING_TURN_URL"),
            std::env::var("MESSAGING_TURN_SECRET"),
        ) {
            (Ok(url), Ok(secret)) if !url.trim().is_empty() && !secret.trim().is_empty() => {
                Some(TurnConfig {
                    url: url.trim().to_string(),
                    secret: secret.trim().to_string(),
                })
            }
            _ => None,
        };
        let rtc = RtcConfig {
            port: env_or("MESSAGING_RTC_PORT", "3478")
                .parse()
                .context("MESSAGING_RTC_PORT no es un puerto válido")?,
            public_ip,
            max_peers: env_or("MESSAGING_RTC_MAX_PEERS", "15")
                .parse()
                .context("MESSAGING_RTC_MAX_PEERS no es un número")?,
            turn,
        };

        Ok(Self {
            host,
            port,
            database_url,
            ticket_secret,
            data_key,
            erp_url,
            rtc,
        })
    }
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key)
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| default.to_string())
}
