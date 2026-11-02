//! Lo que este servicio le pide al ERP por su cuenta, sin un usuario detrás:
//! guardar los ficheros que llegan de un canal y leer los que se envían a él.
//!
//! Va con un token de servicio de un minuto firmado con el mismo secreto que
//! los tickets, pero en sentido contrario (`iss` mensajería, `aud` ERP) y
//! siempre para una empresa concreta (`tid`).

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use jsonwebtoken::{encode, EncodingKey, Header};
use reqwest::multipart::{Form, Part};
use serde::{Deserialize, Serialize};

const SERVICE_AUDIENCE: &str = "keirost-erp";
const SERVICE_ISSUER: &str = "keirost-messaging";
const TOKEN_TTL_SECS: u64 = 60;

#[derive(Clone)]
pub struct ErpClient {
    base: String,
    key: EncodingKey,
    http: reqwest::Client,
}

#[derive(Serialize)]
struct ServiceClaims<'a> {
    iss: &'static str,
    aud: &'static str,
    tid: &'a str,
    iat: u64,
    exp: u64,
}

/// Un fichero guardado en el almacenamiento de la empresa (`/api/attachments`).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredFile {
    pub id: String,
    pub file_name: String,
    pub mime: String,
    pub size: u64,
}

#[derive(Debug, thiserror::Error)]
pub enum ErpError {
    #[error("No se pudo hablar con el ERP: {0}")]
    Http(#[from] reqwest::Error),
    #[error("El ERP respondió {0}: {1}")]
    Status(u16, String),
}

impl ErpClient {
    pub fn new(base: &str, secret: &str) -> Self {
        Self {
            base: base.trim_end_matches('/').to_string(),
            key: EncodingKey::from_secret(secret.as_bytes()),
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(60))
                .build()
                .expect("cliente HTTP"),
        }
    }

    fn token(&self, tenant_id: &str) -> String {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or_default();
        let claims = ServiceClaims {
            iss: SERVICE_ISSUER,
            aud: SERVICE_AUDIENCE,
            tid: tenant_id,
            iat: now,
            exp: now + TOKEN_TTL_SECS,
        };
        encode(&Header::default(), &claims, &self.key).expect("firmar el token de servicio")
    }

    /// Guarda el fichero en el almacenamiento de la empresa, colgado de la conversación.
    pub async fn upload(
        &self,
        tenant_id: &str,
        conversation_id: &str,
        name: &str,
        mime: &str,
        bytes: Vec<u8>,
    ) -> Result<StoredFile, ErpError> {
        let part = Part::bytes(bytes)
            .file_name(name.to_string())
            .mime_str(mime)
            .unwrap_or_else(|_| Part::bytes(Vec::new()));
        let res = self
            .http
            .post(format!(
                "{}/api/internal/messaging/attachments?conversationId={conversation_id}",
                self.base
            ))
            .bearer_auth(self.token(tenant_id))
            .multipart(Form::new().part("file", part))
            .send()
            .await?;
        if !res.status().is_success() {
            let status = res.status().as_u16();
            return Err(ErpError::Status(
                status,
                res.text().await.unwrap_or_default(),
            ));
        }
        Ok(res.json().await?)
    }

    /// Los bytes de un fichero del almacenamiento de la empresa.
    pub async fn download(
        &self,
        tenant_id: &str,
        attachment_id: &str,
    ) -> Result<Vec<u8>, ErpError> {
        let res = self
            .http
            .get(format!(
                "{}/api/internal/messaging/attachments/{attachment_id}",
                self.base
            ))
            .bearer_auth(self.token(tenant_id))
            .send()
            .await?;
        if !res.status().is_success() {
            let status = res.status().as_u16();
            return Err(ErpError::Status(
                status,
                res.text().await.unwrap_or_default(),
            ));
        }
        Ok(res.bytes().await?.to_vec())
    }
}
