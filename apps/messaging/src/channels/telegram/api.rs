//! Cliente mínimo de la Bot API de Telegram: lo justo para leer y escribir.
//! <https://core.telegram.org/bots/api>

use std::time::Duration;

use reqwest::multipart::{Form, Part};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::{json, Value};

const BASE: &str = "https://api.telegram.org";
/// Espera máxima de cada consulta larga a `getUpdates`.
pub const POLL_TIMEOUT_SECS: u64 = 25;
/// Telegram no deja a los bots bajar ficheros de más de 20 MB.
pub const MAX_DOWNLOAD_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum TgError {
    /// Token inválido o revocado: no tiene arreglo sin que alguien lo cambie.
    #[error("Telegram no reconoce el token del bot")]
    Unauthorized,
    #[error("Telegram: {0}")]
    Api(String),
    #[error("No se pudo hablar con Telegram: {0}")]
    Http(#[from] reqwest::Error),
}

#[derive(Deserialize)]
struct Envelope<T> {
    ok: bool,
    result: Option<T>,
    description: Option<String>,
    error_code: Option<u16>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct User {
    pub id: i64,
    #[serde(default)]
    pub is_bot: bool,
    pub first_name: String,
    pub last_name: Option<String>,
    pub username: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Chat {
    pub id: i64,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PhotoSize {
    pub file_id: String,
    pub file_size: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Document {
    pub file_id: String,
    pub file_name: Option<String>,
    pub mime_type: Option<String>,
    pub file_size: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Voice {
    pub file_id: String,
    pub mime_type: Option<String>,
    pub file_size: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Sticker {
    pub emoji: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Message {
    pub message_id: i64,
    pub from: Option<User>,
    pub chat: Chat,
    pub text: Option<String>,
    pub caption: Option<String>,
    pub photo: Option<Vec<PhotoSize>>,
    pub document: Option<Document>,
    pub voice: Option<Voice>,
    pub audio: Option<Document>,
    pub video: Option<Document>,
    pub sticker: Option<Sticker>,
}

/// Solo nos interesan las de emoji (las hay también de pago y personalizadas).
#[derive(Debug, Clone, Deserialize)]
pub struct ReactionType {
    #[serde(rename = "type")]
    pub kind: String,
    pub emoji: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MessageReactionUpdated {
    pub chat: Chat,
    pub message_id: i64,
    pub new_reaction: Vec<ReactionType>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Update {
    pub update_id: i64,
    pub message: Option<Message>,
    pub message_reaction: Option<MessageReactionUpdated>,
}

#[derive(Debug, Clone, Deserialize)]
struct FileInfo {
    file_path: Option<String>,
}

#[derive(Clone)]
pub struct BotApi {
    http: reqwest::Client,
    token: String,
}

impl BotApi {
    pub fn new(token: &str) -> Self {
        Self {
            http: reqwest::Client::builder()
                // Algo más que la consulta larga, para que no la corte el cliente.
                .timeout(Duration::from_secs(POLL_TIMEOUT_SECS + 15))
                .build()
                .expect("cliente HTTP"),
            token: token.trim().to_string(),
        }
    }

    fn url(&self, method: &str) -> String {
        format!("{BASE}/bot{}/{method}", self.token)
    }

    async fn call<T: DeserializeOwned>(&self, method: &str, body: Value) -> Result<T, TgError> {
        let res = self.http.post(self.url(method)).json(&body).send().await?;
        Self::unwrap(res).await
    }

    async fn unwrap<T: DeserializeOwned>(res: reqwest::Response) -> Result<T, TgError> {
        let env: Envelope<T> = res.json().await?;
        match (env.ok, env.result) {
            (true, Some(result)) => Ok(result),
            _ if env.error_code == Some(401) || env.error_code == Some(404) => {
                Err(TgError::Unauthorized)
            }
            _ => Err(TgError::Api(env.description.unwrap_or_default())),
        }
    }

    pub async fn get_me(&self) -> Result<User, TgError> {
        self.call("getMe", json!({})).await
    }

    /// Sin esto, si el bot tuvo un webhook, `getUpdates` falla con 409.
    pub async fn delete_webhook(&self) -> Result<bool, TgError> {
        self.call("deleteWebhook", json!({ "drop_pending_updates": false }))
            .await
    }

    pub async fn get_updates(&self, offset: i64) -> Result<Vec<Update>, TgError> {
        self.call(
            "getUpdates",
            json!({
                "offset": offset,
                "timeout": POLL_TIMEOUT_SECS,
                "allowed_updates": ["message", "message_reaction"],
            }),
        )
        .await
    }

    pub async fn send_message(&self, chat_id: &str, text: &str) -> Result<Message, TgError> {
        self.call("sendMessage", json!({ "chat_id": chat_id, "text": text }))
            .await
    }

    /// Pone (o quita, con `None`) la reacción del bot a un mensaje. Un bot solo
    /// puede dejar una, y de la lista de emojis que acepta Telegram.
    pub async fn set_reaction(
        &self,
        chat_id: &str,
        message_id: &str,
        emoji: Option<&str>,
    ) -> Result<bool, TgError> {
        let reaction: Vec<Value> = emoji
            .map(|e| vec![json!({ "type": "emoji", "emoji": e })])
            .unwrap_or_default();
        self.call(
            "setMessageReaction",
            json!({ "chat_id": chat_id, "message_id": message_id, "reaction": reaction }),
        )
        .await
    }

    /// Envía una nota de voz (OGG/Opus): Telegram la muestra con su reproductor.
    pub async fn send_voice(
        &self,
        chat_id: &str,
        ogg: Vec<u8>,
        caption: Option<&str>,
    ) -> Result<Message, TgError> {
        let part = Part::bytes(ogg)
            .file_name("nota-de-voz.ogg")
            .mime_str("audio/ogg")
            .map_err(TgError::Http)?;
        let mut form = Form::new()
            .text("chat_id", chat_id.to_string())
            .part("voice", part);
        if let Some(caption) = caption.filter(|c| !c.is_empty()) {
            form = form.text("caption", caption.to_string());
        }
        let res = self
            .http
            .post(self.url("sendVoice"))
            .multipart(form)
            .send()
            .await?;
        Self::unwrap(res).await
    }

    /// Envía un fichero: como foto si es una imagen, si no como documento.
    pub async fn send_file(
        &self,
        chat_id: &str,
        name: &str,
        mime: &str,
        bytes: Vec<u8>,
        caption: Option<&str>,
    ) -> Result<Message, TgError> {
        let (method, field) = if mime.starts_with("image/") && !mime.contains("svg") {
            ("sendPhoto", "photo")
        } else {
            ("sendDocument", "document")
        };
        let part = Part::bytes(bytes).file_name(name.to_string());
        let part = part.mime_str(mime).map_err(TgError::Http)?;
        let mut form = Form::new()
            .text("chat_id", chat_id.to_string())
            .part(field, part);
        if let Some(caption) = caption.filter(|c| !c.is_empty()) {
            form = form.text("caption", caption.to_string());
        }
        let res = self
            .http
            .post(self.url(method))
            .multipart(form)
            .send()
            .await?;
        Self::unwrap(res).await
    }

    /// Baja un fichero que mandó alguien al bot.
    pub async fn download(&self, file_id: &str) -> Result<Vec<u8>, TgError> {
        let info: FileInfo = self.call("getFile", json!({ "file_id": file_id })).await?;
        let path = info
            .file_path
            .ok_or_else(|| TgError::Api("fichero sin ruta".into()))?;
        let res = self
            .http
            .get(format!("{BASE}/file/bot{}/{path}", self.token))
            .send()
            .await?
            .error_for_status()?;
        Ok(res.bytes().await?.to_vec())
    }
}
