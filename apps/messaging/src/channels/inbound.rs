//! Entrada común de lo que llega de un proveedor externo. El adaptador traduce
//! su formato a `InboundMessage` y esto hace el resto, igual para todos:
//! contacto, conversación, ficheros al almacenamiento de la empresa, mensaje y
//! aviso a la bandeja de clientes.

use serde_json::json;

use crate::domain::message::{MessageKind, ValidMessage};
use crate::state::AppState;
use crate::store;
use crate::store::channels::ChannelAccount;
use crate::ws::protocol::ServerEvent;

pub struct InboundMessage {
    /// La conversación en el proveedor (chat de Telegram…).
    pub external_chat_id: String,
    /// El mensaje en el proveedor: si llega dos veces, se guarda una.
    pub external_message_id: String,
    pub sender_name: String,
    pub sender_username: Option<String>,
    pub text: Option<String>,
    pub files: Vec<InboundFile>,
}

pub struct InboundFile {
    pub name: String,
    pub mime: String,
    pub bytes: Vec<u8>,
}

pub async fn ingest(
    state: &AppState,
    account: &ChannelAccount,
    msg: InboundMessage,
) -> anyhow::Result<()> {
    let tenant = account.tenant_id.as_str();
    let channel = account.channel.as_str();

    let contact = store::channels::upsert_contact(
        &state.db,
        tenant,
        channel,
        &msg.external_chat_id,
        &msg.sender_name,
        msg.sender_username.as_deref(),
    )
    .await?;
    let (conversation_id, contact_participant, created) =
        store::conversations::find_or_create_customer(
            &state.db,
            tenant,
            channel,
            &msg.external_chat_id,
            contact.id,
            &contact.display_name,
        )
        .await?;

    // Los ficheros van al almacenamiento de la empresa, como cualquier adjunto.
    let mut files = Vec::with_capacity(msg.files.len());
    for file in msg.files {
        match state
            .erp
            .upload(
                tenant,
                &conversation_id.to_string(),
                &file.name,
                &file.mime,
                file.bytes,
            )
            .await
        {
            Ok(stored) => files.push(json!({
                "attachmentId": stored.id,
                "name": stored.file_name,
                "size": stored.size,
                "mime": stored.mime,
            })),
            Err(e) => tracing::warn!(error = %e, tenant, "No se pudo guardar un fichero entrante"),
        }
    }

    let body = msg
        .text
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());
    if body.is_none() && files.is_empty() {
        return Ok(());
    }
    let message = ValidMessage {
        kind: if files.is_empty() {
            MessageKind::Text
        } else {
            MessageKind::Attachment
        },
        body,
        payload: (!files.is_empty()).then(|| json!({ "files": files })),
        // Con el id del proveedor: un reintento suyo no duplica el mensaje.
        client_msg_id: Some(format!("{channel}:{}", msg.external_message_id)),
        reply_to_id: None,
    };
    let (dto, inserted) = store::messages::insert(
        &state.db,
        &state.vault,
        tenant,
        conversation_id,
        contact_participant,
        &message,
    )
    .await?;
    if !inserted {
        return Ok(());
    }
    // Su id en el proveedor: para casar después las reacciones.
    store::messages::set_delivery(&state.db, dto.id, Some(&msg.external_message_id), None).await?;

    if created {
        state.broadcaster.publish_customers(
            tenant,
            &ServerEvent::ConversationUpdated { conversation_id },
        );
    }
    state
        .broadcaster
        .publish_customers(tenant, &ServerEvent::MessageCreated { message: dto });
    Ok(())
}

/// Alguien de fuera cambia sus reacciones a un mensaje (el proveedor manda
/// siempre el conjunto completo).
pub struct InboundReaction {
    pub external_chat_id: String,
    pub external_message_id: String,
    pub emojis: Vec<String>,
}

pub async fn ingest_reaction(
    state: &AppState,
    account: &ChannelAccount,
    reaction: InboundReaction,
) -> anyhow::Result<()> {
    let tenant = account.tenant_id.as_str();
    let Some((conversation_id, contact_id)) = store::conversations::customer_by_external(
        &state.db,
        tenant,
        &account.channel,
        &reaction.external_chat_id,
    )
    .await?
    else {
        return Ok(());
    };
    let Some(message_id) = store::messages::find_by_external(
        &state.db,
        conversation_id,
        &reaction.external_message_id,
    )
    .await?
    else {
        return Ok(());
    };
    let reactions = store::messages::replace_reactions(
        &state.db,
        message_id,
        &format!("contact:{contact_id}"),
        &reaction.emojis,
    )
    .await?;
    state.broadcaster.publish_customers(
        tenant,
        &ServerEvent::MessageReactions {
            conversation_id,
            message_id,
            reactions,
        },
    );
    Ok(())
}
