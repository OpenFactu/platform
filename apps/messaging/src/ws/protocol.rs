//! Lo que viaja por `/rt/ws`. JSON con un campo `type`; los nombres de campo en
//! camelCase, como el resto de la API que consume la web.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::rtc::{CallState, ChatLine, WaitingGuest};
use crate::store::messages::MessageDto;

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all_fields = "camelCase")]
pub enum ServerEvent {
    /// Autenticado; quién está en línea ahora mismo en la empresa.
    #[serde(rename = "ready")]
    Ready {
        user_id: String,
        online: Vec<String>,
    },
    #[serde(rename = "message.created")]
    MessageCreated { message: MessageDto },
    #[serde(rename = "message.updated")]
    MessageUpdated { message: MessageDto },
    /// Cómo quedan las reacciones de un mensaje: `[{ emoji, userIds }]`.
    #[serde(rename = "message.reactions")]
    MessageReactions {
        conversation_id: Uuid,
        message_id: Uuid,
        reactions: Value,
    },
    #[serde(rename = "message.deleted")]
    MessageDeleted {
        conversation_id: Uuid,
        message_id: Uuid,
    },
    /// Algo cambió (título, participantes, se creó): el cliente la vuelve a pedir.
    #[serde(rename = "conversation.updated")]
    ConversationUpdated { conversation_id: Uuid },
    #[serde(rename = "read")]
    Read {
        conversation_id: Uuid,
        user_id: String,
        message_id: Uuid,
        read_at: chrono::DateTime<chrono::Utc>,
    },
    #[serde(rename = "typing")]
    Typing {
        conversation_id: Uuid,
        user_id: String,
    },
    #[serde(rename = "presence")]
    Presence { user_id: String, online: bool },
    #[serde(rename = "error")]
    Error { code: &'static str },
    #[serde(rename = "pong")]
    Pong,
    /// Empieza una llamada en una conversación tuya.
    #[serde(rename = "call.ringing")]
    CallRinging { call: CallState },
    /// Quién está dentro y qué tiene encendido.
    #[serde(rename = "call.updated")]
    CallUpdated { call: CallState },
    #[serde(rename = "call.ended")]
    CallEnded {
        call_id: Uuid,
        conversation_id: Uuid,
    },
    /// Respuesta a `call.join`: tu número de participante y la respuesta SDP.
    #[serde(rename = "call.joined")]
    CallJoined {
        call_id: Uuid,
        peer_id: u64,
        sdp: Value,
        /// Lo que se ha escrito hasta ahora en la llamada.
        chat: Vec<ChatLine>,
    },
    /// Oferta del servidor: alguien entró o salió.
    #[serde(rename = "call.offer")]
    CallOffer { call_id: Uuid, sdp: Value },
    /// Quién espera a que le dejen entrar (solo a los del equipo que están dentro).
    #[serde(rename = "call.lobby")]
    CallLobby {
        call_id: Uuid,
        waiting: Vec<WaitingGuest>,
    },
    #[serde(rename = "call.chat")]
    CallChat { call_id: Uuid, line: ChatLine },
    /// Al invitado: está en la sala de espera.
    #[serde(rename = "guest.waiting")]
    GuestWaiting,
    /// Al invitado: le han dejado pasar.
    #[serde(rename = "guest.admitted")]
    GuestAdmitted { call: CallState, ice_servers: Value },
    /// Al invitado: no entra (le han rechazado o el enlace ya no vale).
    #[serde(rename = "guest.rejected")]
    GuestRejected,
    #[serde(rename = "call.error")]
    CallError { call_id: Uuid, code: &'static str },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all_fields = "camelCase")]
pub enum ClientEvent {
    /// Primer mensaje obligatorio: el ticket va aquí y no en la URL, para que no
    /// acabe en los logs de los proxies.
    #[serde(rename = "auth")]
    Auth { ticket: String },
    /// Ticket nuevo antes de que caduque el anterior; el socket sigue abierto.
    #[serde(rename = "ticket.refresh")]
    TicketRefresh { ticket: String },
    #[serde(rename = "typing")]
    Typing { conversation_id: Uuid },
    #[serde(rename = "call.join")]
    CallJoin { call_id: Uuid, sdp: Value },
    /// Respuesta del navegador a una `call.offer`.
    #[serde(rename = "call.answer")]
    CallAnswer { call_id: Uuid, sdp: Value },
    #[serde(rename = "call.leave")]
    CallLeave { call_id: Uuid },
    /// `auto`, `medium` o `low`: la capa más alta que quiere recibir.
    #[serde(rename = "call.quality")]
    CallQuality { call_id: Uuid, quality: String },
    #[serde(rename = "call.chat")]
    CallChat { call_id: Uuid, text: String },
    /// Dejar pasar a un invitado de la sala de espera, o no.
    #[serde(rename = "call.admit")]
    CallAdmit {
        call_id: Uuid,
        guest_id: u64,
        admit: bool,
    },
    #[serde(rename = "call.media")]
    CallMedia {
        call_id: Uuid,
        mic: bool,
        cam: bool,
        screen: bool,
    },
    #[serde(rename = "ping")]
    Ping,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn eventos_con_tipo_y_camel_case() {
        let ev = ServerEvent::Typing {
            conversation_id: Uuid::nil(),
            user_id: "u1".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["type"], "typing");
        assert_eq!(json["userId"], "u1");
        assert!(json.get("conversationId").is_some());
    }

    #[test]
    fn lee_eventos_del_cliente() {
        let ev: ClientEvent = serde_json::from_str(
            r#"{"type":"typing","conversationId":"00000000-0000-0000-0000-000000000000"}"#,
        )
        .unwrap();
        assert!(matches!(ev, ClientEvent::Typing { .. }));
    }
}
