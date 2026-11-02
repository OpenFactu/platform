//! Cifrado en reposo, siempre AES-256-GCM y `base64(nonce ‖ cifrado)`:
//!
//! - `SecretBox`: las credenciales de los canales (token del bot de Telegram…),
//!   con la clave derivada del secreto del servicio.
//! - `Vault`: el contenido de los mensajes y reuniones. Cada empresa tiene su
//!   clave aleatoria, guardada en `tenant_key` cifrada con la clave maestra
//!   (`MESSAGING_DATA_KEY`), que nunca está en la base de datos. Una filtración
//!   de la base de datos no da los mensajes; perder la clave maestra los pierde.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use anyhow::{bail, Context};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::PgPool;

const NONCE_LEN: usize = 12;
/// Marca lo sellado por el `Vault`. Lo que no la lleva es anterior al cifrado y
/// se lee tal cual hasta que lo migre `store::encryption`.
pub const SEALED_PREFIX: &str = "enc:v1:";

#[derive(Clone)]
pub struct SecretBox {
    cipher: Aes256Gcm,
}

#[derive(Debug, thiserror::Error)]
#[error("No se pudo descifrar la credencial (¿cambió el secreto del servicio?)")]
pub struct DecryptError;

impl SecretBox {
    pub fn new(secret: &str) -> Self {
        let key = Sha256::digest(format!("keirost-messaging:secrets:{secret}").as_bytes());
        Self {
            cipher: Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key)),
        }
    }

    /// La clave maestra de los datos: otro contexto que los secretos de canales.
    fn for_data(master: &str) -> Self {
        let key = Sha256::digest(format!("keirost-messaging:data:{master}").as_bytes());
        Self {
            cipher: Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key)),
        }
    }

    fn from_raw(key: &[u8]) -> Option<Self> {
        (key.len() == 32).then(|| Self {
            cipher: Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key)),
        })
    }

    pub fn seal(&self, plain: &str) -> String {
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let sealed = self
            .cipher
            .encrypt(&nonce, plain.as_bytes())
            .expect("AES-GCM no falla al cifrar");
        let mut out = nonce.to_vec();
        out.extend(sealed);
        B64.encode(out)
    }

    pub fn open(&self, stored: &str) -> Result<String, DecryptError> {
        let raw = B64.decode(stored).map_err(|_| DecryptError)?;
        if raw.len() <= NONCE_LEN {
            return Err(DecryptError);
        }
        let (nonce, sealed) = raw.split_at(NONCE_LEN);
        let plain = self
            .cipher
            .decrypt(Nonce::from_slice(nonce), sealed)
            .map_err(|_| DecryptError)?;
        String::from_utf8(plain).map_err(|_| DecryptError)
    }
}

/// 256 bits al azar: los tokens de los enlaces de invitado.
pub fn random_bytes() -> [u8; 32] {
    Aes256Gcm::generate_key(OsRng).into()
}

/// Sella y abre el contenido de una empresa.
#[derive(Clone)]
pub struct TenantCipher(SecretBox);

impl TenantCipher {
    pub fn seal(&self, plain: &str) -> String {
        format!("{SEALED_PREFIX}{}", self.0.seal(plain))
    }

    pub fn seal_opt(&self, plain: Option<&str>) -> Option<String> {
        plain.map(|p| self.seal(p))
    }

    /// `None` si está sellado y no se puede abrir: mejor un hueco que enseñar
    /// el cifrado, y queda en el log.
    pub fn open(&self, stored: String) -> Option<String> {
        let Some(sealed) = stored.strip_prefix(SEALED_PREFIX) else {
            return Some(stored);
        };
        match self.0.open(sealed) {
            Ok(plain) => Some(plain),
            Err(e) => {
                tracing::error!(error = %e, "Contenido cifrado que no se puede abrir");
                None
            }
        }
    }

    pub fn open_opt(&self, stored: Option<String>) -> Option<String> {
        stored.and_then(|s| self.open(s))
    }

    /// Un `payload` sellado es una cadena JSON con el documento dentro.
    pub fn seal_json(&self, value: &Value) -> Value {
        Value::String(self.seal(&value.to_string()))
    }

    pub fn open_json(&self, stored: Option<Value>) -> Option<Value> {
        match stored? {
            Value::String(s) if s.starts_with(SEALED_PREFIX) => {
                serde_json::from_str(&self.open(s)?).ok()
            }
            plain => Some(plain),
        }
    }
}

/// Las claves de las empresas, abiertas bajo demanda y guardadas en memoria.
#[derive(Clone)]
pub struct Vault {
    db: PgPool,
    master: SecretBox,
    keys: Arc<RwLock<HashMap<String, TenantCipher>>>,
}

impl Vault {
    pub fn new(db: PgPool, master_key: &str) -> Self {
        Self {
            db,
            master: SecretBox::for_data(master_key),
            keys: Arc::default(),
        }
    }

    /// Al arrancar, antes de tocar nada: si la clave maestra no es con la que se
    /// guardaron las de las empresas, mejor no arrancar que escribir con otra.
    pub async fn verify(&self) -> anyhow::Result<()> {
        let rows: Vec<(String, String)> =
            sqlx::query_as("SELECT tenant_id, wrapped_key FROM tenant_key")
                .fetch_all(&self.db)
                .await
                .context("No se pudieron leer las claves de las empresas")?;
        for (tenant, wrapped) in rows {
            if self.unwrap_key(&wrapped).is_none() {
                bail!(
                    "MESSAGING_DATA_KEY no abre la clave de la empresa {tenant}: \
                     no es la clave con la que se cifraron los mensajes"
                );
            }
        }
        Ok(())
    }

    /// La clave de la empresa; si aún no tiene, se crea.
    pub async fn tenant(&self, tenant_id: &str) -> Result<TenantCipher, sqlx::Error> {
        if let Some(found) = self.keys.read().expect("claves").get(tenant_id) {
            return Ok(found.clone());
        }
        let fresh = Aes256Gcm::generate_key(OsRng);
        // Si dos peticiones llegan a la vez gana una: se relee lo que quedó.
        sqlx::query(
            "INSERT INTO tenant_key (tenant_id, wrapped_key) VALUES ($1, $2)
             ON CONFLICT (tenant_id) DO NOTHING",
        )
        .bind(tenant_id)
        .bind(self.master.seal(&B64.encode(fresh)))
        .execute(&self.db)
        .await?;
        let wrapped: String =
            sqlx::query_scalar("SELECT wrapped_key FROM tenant_key WHERE tenant_id = $1")
                .bind(tenant_id)
                .fetch_one(&self.db)
                .await?;
        let cipher = self.unwrap_key(&wrapped).ok_or_else(|| {
            sqlx::Error::Protocol("MESSAGING_DATA_KEY no abre la clave de la empresa".into())
        })?;
        self.keys
            .write()
            .expect("claves")
            .insert(tenant_id.to_string(), cipher.clone());
        Ok(cipher)
    }

    fn unwrap_key(&self, wrapped: &str) -> Option<TenantCipher> {
        let raw = B64.decode(self.master.open(wrapped).ok()?).ok()?;
        SecretBox::from_raw(&raw).map(TenantCipher)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ida_y_vuelta() {
        let b = SecretBox::new("s");
        let sealed = b.seal("123:ABC");
        assert_ne!(sealed, "123:ABC");
        assert_eq!(b.open(&sealed).unwrap(), "123:ABC");
    }

    fn cipher() -> TenantCipher {
        TenantCipher(SecretBox::from_raw(&[7u8; 32]).unwrap())
    }

    #[test]
    fn texto_sellado_ida_y_vuelta() {
        let sealed = cipher().seal("hola");
        assert!(sealed.starts_with(SEALED_PREFIX));
        assert!(!sealed.contains("hola"));
        assert_eq!(cipher().open(sealed).as_deref(), Some("hola"));
    }

    #[test]
    fn lo_anterior_al_cifrado_se_lee_tal_cual() {
        assert_eq!(cipher().open("viejo".into()).as_deref(), Some("viejo"));
        let plain = serde_json::json!({ "files": [] });
        assert_eq!(cipher().open_json(Some(plain.clone())), Some(plain));
    }

    #[test]
    fn json_sellado_ida_y_vuelta() {
        let doc = serde_json::json!({ "docType": "SINV", "id": "1" });
        let sealed = cipher().seal_json(&doc);
        assert!(sealed.is_string());
        assert_eq!(cipher().open_json(Some(sealed)), Some(doc));
    }

    #[test]
    fn con_otra_clave_queda_un_hueco() {
        let sealed = cipher().seal("hola");
        let otra = TenantCipher(SecretBox::from_raw(&[9u8; 32]).unwrap());
        assert_eq!(otra.open(sealed), None);
    }

    #[test]
    fn con_otro_secreto_no_abre() {
        let sealed = SecretBox::new("uno").seal("x");
        assert!(SecretBox::new("dos").open(&sealed).is_err());
    }
}
