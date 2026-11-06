//! API REST bajo `/rt/v1`. Toda petición lleva el ticket como Bearer (ver
//! `auth.rs`); la empresa y el usuario salen de él, nunca de la URL.

mod calls;
mod channels;
mod conversations;
mod internal;
mod meetings;
mod messages;

use axum::extract::{DefaultBodyLimit, State};
use axum::routing::{get, patch, post, put};
use axum::{Json, Router};
use serde_json::{json, Value};
use tower_http::trace::TraceLayer;
use uuid::Uuid;

use crate::auth::Session;
use crate::domain::conversation::ConversationKind;
use crate::error::ApiError;
use crate::state::AppState;
use crate::store;
use crate::ws;
use crate::ws::protocol::ServerEvent;

/// La mensajería de una empresa al restaurar una copia.
const MAX_IMPORT_BYTES: usize = 1024 * 1024 * 1024;

pub fn router(state: AppState) -> Router {
    let v1 = Router::new()
        .route(
            "/conversations",
            get(conversations::list).post(conversations::create),
        )
        .route(
            "/conversations/{id}",
            get(conversations::one).patch(conversations::update),
        )
        .route(
            "/conversations/{id}/messages",
            get(messages::list).post(messages::send),
        )
        .route("/conversations/{id}/read", post(messages::read))
        .route("/conversations/{id}/prefs", patch(conversations::prefs))
        .route(
            "/conversations/{id}/pins/{message_id}",
            put(conversations::pin).delete(conversations::unpin),
        )
        .route("/messages/{id}/reactions", post(messages::react))
        .route("/messages/{id}/retry", post(messages::retry))
        .route(
            "/messages/{id}",
            patch(messages::edit).delete(messages::remove),
        )
        .route("/presence", get(presence))
        .route("/channels", get(channels::list))
        .route(
            "/channels/telegram",
            put(channels::connect_telegram).delete(channels::disconnect_telegram),
        )
        .route("/contacts/{id}", patch(channels::link_contact))
        .route("/conversations/{id}/meetings", post(meetings::create))
        .route("/conversations/{id}/calls", post(calls::start))
        .route("/meetings/{id}/call", post(calls::start_for_meeting))
        .route("/calls", get(calls::active))
        .route("/calls/{id}/invites", post(calls::invite_to_call))
        .route("/meetings/{id}/invites", post(calls::invite_to_meeting))
        .route("/conversations/{id}/invites", get(calls::list_invites))
        .route("/invites/{id}", axum::routing::delete(calls::revoke_invite))
        .route("/rtc/config", get(calls::rtc_config))
        .route("/meetings", get(meetings::list))
        .route("/meetings/providers", get(meetings::providers))
        .route("/meetings/{id}", patch(meetings::update))
        .route("/meetings/{id}/cancel", post(meetings::cancel));

    Router::new()
        .route("/rt/health", get(health))
        .route("/rt/ws", get(ws::handler))
        .route("/rt/guest/ws", get(ws::guest_handler))
        .route("/internal/tenants/{id}/export", get(internal::export))
        .route(
            "/internal/tenants/{id}/import",
            post(internal::import).layer(DefaultBodyLimit::max(MAX_IMPORT_BYTES)),
        )
        .nest("/rt/v1", v1)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn health(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    sqlx::query("SELECT 1").execute(&state.db).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn presence(State(state): State<AppState>, session: Session) -> Json<Value> {
    Json(json!({ "online": state.hub.online_users(&session.tenant_id) }))
}

/// Avisa a quienes siguen en la conversación (y a `also`, p. ej. los que
/// acaban de salir, para que la quiten de su lista). Las de clientes son de la
/// bandeja: se avisa a todos los que atienden clientes.
async fn notify_conversation(
    state: &AppState,
    tenant_id: &str,
    conversation_id: Uuid,
    also: &[String],
    event: &ServerEvent,
) -> Result<(), ApiError> {
    if store::conversations::kind_of(&state.db, conversation_id).await?
        == Some(ConversationKind::Customer)
    {
        state.broadcaster.publish_customers(tenant_id, event);
        return Ok(());
    }
    let mut users = store::conversations::active_user_ids(&state.db, conversation_id).await?;
    for u in also {
        if !users.contains(u) {
            users.push(u.clone());
        }
    }
    state.broadcaster.publish(tenant_id, &users, event);
    Ok(())
}

/// La conversación tiene que existir, ser de la empresa del ticket y tenerle
/// dentro (o, si es de un cliente, que pueda atender clientes).
async fn require_member(
    state: &AppState,
    session: &Session,
    conversation_id: Uuid,
) -> Result<store::conversations::Membership, ApiError> {
    store::conversations::access(
        &state.db,
        &session.tenant_id,
        conversation_id,
        &session.user_id,
        session.customers,
    )
    .await?
    .ok_or_else(|| ApiError::not_found("conversation_not_found", "Conversación no encontrada"))
}
