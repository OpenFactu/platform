//! Canal Telegram: un bot por empresa. El administrador lo crea con @BotFather
//! y pega el token en Keirost; los clientes escriben al bot y el equipo les
//! contesta desde Mensajes.
//!
//! Los mensajes se leen con consulta larga (`getUpdates`), no con webhook: así
//! funciona igual en una instalación sin dominio público.

pub mod api;

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use async_trait::async_trait;
use serde::Deserialize;
use tokio::task::AbortHandle;
use uuid::Uuid;

use self::api::{BotApi, TgError, MAX_DOWNLOAD_BYTES};
use super::inbound::{self, InboundFile, InboundMessage, InboundReaction};
use super::{ChannelAdapter, ChannelCapabilities, ChannelError, Delivery, ReactionTarget};
use crate::state::AppState;
use crate::store;
use crate::store::channels::ChannelAccount;

pub const CHANNEL: &str = "telegram";
const MAX_BACKOFF: Duration = Duration::from_secs(60);

pub struct TelegramChannel;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileRef {
    attachment_id: String,
    name: String,
    mime: String,
}

#[derive(Deserialize)]
struct FilesPayload {
    files: Vec<FileRef>,
}

#[async_trait]
impl ChannelAdapter for TelegramChannel {
    fn id(&self) -> &'static str {
        CHANNEL
    }

    fn capabilities(&self) -> ChannelCapabilities {
        ChannelCapabilities {
            attachments: true,
            documents: false,
        }
    }

    async fn deliver(
        &self,
        state: &AppState,
        d: Delivery<'_>,
    ) -> Result<Option<String>, ChannelError> {
        let chat = d.external_ref.ok_or(ChannelError::NotConnected)?;
        let api = bot_for(state, d.tenant_id).await?;
        let rejected = |e: TgError| ChannelError::Rejected(e.to_string());
        let body = d.message.body.as_deref().unwrap_or_default();

        match d.message.kind.as_str() {
            // Una reunión llega al cliente como texto: título, hora y enlace, ya
            // redactados por la web en el idioma de quien la programa.
            "text" | "meeting" if !body.is_empty() => {
                let sent = api.send_message(chat, body).await.map_err(rejected)?;
                Ok(Some(sent.message_id.to_string()))
            }
            "attachment" => {
                let files: FilesPayload = d
                    .message
                    .payload
                    .clone()
                    .and_then(|p| serde_json::from_value(p).ok())
                    .ok_or(ChannelError::Unsupported)?;
                let mut last = None;
                for (i, file) in files.files.iter().enumerate() {
                    let bytes = state
                        .erp
                        .download(d.tenant_id, &file.attachment_id)
                        .await
                        .map_err(|e| ChannelError::Rejected(e.to_string()))?;
                    // El texto va como pie del primero.
                    let caption = (i == 0).then_some(body);
                    let sent = match voice_note(&file.mime, &bytes) {
                        // Una nota de voz va como tal, con su reproductor en Telegram.
                        Some(ogg) => api.send_voice(chat, ogg, caption).await,
                        None => {
                            api.send_file(chat, &file.name, &file.mime, bytes, caption)
                                .await
                        }
                    }
                    .map_err(rejected)?;
                    last = Some(sent.message_id.to_string());
                }
                Ok(last)
            }
            _ => Err(ChannelError::Unsupported),
        }
    }

    async fn react(
        &self,
        state: &AppState,
        target: ReactionTarget<'_>,
        emoji: Option<&str>,
    ) -> Result<(), ChannelError> {
        // Un emoji que Telegram no admite no se envía: la reacción queda en Keirost.
        let emoji = match emoji {
            Some(e) => match telegram_reaction(e) {
                Some(allowed) => Some(allowed),
                None => return Err(ChannelError::Unsupported),
            },
            None => None,
        };
        let api = bot_for(state, target.tenant_id).await?;
        api.set_reaction(target.external_ref, target.external_message_id, emoji)
            .await
            .map(|_| ())
            .map_err(|e| ChannelError::Rejected(e.to_string()))
    }
}

async fn bot_for(state: &AppState, tenant_id: &str) -> Result<BotApi, ChannelError> {
    let account = store::channels::account(&state.db, tenant_id, CHANNEL)
        .await
        .ok()
        .flatten()
        .filter(|a| a.status != "disabled")
        .ok_or(ChannelError::NotConnected)?;
    let token = state
        .secrets
        .open(&account.secret_enc)
        .map_err(|_| ChannelError::NotConnected)?;
    Ok(BotApi::new(&token))
}

// ── Lectores: uno por bot conectado ──────────────────────────────────────────

#[derive(Default)]
pub struct TelegramManager {
    tasks: Mutex<HashMap<Uuid, AbortHandle>>,
}

impl TelegramManager {
    /// Al arrancar el servicio: un lector por cada bot conectado.
    pub async fn start_all(&self, state: &AppState) {
        match store::channels::active_accounts(&state.db, CHANNEL).await {
            Ok(accounts) => {
                for account in accounts {
                    self.start(state.clone(), account);
                }
            }
            Err(e) => tracing::error!(error = %e, "No se pudieron cargar los bots de Telegram"),
        }
    }

    pub fn start(&self, state: AppState, account: ChannelAccount) {
        let id = account.id;
        let handle = tokio::spawn(poll(state, account)).abort_handle();
        if let Some(previous) = self.tasks.lock().expect("lectores").insert(id, handle) {
            previous.abort();
        }
    }

    pub fn stop(&self, account_id: Uuid) {
        if let Some(handle) = self.tasks.lock().expect("lectores").remove(&account_id) {
            handle.abort();
        }
    }
}

async fn poll(state: AppState, account: ChannelAccount) {
    let token = match state.secrets.open(&account.secret_enc) {
        Ok(t) => t,
        Err(e) => {
            mark(&state, &account, "error", Some(&e.to_string())).await;
            return;
        }
    };
    let api = BotApi::new(&token);
    if let Err(e) = api.delete_webhook().await {
        tracing::warn!(error = %e, tenant = %account.tenant_id, "deleteWebhook falló");
    }
    tracing::info!(tenant = %account.tenant_id, bot = %account.display_name, "Leyendo Telegram");

    let mut offset = account.cursor;
    let mut backoff = Duration::from_secs(1);
    let mut healthy = account.status == "active";
    loop {
        match api.get_updates(offset).await {
            Ok(updates) => {
                backoff = Duration::from_secs(1);
                if !healthy {
                    mark(&state, &account, "active", None).await;
                    healthy = true;
                }
                if updates.is_empty() {
                    continue;
                }
                for update in updates {
                    offset = update.update_id + 1;
                    if let Some(r) = update.message_reaction {
                        let reaction = InboundReaction {
                            external_chat_id: r.chat.id.to_string(),
                            external_message_id: r.message_id.to_string(),
                            emojis: r
                                .new_reaction
                                .into_iter()
                                .filter(|t| t.kind == "emoji")
                                .filter_map(|t| t.emoji)
                                .collect(),
                        };
                        if let Err(e) = inbound::ingest_reaction(&state, &account, reaction).await {
                            tracing::error!(error = %e, tenant = %account.tenant_id, "Reacción de Telegram perdida");
                        }
                        continue;
                    }
                    let Some(message) = update.message else {
                        continue;
                    };
                    let Some(inbound) = to_inbound(&api, message).await else {
                        continue;
                    };
                    if let Err(e) = inbound::ingest(&state, &account, inbound).await {
                        tracing::error!(error = %e, tenant = %account.tenant_id, "Mensaje de Telegram perdido");
                    }
                }
                if let Err(e) = store::channels::set_cursor(&state.db, account.id, offset).await {
                    tracing::error!(error = %e, "No se pudo guardar el cursor de Telegram");
                }
            }
            Err(TgError::Unauthorized) => {
                mark(
                    &state,
                    &account,
                    "error",
                    Some("Telegram ya no reconoce el token del bot"),
                )
                .await;
                return;
            }
            Err(e) => {
                tracing::warn!(error = %e, tenant = %account.tenant_id, "Telegram no responde");
                if healthy {
                    mark(&state, &account, "error", Some(&e.to_string())).await;
                    healthy = false;
                }
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(MAX_BACKOFF);
            }
        }
    }
}

async fn mark(state: &AppState, account: &ChannelAccount, status: &str, error: Option<&str>) {
    if let Err(e) = store::channels::set_status(&state.db, account.id, status, error).await {
        tracing::error!(error = %e, "No se pudo guardar el estado del bot");
    }
}

/// Mensaje de Telegram → mensaje común. Solo chats privados con personas: los
/// grupos y otros bots se ignoran.
async fn to_inbound(api: &BotApi, m: api::Message) -> Option<InboundMessage> {
    if m.chat.kind != "private" {
        return None;
    }
    let from = m.from.as_ref().filter(|u| !u.is_bot)?;
    let sender_name = match &from.last_name {
        Some(last) => format!("{} {last}", from.first_name),
        None => from.first_name.clone(),
    };
    let id = m.message_id;

    // (file_id, nombre, tipo, tamaño)
    let mut wanted: Vec<(String, String, String, Option<u64>)> = Vec::new();
    if let Some(photo) = m.photo.as_ref().and_then(|p| p.last()) {
        wanted.push((
            photo.file_id.clone(),
            format!("foto-{id}.jpg"),
            "image/jpeg".into(),
            photo.file_size,
        ));
    }
    for (doc, prefix) in [
        (&m.document, "documento"),
        (&m.audio, "audio"),
        (&m.video, "video"),
    ] {
        let Some(doc) = doc else { continue };
        let mime = doc
            .mime_type
            .clone()
            .unwrap_or_else(|| "application/octet-stream".into());
        // Telegram no siempre manda el nombre (los vídeos grabados, casi nunca).
        let name = doc
            .file_name
            .clone()
            .unwrap_or_else(|| match extension_for(&mime) {
                Some(ext) => format!("{prefix}-{id}.{ext}"),
                None => format!("{prefix}-{id}"),
            });
        wanted.push((doc.file_id.clone(), name, mime, doc.file_size));
    }
    if let Some(voice) = &m.voice {
        wanted.push((
            voice.file_id.clone(),
            format!("nota-de-voz-{id}.ogg"),
            voice
                .mime_type
                .clone()
                .unwrap_or_else(|| "audio/ogg".into()),
            voice.file_size,
        ));
    }

    let mut files = Vec::new();
    let mut skipped = Vec::new();
    for (file_id, name, mime, size) in wanted {
        if size.is_some_and(|s| s > MAX_DOWNLOAD_BYTES) {
            skipped.push(name);
            continue;
        }
        match api.download(&file_id).await {
            Ok(bytes) => files.push(InboundFile { name, mime, bytes }),
            Err(e) => {
                tracing::warn!(error = %e, "No se pudo bajar un fichero de Telegram");
                skipped.push(name);
            }
        }
    }

    let mut text = m
        .text
        .or(m.caption)
        .or_else(|| m.sticker.and_then(|s| s.emoji));
    if !skipped.is_empty() {
        // Que el equipo sepa que llegó algo que no se pudo traer.
        let note = format!("[No se pudo recibir: {}]", skipped.join(", "));
        text = Some(match text {
            Some(t) => format!("{t}\n{note}"),
            None => note,
        });
    }

    Some(InboundMessage {
        external_chat_id: m.chat.id.to_string(),
        external_message_id: id.to_string(),
        sender_name,
        sender_username: from.username.clone(),
        text,
        files,
    })
}

/// Emojis que un bot puede poner como reacción (Bot API, `ReactionTypeEmoji`).
const TELEGRAM_REACTIONS: &[&str] = &[
    "👍",
    "👎",
    "❤",
    "🔥",
    "🥰",
    "👏",
    "😁",
    "🤔",
    "🤯",
    "😱",
    "🤬",
    "😢",
    "🎉",
    "🤩",
    "🤮",
    "💩",
    "🙏",
    "👌",
    "🕊",
    "🤡",
    "🥱",
    "🥴",
    "😍",
    "🐳",
    "❤\u{200d}🔥",
    "🌚",
    "🌭",
    "💯",
    "🤣",
    "⚡",
    "🍌",
    "🏆",
    "💔",
    "🤨",
    "😐",
    "🍓",
    "🍾",
    "💋",
    "🖕",
    "😈",
    "😴",
    "😭",
    "🤓",
    "👻",
    "👨\u{200d}💻",
    "👀",
    "🎃",
    "🙈",
    "😇",
    "😨",
    "🤝",
    "✍",
    "🤗",
    "🫡",
    "🎅",
    "🎄",
    "☃",
    "💅",
    "🤪",
    "🗿",
    "🆒",
    "💘",
    "🙉",
    "🦄",
    "😘",
    "💊",
    "🙊",
    "😎",
    "👾",
    "🤷",
    "😡",
];

/// El emoji tal como lo acepta Telegram, o el más parecido de su lista; `None`
/// si no hay ninguno que se le parezca.
fn telegram_reaction(emoji: &str) -> Option<&'static str> {
    // Sin el selector de variante (U+FE0F): Telegram escribe el corazón «❤».
    let bare: String = emoji.chars().filter(|c| *c != '\u{fe0f}').collect();
    if let Some(found) = TELEGRAM_REACTIONS.iter().find(|r| **r == bare) {
        return Some(found);
    }
    Some(match bare.as_str() {
        "😂" | "😹" => "🤣",
        "😮" | "😯" | "😲" => "😱",
        "🙌" => "👏",
        "😀" | "😃" | "😄" | "😆" | "🙂" | "😊" => "😁",
        "🥲" | "😥" | "😞" => "😢",
        "😠" => "😡",
        "✅" | "✔" => "👌",
        _ => return None,
    })
}

/// Si el fichero es una nota de voz, el OGG/Opus que Telegram reproduce como
/// tal. El grabador del navegador da WebM/Opus: se cambia de contenedor sin
/// tocar el audio. Si no se puede, `None` y va como fichero normal.
fn voice_note(mime: &str, bytes: &[u8]) -> Option<Vec<u8>> {
    let mime = mime.split(';').next().unwrap_or_default().trim();
    match mime {
        "audio/ogg" | "audio/opus" => Some(bytes.to_vec()),
        "audio/webm" => match crate::media::webm_opus_to_ogg(bytes) {
            Ok(ogg) => Some(ogg),
            Err(e) => {
                tracing::warn!(error = %e, "No se pudo pasar la nota de voz a OGG");
                None
            }
        },
        _ => None,
    }
}

/// Extensión para un tipo MIME, para poner nombre a un fichero que llegó sin él.
fn extension_for(mime: &str) -> Option<&'static str> {
    Some(match mime {
        "video/mp4" => "mp4",
        "video/quicktime" => "mov",
        "video/webm" => "webm",
        "audio/mpeg" => "mp3",
        "audio/ogg" => "ogg",
        "audio/mp4" | "audio/x-m4a" => "m4a",
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "application/pdf" => "pdf",
        "text/plain" => "txt",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::{extension_for, telegram_reaction};

    #[test]
    fn reacciones_que_acepta_telegram() {
        assert_eq!(telegram_reaction("👍"), Some("👍"));
        assert_eq!(telegram_reaction("❤️"), Some("❤"));
        assert_eq!(telegram_reaction("😂"), Some("🤣"));
        assert_eq!(telegram_reaction("🙌"), Some("👏"));
        assert_eq!(telegram_reaction("🦀"), None);
    }

    #[test]
    fn extensiones_conocidas() {
        assert_eq!(extension_for("video/mp4"), Some("mp4"));
        assert_eq!(extension_for("application/octet-stream"), None);
    }
}
