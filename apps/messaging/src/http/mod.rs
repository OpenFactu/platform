//! API REST bajo `/rt/v1`. Toda petición lleva el ticket como Bearer (ver
//! `auth.rs`); la empresa y el usuario salen de él, nunca de la URL.

mod conversations;
mod messages;

use axum::extract::State;
use axum::routing::{get, patch, post, put};
use axum::{Json, Router};
use serde_json::{json, Value};
use tower_http::trace::TraceLayer;
use uuid::Uuid;

use crate::auth::Session;
use crate::error::ApiError;
use crate::state::AppState;
use crate::store;
use crate::ws;
use crate::ws::protocol::ServerEvent;

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
        .route(
            "/messages/{id}",
            patch(messages::edit).delete(messages::remove),
        )
        .route("/presence", get(presence));

    Router::new()
        .route("/rt/health", get(health))
        .route("/rt/ws", get(ws::handler))
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
/// acaban de salir, para que la quiten de su lista).
async fn notify_conversation(
    state: &AppState,
    tenant_id: &str,
    conversation_id: Uuid,
    also: &[String],
    event: &ServerEvent,
) -> Result<(), ApiError> {
    let mut users = store::conversations::active_user_ids(&state.db, conversation_id).await?;
    for u in also {
        if !users.contains(u) {
            users.push(u.clone());
        }
    }
    state.broadcaster.publish(tenant_id, &users, event);
    Ok(())
}

/// La conversación tiene que existir, ser de la empresa del ticket y tenerle dentro.
async fn require_member(
    state: &AppState,
    session: &Session,
    conversation_id: Uuid,
) -> Result<store::conversations::Membership, ApiError> {
    store::conversations::membership(
        &state.db,
        &session.tenant_id,
        conversation_id,
        &session.user_id,
    )
    .await?
    .ok_or_else(|| ApiError::not_found("conversation_not_found", "Conversación no encontrada"))
}
