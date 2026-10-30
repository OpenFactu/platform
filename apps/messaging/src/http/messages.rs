use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{notify_conversation, require_member};
use crate::auth::Session;
use crate::domain::message::{self, MessageKind, NewMessageInput};
use crate::domain::DomainError;
use crate::error::ApiError;
use crate::state::AppState;
use crate::store;
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
    let messages = store::messages::page(&state.db, id, q.before, limit).await?;
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
    if msg.kind == MessageKind::Attachment && !channel.capabilities().attachments {
        return Err(DomainError::AttachmentsNotSupported.into());
    }
    if let Some(reply) = msg.reply_to_id {
        if !store::messages::belongs_to(&state.db, reply, id).await? {
            return Err(DomainError::ReplyNotFound.into());
        }
    }

    let (dto, created) = store::messages::insert(
        &state.db,
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
    // no se pierde y el equipo lo sigue viendo.
    if let Err(e) = channel.deliver(&member, &dto).await {
        tracing::warn!(error = %e, channel = channel.id(), "No se pudo entregar al proveedor");
    }
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
    let dto = store::messages::edit(&state.db, id, &body).await?;
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
    require_member(&state, &session, owner.conversation_id)
        .await
        .map_err(|_| not_found())?;
    if owner.deleted {
        return Err(DomainError::NotEditable.into());
    }
    let reactions =
        store::messages::set_reaction(&state.db, id, &session.user_id, &emoji, input.active)
            .await?;
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
