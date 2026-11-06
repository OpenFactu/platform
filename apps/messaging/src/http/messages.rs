use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{notify_conversation, require_member};
use crate::auth::Session;
use crate::channels::{Delivery, ReactionTarget};
use crate::domain::message::{self, MessageKind, NewMessageInput};
use crate::domain::DomainError;
use crate::error::ApiError;
use crate::state::AppState;
use crate::store;
use crate::store::conversations::Membership;
use crate::store::messages::MessageDto;
use crate::ws::protocol::ServerEvent;

const DEFAULT_PAGE: i64 = 50;
const MAX_PAGE: i64 = 100;

#[derive(Deserialize)]
pub struct PageQuery {
    before: Option<Uuid>,
    limit: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    messages: Vec<MessageDto>,
    has_more: bool,
}

pub async fn list(
    State(state): State<AppState>,
    session: Session,
    Path(id): Path<Uuid>,
    Query(q): Query<PageQuery>,
) -> Result<Json<Page>, ApiError> {
    require_member(&state, &session, id).await?;
    let limit = q.limit.unwrap_or(DEFAULT_PAGE).clamp(1, MAX_PAGE);
    let messages = store::messages::page(&state.db, &state.vault, id, q.before, limit).await?;
    let has_more = messages.len() as i64 == limit;
    Ok(Json(Page { messages, has_more }))
}

pub async fn send(
    State(state): State<AppState>,
    session: Session,
    Path(id): Path<Uuid>,
    Json(input): Json<NewMessageInput>,
) -> Result<Response, ApiError> {
    session.require_write()?;
    let member = require_member(&state, &session, id).await?;
    let msg = message::validate_new(input)?;

    let channel = state.channels.get(&member.channel).ok_or_else(|| {
        ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "channel_unavailable",
            format!("El canal «{}» no está disponible", member.channel),
        )
    })?;
    let caps = channel.capabilities();
    if msg.kind == MessageKind::Attachment && !caps.attachments {
        return Err(DomainError::AttachmentsNotSupported.into());
    }
    if msg.kind == MessageKind::Document && !caps.documents {
        return Err(DomainError::UnsupportedByChannel.into());
    }
    if let Some(reply) = msg.reply_to_id {
        if !store::messages::belongs_to(&state.db, reply, id).await? {
            return Err(DomainError::ReplyNotFound.into());
        }
    }

    let (dto, created) = store::messages::insert(
        &state.db,
        &state.vault,
        &session.tenant_id,
        id,
        member.participant_id,
        &msg,
    )
    .await?;
    if !created {
        return Ok(Json(dto).into_response());
    }

    // Guardado primero y entregado después: si el proveedor falla, el mensaje
    // no se pierde, el equipo lo sigue viendo y queda marcado con el error.
    let dto = deliver(&state, &session, &member, dto).await?;
    notify_conversation(
        &state,
        &session.tenant_id,
        id,
        &[],
        &ServerEvent::MessageCreated {
            message: dto.clone(),
        },
    )
    .await?;
    Ok((StatusCode::CREATED, Json(dto)).into_response())
}

/// Entrega el mensaje al proveedor del canal y deja apuntado el resultado.
pub(super) async fn deliver(
    state: &AppState,
    session: &Session,
    member: &Membership,
    dto: MessageDto,
) -> Result<MessageDto, ApiError> {
    let Some(channel) = state.channels.get(&member.channel) else {
        return Ok(dto);
    };
    let outcome = channel
        .deliver(
            state,
            Delivery {
                tenant_id: &session.tenant_id,
                external_ref: member.external_ref.as_deref(),
                message: &dto,
            },
        )
        .await;
    Ok(match outcome {
        Ok(None) => dto,
        Ok(Some(external_id)) => {
            store::messages::set_delivery(&state.db, dto.id, Some(&external_id), None).await?;
            MessageDto {
                delivery_error: None,
                ..dto
            }
        }
        Err(e) => {
            tracing::warn!(error = %e, channel = channel.id(), "No se pudo entregar al proveedor");
            let reason = e.to_string();
            store::messages::set_delivery(&state.db, dto.id, None, Some(&reason)).await?;
            MessageDto {
                delivery_error: Some(reason),
                ..dto
            }
        }
    })
}

/// Vuelve a intentar entregar al proveedor un mensaje propio que falló.
pub async fn retry(
    State(state): State<AppState>,
    session: Session,
    Path(id): Path<Uuid>,
) -> Result<Json<MessageDto>, ApiError> {
    session.require_write()?;
    let owner = own_message(&state, &session, id).await?;
    let member = require_member(&state, &session, owner.conversation_id).await?;
    let dto = store::messages::get(&state.db, &state.vault, id)
        .await?
        .ok_or_else(|| ApiError::not_found("message_not_found", "Mensaje no encontrado"))?;
    if dto.delivery_error.is_none() || dto.deleted_at.is_some() {
        return Ok(Json(dto));
    }
    let dto = deliver(&state, &session, &member, dto).await?;
    notify_conversation(
        &state,
        &session.tenant_id,
        owner.conversation_id,
        &[],
        &ServerEvent::MessageUpdated {
            message: dto.clone(),
        },
    )
    .await?;
    Ok(Json(dto))
}

#[derive(Deserialize)]
pub struct EditInput {
    body: String,
}

pub async fn edit(
    State(state): State<AppState>,
    session: Session,
    Path(id): Path<Uuid>,
    Json(input): Json<EditInput>,
) -> Result<Json<MessageDto>, ApiError> {
    session.require_write()?;
    let owner = own_message(&state, &session, id).await?;
    let body = message::validate_edit(owner.kind, owner.deleted, &input.body)?;
    let dto = store::messages::edit(&state.db, &state.vault, &session.tenant_id, id, &body).await?;
    notify_conversation(
        &state,
        &session.tenant_id,
        owner.conversation_id,
        &[],
        &ServerEvent::MessageUpdated {
            message: dto.clone(),
        },
    )
    .await?;
    Ok(Json(dto))
}

pub async fn remove(
    State(state): State<AppState>,
    session: Session,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    session.require_write()?;
    let owner = own_message(&state, &session, id).await?;
    // Una reunión se cancela (`/meetings/{id}/cancel`): borrar su anuncio la
    // dejaría viva y sin rastro en la conversación.
    if owner.kind == MessageKind::Meeting {
        return Err(DomainError::NotEditable.into());
    }
    if !owner.deleted {
        store::messages::soft_delete(&state.db, id).await?;
        notify_conversation(
            &state,
            &session.tenant_id,
            owner.conversation_id,
            &[],
            &ServerEvent::MessageDeleted {
                conversation_id: owner.conversation_id,
                message_id: id,
            },
        )
        .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadInput {
    message_id: Uuid,
}

pub async fn read(
    State(state): State<AppState>,
    session: Session,
    Path(id): Path<Uuid>,
    Json(input): Json<ReadInput>,
) -> Result<StatusCode, ApiError> {
    // Marcar como leído no escribe nada visible para otros: basta con leer.
    let member = require_member(&state, &session, id).await?;
    let advanced =
        store::messages::mark_read(&state.db, member.participant_id, id, input.message_id).await?;
    if advanced {
        notify_conversation(
            &state,
            &session.tenant_id,
            id,
            &[],
            &ServerEvent::Read {
                conversation_id: id,
                user_id: session.user_id.clone(),
                message_id: input.message_id,
                read_at: chrono::Utc::now(),
            },
        )
        .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct ReactionInput {
    emoji: String,
    active: bool,
}

pub async fn react(
    State(state): State<AppState>,
    session: Session,
    Path(id): Path<Uuid>,
    Json(input): Json<ReactionInput>,
) -> Result<StatusCode, ApiError> {
    session.require_write()?;
    let emoji = message::validate_emoji(&input.emoji)?;
    let not_found = || ApiError::not_found("message_not_found", "Mensaje no encontrado");
    let owner = store::messages::owner(&state.db, &session.tenant_id, id)
        .await?
        .ok_or_else(not_found)?;
    let member = require_member(&state, &session, owner.conversation_id)
        .await
        .map_err(|_| not_found())?;
    if owner.deleted {
        return Err(DomainError::NotEditable.into());
    }
    let reactions =
        store::messages::set_reaction(&state.db, id, &session.user_id, &emoji, input.active)
            .await?;

    // Si el mensaje pasó por un canal, el bot deja allí la reacción del equipo.
    // Si el proveedor no la acepta (no está en su lista), se queda en Keirost.
    if let (Some(external_ref), Some(external_id), Some(channel)) = (
        member.external_ref.as_deref(),
        owner.external_id.as_deref(),
        state.channels.get(&member.channel),
    ) {
        let current = store::messages::latest_team_reaction(&state.db, id).await?;
        let target = ReactionTarget {
            tenant_id: &session.tenant_id,
            external_ref,
            external_message_id: external_id,
        };
        if let Err(e) = channel.react(&state, target, current.as_deref()).await {
            tracing::warn!(error = %e, channel = channel.id(), "El proveedor no aceptó la reacción");
        }
    }
    notify_conversation(
        &state,
        &session.tenant_id,
        owner.conversation_id,
        &[],
        &ServerEvent::MessageReactions {
            conversation_id: owner.conversation_id,
            message_id: id,
            reactions,
        },
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// El mensaje existe, es de una conversación en la que está y lo escribió él.
async fn own_message(
    state: &AppState,
    session: &Session,
    id: Uuid,
) -> Result<store::messages::MessageOwner, ApiError> {
    let not_found = || ApiError::not_found("message_not_found", "Mensaje no encontrado");
    let owner = store::messages::owner(&state.db, &session.tenant_id, id)
        .await?
        .ok_or_else(not_found)?;
    let member = require_member(state, session, owner.conversation_id)
        .await
        .map_err(|_| not_found())?;
    if owner.author_participant_id != Some(member.participant_id) {
        return Err(DomainError::OnlyAuthor.into());
    }
    Ok(owner)
}
