use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use uuid::Uuid;

use super::{notify_conversation, require_member};
use crate::auth::Session;
use crate::domain::conversation::{
    self, ConversationPatch, NewConversationInput, ValidConversation,
};
use crate::domain::DomainError;
use crate::error::ApiError;
use crate::state::AppState;
use crate::store;
use crate::store::conversations::{ConversationSummary, Prefs};
use crate::ws::protocol::ServerEvent;

pub async fn list(
    State(state): State<AppState>,
    session: Session,
) -> Result<Json<Vec<ConversationSummary>>, ApiError> {
    let rows =
        store::conversations::list_for_user(&state.db, &session.tenant_id, &session.user_id, None)
            .await?;
    Ok(Json(rows))
}

pub async fn one(
    State(state): State<AppState>,
    session: Session,
    Path(id): Path<Uuid>,
) -> Result<Json<ConversationSummary>, ApiError> {
    summary(&state, &session, id).await.map(Json)
}

pub async fn create(
    State(state): State<AppState>,
    session: Session,
    Json(input): Json<NewConversationInput>,
) -> Result<Response, ApiError> {
    session.require_write()?;
    let conv: ValidConversation = conversation::validate_new(&session.user_id, input)?;
    ensure_in_tenant(&state, &session, &conv.others).await?;

    let (id, created) =
        store::conversations::create(&state.db, &session.tenant_id, &session.user_id, &conv)
            .await?;
    if created {
        notify_conversation(
            &state,
            &session.tenant_id,
            id,
            &[],
            &ServerEvent::ConversationUpdated {
                conversation_id: id,
            },
        )
        .await?;
    }

    let body = summary(&state, &session, id).await?;
    let status = if created {
        StatusCode::CREATED
    } else {
        StatusCode::OK
    };
    Ok((status, Json(body)).into_response())
}

pub async fn update(
    State(state): State<AppState>,
    session: Session,
    Path(id): Path<Uuid>,
    Json(input): Json<ConversationPatch>,
) -> Result<Response, ApiError> {
    session.require_write()?;
    let member = require_member(&state, &session, id).await?;
    let current = store::conversations::active_user_ids(&state.db, id).await?;
    let patch = conversation::validate_patch(
        member.kind,
        &session.user_id,
        member.role,
        current.len(),
        input,
    )?;
    ensure_in_tenant(&state, &session, &patch.add).await?;

    store::conversations::apply_patch(&state.db, &session.tenant_id, id, &patch).await?;
    notify_conversation(
        &state,
        &session.tenant_id,
        id,
        &patch.remove,
        &ServerEvent::ConversationUpdated {
            conversation_id: id,
        },
    )
    .await?;

    // Si uno mismo ha salido ya no la ve: no hay nada que devolver.
    if patch.remove.contains(&session.user_id) {
        return Ok(StatusCode::NO_CONTENT.into_response());
    }
    Ok(Json(summary(&state, &session, id).await?).into_response())
}

/// Favorita, archivada, silenciada, marcada sin leer: solo para quien la cambia.
pub async fn prefs(
    State(state): State<AppState>,
    session: Session,
    Path(id): Path<Uuid>,
    Json(input): Json<Prefs>,
) -> Result<Json<ConversationSummary>, ApiError> {
    let member = require_member(&state, &session, id).await?;
    store::conversations::set_prefs(&state.db, member.participant_id, &input).await?;
    // Sus otras pestañas también tienen que enterarse.
    state.broadcaster.publish(
        &session.tenant_id,
        std::slice::from_ref(&session.user_id),
        &ServerEvent::ConversationUpdated {
            conversation_id: id,
        },
    );
    Ok(Json(summary(&state, &session, id).await?))
}

pub async fn pin(
    state: State<AppState>,
    session: Session,
    path: Path<(Uuid, Uuid)>,
) -> Result<StatusCode, ApiError> {
    set_pinned(state, session, path, true).await
}

pub async fn unpin(
    state: State<AppState>,
    session: Session,
    path: Path<(Uuid, Uuid)>,
) -> Result<StatusCode, ApiError> {
    set_pinned(state, session, path, false).await
}

/// Los fijados son de la conversación: los ve y los cambia cualquiera de dentro.
async fn set_pinned(
    State(state): State<AppState>,
    session: Session,
    Path((id, message_id)): Path<(Uuid, Uuid)>,
    pinned: bool,
) -> Result<StatusCode, ApiError> {
    session.require_write()?;
    require_member(&state, &session, id).await?;
    if !store::messages::belongs_to(&state.db, message_id, id).await? {
        return Err(ApiError::not_found(
            "message_not_found",
            "Mensaje no encontrado",
        ));
    }
    store::conversations::set_pinned(&state.db, id, message_id, &session.user_id, pinned).await?;
    notify_conversation(
        &state,
        &session.tenant_id,
        id,
        &[],
        &ServerEvent::ConversationUpdated {
            conversation_id: id,
        },
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn summary(
    state: &AppState,
    session: &Session,
    id: Uuid,
) -> Result<ConversationSummary, ApiError> {
    store::conversations::summary_for_user(&state.db, &session.tenant_id, &session.user_id, id)
        .await?
        .ok_or_else(|| ApiError::not_found("conversation_not_found", "Conversación no encontrada"))
}

/// Todos tienen que ser de la misma empresa que el ticket.
async fn ensure_in_tenant(
    state: &AppState,
    session: &Session,
    user_ids: &[String],
) -> Result<(), ApiError> {
    if user_ids.is_empty() {
        return Ok(());
    }
    let found = store::tenant_members(&state.db, &session.tenant_id, user_ids).await?;
    if user_ids.iter().all(|u| found.contains(u)) {
        Ok(())
    } else {
        Err(DomainError::NotInTenant.into())
    }
}
