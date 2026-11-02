//! Empezar llamadas y lo que el navegador necesita para conectarse. Entrar y
//! salir van por `/rt/ws`: ver `rtc/mod.rs`.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use chrono::{DateTime, Duration, Utc};
use serde_json::{json, Value};
use uuid::Uuid;

use super::require_member;
use crate::auth::Session;
use crate::domain::conversation::ConversationKind;
use crate::domain::DomainError;
use crate::error::ApiError;
use crate::rtc::CallState;
use crate::state::AppState;
use crate::store;
use crate::store::invites::{InviteDto, NewInvite};
use crate::ws::protocol::ServerEvent;

/// Empieza una llamada en la conversación, o devuelve la que ya hay.
pub async fn start(
    State(state): State<AppState>,
    session: Session,
    Path(conversation_id): Path<Uuid>,
) -> Result<Json<CallState>, ApiError> {
    start_call(&state, &session, conversation_id, None).await
}

/// Entrar en una reunión de Keirost: la llamada de su conversación.
pub async fn start_for_meeting(
    State(state): State<AppState>,
    session: Session,
    Path(meeting_id): Path<Uuid>,
) -> Result<Json<CallState>, ApiError> {
    let meeting = store::meetings::get(&state.db, &state.vault, &session.tenant_id, meeting_id)
        .await?
        .ok_or_else(|| ApiError::not_found("meeting_not_found", "Reunión no encontrada"))?;
    if meeting.cancelled_at.is_some() {
        return Err(DomainError::MeetingCancelled.into());
    }
    start_call(&state, &session, meeting.conversation_id, Some(meeting_id)).await
}

async fn start_call(
    state: &AppState,
    session: &Session,
    conversation_id: Uuid,
    meeting_id: Option<Uuid>,
) -> Result<Json<CallState>, ApiError> {
    session.require_calls()?;
    let member = require_member(state, session, conversation_id).await?;
    if member.kind == ConversationKind::Customer {
        return Err(DomainError::CallsNotSupported.into());
    }
    if !state.calls.available() {
        return Err(ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "video_unavailable",
            "El servicio de vídeo no está disponible",
        ));
    }
    let (row, created) = store::calls::start_or_get(
        &state.db,
        &session.tenant_id,
        conversation_id,
        meeting_id,
        &session.user_id,
    )
    .await?;
    let call = state.calls.state_of(&row);
    if created {
        let others: Vec<String> = store::conversations::active_user_ids(&state.db, conversation_id)
            .await?
            .into_iter()
            .filter(|u| *u != session.user_id)
            .collect();
        state.broadcaster.publish(
            &session.tenant_id,
            &others,
            &ServerEvent::CallRinging { call: call.clone() },
        );
    }
    Ok(Json(call))
}

/// Las llamadas en curso de mis conversaciones: al abrir la app, para ofrecer
/// volver a entrar.
pub async fn active(
    State(state): State<AppState>,
    session: Session,
) -> Result<Json<Vec<CallState>>, ApiError> {
    if !session.calls {
        return Ok(Json(Vec::new()));
    }
    let rows =
        store::calls::active_for_user(&state.db, &session.tenant_id, &session.user_id).await?;
    Ok(Json(rows.iter().map(|r| state.calls.state_of(r)).collect()))
}

/// Con qué conectarse (servidores TURN con credenciales temporales) y, para el
/// diagnóstico del administrador, qué dirección se está anunciando.
pub async fn rtc_config(State(state): State<AppState>, session: Session) -> Json<Value> {
    Json(
        state
            .calls
            .client_config(&session.user_id, Utc::now().timestamp()),
    )
}

/// Cuánto vale como mínimo un enlace de reunión (y tras terminar ella, un margen).
const MEETING_INVITE_HOURS: i64 = 24;
/// Un enlace de llamada muere con ella: esto es solo un tope.
const CALL_INVITE_HOURS: i64 = 12;

/// Un enlace para que entre alguien sin cuenta en esta llamada.
pub async fn invite_to_call(
    State(state): State<AppState>,
    session: Session,
    Path(call_id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    session.require_calls()?;
    let call = store::calls::active(&state.db, &session.tenant_id, call_id)
        .await?
        .ok_or_else(|| ApiError::not_found("call_not_found", "Llamada no encontrada"))?;
    create_invite(
        &state,
        &session,
        call.conversation_id,
        Some(call_id),
        None,
        Utc::now() + Duration::hours(CALL_INVITE_HOURS),
    )
    .await
}

/// Un enlace para una reunión de Keirost: vale hasta que termine.
pub async fn invite_to_meeting(
    State(state): State<AppState>,
    session: Session,
    Path(meeting_id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    session.require_calls()?;
    let meeting = store::meetings::get(&state.db, &state.vault, &session.tenant_id, meeting_id)
        .await?
        .ok_or_else(|| ApiError::not_found("meeting_not_found", "Reunión no encontrada"))?;
    if meeting.cancelled_at.is_some() {
        return Err(DomainError::MeetingCancelled.into());
    }
    let expires: DateTime<Utc> = (Utc::now() + Duration::hours(MEETING_INVITE_HOURS))
        .max(meeting.ends_at + Duration::hours(1));
    create_invite(
        &state,
        &session,
        meeting.conversation_id,
        None,
        Some(meeting_id),
        expires,
    )
    .await
}

async fn create_invite(
    state: &AppState,
    session: &Session,
    conversation_id: Uuid,
    call_id: Option<Uuid>,
    meeting_id: Option<Uuid>,
    expires_at: DateTime<Utc>,
) -> Result<Json<Value>, ApiError> {
    session.require_write()?;
    let member = require_member(state, session, conversation_id).await?;
    if member.kind == ConversationKind::Customer {
        return Err(DomainError::CallsNotSupported.into());
    }
    let (invite, token) = store::invites::create(
        &state.db,
        NewInvite {
            tenant_id: &session.tenant_id,
            conversation_id,
            call_id,
            meeting_id,
            created_by: &session.user_id,
            expires_at,
        },
    )
    .await?;
    Ok(Json(json!({ "invite": invite, "token": token })))
}

/// Los enlaces vigentes de una conversación (sin el token, que no se guarda).
pub async fn list_invites(
    State(state): State<AppState>,
    session: Session,
    Path(conversation_id): Path<Uuid>,
) -> Result<Json<Vec<InviteDto>>, ApiError> {
    session.require_calls()?;
    require_member(&state, &session, conversation_id).await?;
    Ok(Json(
        store::invites::list_active(&state.db, &session.tenant_id, conversation_id).await?,
    ))
}

pub async fn revoke_invite(
    State(state): State<AppState>,
    session: Session,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    session.require_calls()?;
    let conversation_id = store::invites::conversation_of(&state.db, &session.tenant_id, id)
        .await?
        .ok_or_else(|| ApiError::not_found("invite_not_found", "Enlace no encontrado"))?;
    require_member(&state, &session, conversation_id).await?;
    store::invites::revoke(&state.db, id).await?;
    state
        .calls
        .invite_revoked(&state, &session.tenant_id, conversation_id, id)
        .await;
    Ok(StatusCode::NO_CONTENT)
}
