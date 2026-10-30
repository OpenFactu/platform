//! `/rt/ws`: una conexión por pestaña. Solo empuja eventos; las acciones
//! (enviar, editar, leer) van por REST, que responde y se puede reintentar.

pub mod protocol;
mod session;

use axum::extract::ws::WebSocketUpgrade;
use axum::extract::State;
use axum::response::Response;

use crate::state::AppState;

pub async fn handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.max_message_size(64 * 1024)
        .on_upgrade(move |socket| session::run(socket, state))
}
