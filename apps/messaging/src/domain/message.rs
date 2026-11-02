//! Mensajes: un `kind` y un `payload` tipado propios de Keirost. Nunca el
//! formato de un proveedor: cada canal traduce desde y hacia esto.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::{clean, DomainError};

pub const MAX_BODY_CHARS: usize = 4000;
const MAX_CLIENT_MSG_ID: usize = 64;
const MAX_REF: usize = 64;
const MAX_NAME: usize = 255;
pub const MAX_FILES: usize = 10;
const MAX_EMOJI_BYTES: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageKind {
    Text,
    /// Un documento del ERP (factura, pedido…). Solo la referencia: los datos los
    /// pide la web al ERP, que comprueba si quien mira puede verlos.
    Document,
    /// Ficheros subidos por el ERP a `/api/attachments` (hasta `MAX_FILES`).
    Attachment,
    System,
    /// Una reunión programada: su payload es la foto de la reunión
    /// (`domain::meeting::MeetingSnapshot`). Se crea con `/meetings`.
    Meeting,
    /// Una videollamada que ha terminado: quién la empezó y cuánto duró.
    Call,
}

impl MessageKind {
    pub fn as_str(self) -> &'static str {
        match self {
            MessageKind::Text => "text",
            MessageKind::Document => "document",
            MessageKind::Attachment => "attachment",
            MessageKind::System => "system",
            MessageKind::Meeting => "meeting",
            MessageKind::Call => "call",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "text" => Some(MessageKind::Text),
            "document" => Some(MessageKind::Document),
            "attachment" => Some(MessageKind::Attachment),
            "system" => Some(MessageKind::System),
            "meeting" => Some(MessageKind::Meeting),
            "call" => Some(MessageKind::Call),
            _ => None,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewMessageInput {
    pub kind: MessageKind,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub payload: Option<Value>,
    #[serde(default)]
    pub client_msg_id: Option<String>,
    /// Mensaje al que responde; tiene que ser de la misma conversación.
    #[serde(default)]
    pub reply_to_id: Option<Uuid>,
}

/// Mensaje ya validado y normalizado, listo para guardar.
#[derive(Debug, Clone, PartialEq)]
pub struct ValidMessage {
    pub kind: MessageKind,
    pub body: Option<String>,
    pub payload: Option<Value>,
    pub client_msg_id: Option<String>,
    pub reply_to_id: Option<Uuid>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DocumentRef {
    doc_type: String,
    id: String,
    #[serde(default)]
    number: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AttachmentList {
    files: Vec<AttachmentRef>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AttachmentRef {
    attachment_id: String,
    name: String,
    size: u64,
    mime: String,
}

pub fn validate_new(input: NewMessageInput) -> Result<ValidMessage, DomainError> {
    let client_msg_id = clean(input.client_msg_id);
    if client_msg_id
        .as_ref()
        .is_some_and(|id| id.len() > MAX_CLIENT_MSG_ID)
    {
        return Err(DomainError::InvalidClientMsgId);
    }

    let body = clean(input.body);
    if body
        .as_ref()
        .is_some_and(|b| b.chars().count() > MAX_BODY_CHARS)
    {
        return Err(DomainError::MessageTooLong);
    }

    let payload = match input.kind {
        MessageKind::System => return Err(DomainError::SystemNotAllowed),
        // Las reuniones tienen su propio endpoint: aquí no se aceptan a mano.
        MessageKind::Meeting => return Err(DomainError::InvalidPayload("meeting")),
        MessageKind::Call => return Err(DomainError::InvalidPayload("call")),
        MessageKind::Text => {
            if body.is_none() {
                return Err(DomainError::EmptyMessage);
            }
            None
        }
        MessageKind::Document => Some(normalize_document(input.payload)?),
        MessageKind::Attachment => Some(normalize_attachment(input.payload)?),
    };

    Ok(ValidMessage {
        kind: input.kind,
        body,
        payload,
        client_msg_id,
        reply_to_id: input.reply_to_id,
    })
}

/// Un emoji (o una secuencia corta) para reaccionar.
pub fn validate_emoji(emoji: &str) -> Result<String, DomainError> {
    let emoji = emoji.trim();
    if emoji.is_empty() || emoji.len() > MAX_EMOJI_BYTES {
        return Err(DomainError::InvalidReaction);
    }
    Ok(emoji.to_string())
}

/// Solo se edita el texto de un mensaje de texto que no se ha borrado.
pub fn validate_edit(kind: MessageKind, deleted: bool, body: &str) -> Result<String, DomainError> {
    if kind != MessageKind::Text || deleted {
        return Err(DomainError::NotEditable);
    }
    let body = body.trim();
    if body.is_empty() {
        return Err(DomainError::EmptyMessage);
    }
    if body.chars().count() > MAX_BODY_CHARS {
        return Err(DomainError::MessageTooLong);
    }
    Ok(body.to_string())
}

fn normalize_document(payload: Option<Value>) -> Result<Value, DomainError> {
    let mut doc: DocumentRef = payload
        .and_then(|p| serde_json::from_value(p).ok())
        .ok_or(DomainError::InvalidPayload("document"))?;
    doc.doc_type = doc.doc_type.trim().to_string();
    doc.id = doc.id.trim().to_string();
    doc.number = clean(doc.number);
    let ok = !doc.doc_type.is_empty()
        && doc.doc_type.len() <= MAX_REF
        && !doc.id.is_empty()
        && doc.id.len() <= MAX_REF
        && doc.number.as_ref().is_none_or(|n| n.len() <= MAX_REF);
    if !ok {
        return Err(DomainError::InvalidPayload("document"));
    }
    Ok(serde_json::to_value(doc).expect("DocumentRef siempre serializa"))
}

fn normalize_attachment(payload: Option<Value>) -> Result<Value, DomainError> {
    let invalid = DomainError::InvalidPayload("attachment");
    let mut list: AttachmentList = payload
        .and_then(|p| serde_json::from_value(p).ok())
        .ok_or(invalid.clone())?;
    if list.files.is_empty() || list.files.len() > MAX_FILES {
        return Err(invalid);
    }
    for att in &mut list.files {
        att.attachment_id = att.attachment_id.trim().to_string();
        att.name = att.name.trim().to_string();
        att.mime = att.mime.trim().to_string();
        let ok = !att.attachment_id.is_empty()
            && att.attachment_id.len() <= MAX_REF
            && !att.name.is_empty()
            && att.name.len() <= MAX_NAME
            && att.mime.len() <= MAX_NAME;
        if !ok {
            return Err(invalid);
        }
    }
    Ok(serde_json::to_value(list).expect("AttachmentList siempre serializa"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn input(kind: MessageKind, body: Option<&str>, payload: Option<Value>) -> NewMessageInput {
        NewMessageInput {
            kind,
            body: body.map(str::to_string),
            payload,
            client_msg_id: None,
            reply_to_id: None,
        }
    }

    #[test]
    fn texto_se_recorta() {
        let m = validate_new(input(MessageKind::Text, Some("  hola  "), None)).unwrap();
        assert_eq!(m.body.as_deref(), Some("hola"));
        assert!(m.payload.is_none());
    }

    #[test]
    fn texto_vacio_no_vale() {
        let e = validate_new(input(MessageKind::Text, Some("   "), None)).unwrap_err();
        assert_eq!(e, DomainError::EmptyMessage);
    }

    #[test]
    fn texto_demasiado_largo() {
        let largo = "a".repeat(MAX_BODY_CHARS + 1);
        let e = validate_new(input(MessageKind::Text, Some(&largo), None)).unwrap_err();
        assert_eq!(e, DomainError::MessageTooLong);
    }

    #[test]
    fn el_sistema_no_se_envia_desde_fuera() {
        let e = validate_new(input(MessageKind::System, Some("x"), None)).unwrap_err();
        assert_eq!(e, DomainError::SystemNotAllowed);
    }

    #[test]
    fn documento_normalizado_y_con_comentario_opcional() {
        let m = validate_new(input(
            MessageKind::Document,
            None,
            Some(json!({ "docType": " SINV ", "id": "abc", "number": "" })),
        ))
        .unwrap();
        assert_eq!(
            m.payload,
            Some(json!({ "docType": "SINV", "id": "abc", "number": null }))
        );
        assert!(m.body.is_none());
    }

    #[test]
    fn documento_sin_id_no_vale() {
        let e = validate_new(input(
            MessageKind::Document,
            None,
            Some(json!({ "docType": "SINV", "id": "" })),
        ))
        .unwrap_err();
        assert_eq!(e, DomainError::InvalidPayload("document"));
    }

    #[test]
    fn documento_con_campos_de_mas_no_vale() {
        let e = validate_new(input(
            MessageKind::Document,
            None,
            Some(json!({ "docType": "SINV", "id": "1", "total": 100 })),
        ))
        .unwrap_err();
        assert_eq!(e, DomainError::InvalidPayload("document"));
    }

    #[test]
    fn adjunto_valido() {
        let m = validate_new(input(
            MessageKind::Attachment,
            Some("mira esto"),
            Some(json!({ "files": [
                { "attachmentId": "a1", "name": "plano.pdf", "size": 1024, "mime": "application/pdf" }
            ] })),
        ))
        .unwrap();
        assert_eq!(m.body.as_deref(), Some("mira esto"));
    }

    #[test]
    fn adjuntos_sin_ficheros_o_demasiados_no_valen() {
        let vacio = validate_new(input(
            MessageKind::Attachment,
            None,
            Some(json!({ "files": [] })),
        ));
        assert_eq!(
            vacio.unwrap_err(),
            DomainError::InvalidPayload("attachment")
        );
        let uno = json!({ "attachmentId": "a", "name": "n", "size": 1, "mime": "text/plain" });
        let muchos = vec![uno; MAX_FILES + 1];
        let e = validate_new(input(
            MessageKind::Attachment,
            None,
            Some(json!({ "files": muchos })),
        ));
        assert_eq!(e.unwrap_err(), DomainError::InvalidPayload("attachment"));
    }

    #[test]
    fn reacciones() {
        assert_eq!(validate_emoji(" 👍 ").unwrap(), "👍");
        assert!(validate_emoji("").is_err());
        assert!(validate_emoji(&"👍".repeat(20)).is_err());
    }

    #[test]
    fn solo_se_edita_texto_vivo() {
        assert_eq!(
            validate_edit(MessageKind::Text, false, " nuevo ").unwrap(),
            "nuevo"
        );
        assert_eq!(
            validate_edit(MessageKind::Document, false, "x").unwrap_err(),
            DomainError::NotEditable
        );
        assert_eq!(
            validate_edit(MessageKind::Text, true, "x").unwrap_err(),
            DomainError::NotEditable
        );
    }
}
