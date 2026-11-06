//! Reuniones: programarlas en una conversación, reprogramarlas, cancelarlas y
//! listar las próximas. Cada una se anuncia con un mensaje `meeting` y cada
//! cambio llega a la conversación como ese mensaje editado.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use super::messages::deliver;
use super::{notify_conversation, require_member};
use crate::auth::Session;
use crate::domain::meeting::{self, MeetingInput, ValidMeeting};
use crate::domain::DomainError;
use crate::error::ApiError;
use crate::meetings::{JoinInfo, MeetingError, MeetingRequest, ProviderMeeting};
use crate::state::AppState;
use crate::store;
use crate::store::meetings::{MeetingDto, MeetingRow, NewMeeting, Window};
use crate::store::messages::MessageDto;
use crate::ws::protocol::ServerEvent;

const DEFAULT_LIMIT: i64 = 100;
const MAX_LIMIT: i64 = 500;

/// Proveedores con los que se puede programar ahora mismo.
pub async fn providers(State(state): State<AppState>, _session: Session) -> Json<Value> {
    Json(json!({ "providers": state.meetings.ids() }))
}

pub async fn create(
    State(state): State<AppState>,
    session: Session,
    Path(conversation_id): Path<Uuid>,
    Json(input): Json<MeetingInput>,
) -> Result<(StatusCode, Json<MessageDto>), ApiError> {
    session.require_write()?;
    let member = require_member(&state, &session, conversation_id).await?;
    let valid = meeting::validate(input, Utc::now())?;
    let provider = state
        .meetings
        .get(&valid.provider)
        .ok_or(DomainError::UnknownMeetingProvider)?;

    let request = request_for(&state, &session, conversation_id, &valid).await?;
    let created = provider.create(&request).await.map_err(provider_error)?;
    let (join_url, external_id) = join_of(created);

    let row = store::meetings::create(
        &state.db,
        &state.vault,
        NewMeeting {
            tenant_id: &session.tenant_id,
            conversation_id,
            author_participant_id: member.participant_id,
            organizer_id: &session.user_id,
            meeting: &valid,
            join_url,
            external_id,
        },
    )
    .await?;
    let dto = store::messages::get(&state.db, &state.vault, row.message_id)
        .await?
        .ok_or_else(|| ApiError::not_found("message_not_found", "Mensaje no encontrado"))?;
    // Como un mensaje más: al proveedor del canal (un cliente por Telegram la
    // recibe como texto) y a la conversación.
    let dto = deliver(&state, &session, &member, dto).await?;
    notify_conversation(
        &state,
        &session.tenant_id,
        conversation_id,
        &[],
        &ServerEvent::MessageCreated {
            message: dto.clone(),
        },
    )
    .await?;
    Ok((StatusCode::CREATED, Json(dto)))
}

/// Reprogramar: título, horario y enlace. Solo quien la organiza.
pub async fn update(
    State(state): State<AppState>,
    session: Session,
    Path(id): Path<Uuid>,
    Json(input): Json<MeetingInput>,
) -> Result<Json<MessageDto>, ApiError> {
    session.require_write()?;
    let mut row = organized_by_me(&state, &session, id).await?;
    if row.cancelled_at.is_some() {
        return Err(DomainError::MeetingCancelled.into());
    }
    let valid = meeting::validate(input, Utc::now())?;
    let provider = state
        .meetings
        .get(&row.provider)
        .ok_or(DomainError::UnknownMeetingProvider)?;
    let request = request_for(&state, &session, row.conversation_id, &valid).await?;
    let updated = provider
        .update(row.external_id.as_deref(), &request)
        .await
        .map_err(provider_error)?;
    let (join_url, external_id) = join_of(updated);

    row.title = valid.title.clone();
    row.starts_at = valid.starts_at;
    row.ends_at = valid.ends_at;
    row.join_url = join_url;
    row.external_id = external_id.or(row.external_id);
    store::meetings::save(&state.db, &state.vault, &row, valid.summary.as_deref()).await?;
    changed(&state, &session, &row).await
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CancelInput {
    /// Aviso en texto para quien solo recibe texto (ver `MeetingInput::summary`).
    #[serde(default)]
    summary: Option<String>,
}

/// Cancelar. Solo quien la organiza; la tarjeta queda en la conversación tachada.
pub async fn cancel(
    State(state): State<AppState>,
    session: Session,
    Path(id): Path<Uuid>,
    body: Option<Json<CancelInput>>,
) -> Result<Json<MessageDto>, ApiError> {
    session.require_write()?;
    let mut row = organized_by_me(&state, &session, id).await?;
    if row.cancelled_at.is_some() {
        return changed(&state, &session, &row).await;
    }
    if let Some(provider) = state.meetings.get(&row.provider) {
        provider
            .cancel(row.external_id.as_deref())
            .await
            .map_err(provider_error)?;
    }
    row.cancelled_at = Some(Utc::now());
    let summary = body.and_then(|Json(b)| b.summary);
    let summary = summary.as_deref().map(str::trim).filter(|s| !s.is_empty());
    store::meetings::save(&state.db, &state.vault, &row, summary).await?;
    changed(&state, &session, &row).await
}

#[derive(Deserialize)]
pub struct ListQuery {
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
    limit: Option<i64>,
}

/// Mis reuniones, de todas mis conversaciones: las próximas o, con `from` y `to`,
/// las de ese tramo (lo que pinta el calendario).
pub async fn list(
    State(state): State<AppState>,
    session: Session,
    Query(q): Query<ListQuery>,
) -> Result<Json<Vec<MeetingDto>>, ApiError> {
    let limit = q.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let window = match (q.from, q.to) {
        (Some(from), Some(to)) => Window::Range(from, to),
        _ => Window::Upcoming,
    };
    Ok(Json(
        store::meetings::list(
            &state.db,
            &state.vault,
            &session.tenant_id,
            &session.user_id,
            session.customers,
            window,
            limit,
        )
        .await?,
    ))
}

async fn organized_by_me(
    state: &AppState,
    session: &Session,
    id: Uuid,
) -> Result<MeetingRow, ApiError> {
    let row = store::meetings::get(&state.db, &state.vault, &session.tenant_id, id)
        .await?
        .ok_or_else(|| ApiError::not_found("meeting_not_found", "Reunión no encontrada"))?;
    // Sigue haciendo falta estar en la conversación (o atender clientes).
    require_member(state, session, row.conversation_id).await?;
    if row.organizer_id != session.user_id {
        return Err(DomainError::OnlyOrganizer.into());
    }
    Ok(row)
}

/// La reunión cambió: su mensaje, reescrito, a la conversación.
async fn changed(
    state: &AppState,
    session: &Session,
    row: &MeetingRow,
) -> Result<Json<MessageDto>, ApiError> {
    let dto = store::messages::get(&state.db, &state.vault, row.message_id)
        .await?
        .ok_or_else(|| ApiError::not_found("message_not_found", "Mensaje no encontrado"))?;
    notify_conversation(
        state,
        &session.tenant_id,
        row.conversation_id,
        &[],
        &ServerEvent::MessageUpdated {
            message: dto.clone(),
        },
    )
    .await?;
    Ok(Json(dto))
}

async fn request_for(
    state: &AppState,
    session: &Session,
    conversation_id: Uuid,
    valid: &ValidMeeting,
) -> Result<MeetingRequest, ApiError> {
    Ok(MeetingRequest {
        tenant_id: session.tenant_id.clone(),
        organizer_id: session.user_id.clone(),
        title: valid.title.clone(),
        starts_at: valid.starts_at,
        ends_at: valid.ends_at,
        attendee_ids: store::conversations::active_user_ids(&state.db, conversation_id).await?,
        join_url: valid.join_url.clone(),
    })
}

fn join_of(meeting: ProviderMeeting) -> (Option<String>, Option<String>) {
    let url = match meeting.join {
        JoinInfo::Url(url) => Some(url),
        JoinInfo::KeirostRoom => None,
    };
    (url, meeting.external_id)
}

fn provider_error(e: MeetingError) -> ApiError {
    match e {
        MeetingError::MissingUrl => DomainError::InvalidMeeting("url").into(),
        MeetingError::NotConnected => ApiError::new(
            StatusCode::CONFLICT,
            "provider_not_connected",
            e.to_string(),
        ),
        MeetingError::Provider(_) => {
            ApiError::new(StatusCode::BAD_GATEWAY, "provider_error", e.to_string())
        }
    }
}
