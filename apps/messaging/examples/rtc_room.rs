//! Banco de pruebas del SFU: varios participantes en una página, sin cámara ni
//! sesión (un lienzo y un tono), contra el mismo motor que usa el servicio.
//!
//!     node scripts/cargo.mjs run --example rtc_room
//!     → http://localhost:3197

#[path = "../src/rtc/engine.rs"]
#[allow(dead_code)]
mod engine;

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use axum::extract::{Path, State};
use axum::response::Html;
use axum::routing::{get, post};
use axum::{Json, Router};
use engine::{Engine, Notice, PeerId};
use serde_json::{json, Value};
use str0m::change::{SdpAnswer, SdpOffer};
use str0m::crypto::from_feature_flags;
use tokio::net::{TcpListener, UdpSocket};
use uuid::Uuid;

type Inbox = Arc<Mutex<HashMap<PeerId, Vec<Value>>>>;

#[derive(Clone)]
struct App {
    engine: Engine,
    inbox: Inbox,
}

const PAGE: &str = include_str!("rtc_room.html");

async fn join(
    State(app): State<App>,
    Path(peer): Path<PeerId>,
    Json(offer): Json<SdpOffer>,
) -> Json<Value> {
    let room = Uuid::nil();
    Json(match app.engine.join(room, peer, offer).await {
        Ok(answer) => serde_json::to_value(answer).expect("respuesta"),
        Err(e) => json!({ "error": e.to_string() }),
    })
}

async fn answer(State(app): State<App>, Path(peer): Path<PeerId>, Json(a): Json<SdpAnswer>) {
    app.engine.answer(peer, a).await;
}

async fn leave(State(app): State<App>, Path(peer): Path<PeerId>) {
    app.engine.leave(peer).await;
}

async fn max(State(app): State<App>, Path((peer, layer)): Path<(PeerId, String)>) {
    let layer = (layer != "auto").then(|| layer.as_str().into());
    app.engine.set_max_layer(peer, layer).await;
}

async fn poll(State(app): State<App>, Path(peer): Path<PeerId>) -> Json<Vec<Value>> {
    let mut inbox = app.inbox.lock().expect("buzón");
    Json(inbox.remove(&peer).unwrap_or_default())
}

#[tokio::main]
async fn main() {
    from_feature_flags().install_process_default();
    let socket = UdpSocket::bind("127.0.0.1:0").await.expect("socket UDP");
    let addr: SocketAddr = socket.local_addr().expect("dirección");
    let (engine, mut notices) = Engine::spawn(socket, addr, 3);

    let inbox: Inbox = Arc::default();
    let sink = inbox.clone();
    tokio::spawn(async move {
        while let Some(notice) = notices.recv().await {
            println!("{notice:?}");
            if let Notice::Offer { peer, offer } = notice {
                let value = serde_json::to_value(offer).expect("oferta");
                sink.lock()
                    .expect("buzón")
                    .entry(peer)
                    .or_default()
                    .push(value);
            }
        }
    });

    let app = Router::new()
        .route("/", get(|| async { Html(PAGE) }))
        .route("/join/{peer}", post(join))
        .route("/answer/{peer}", post(answer))
        .route("/leave/{peer}", post(leave))
        .route("/poll/{peer}", get(poll))
        .route("/max/{peer}/{layer}", post(max))
        .with_state(App { engine, inbox });
    let listener = TcpListener::bind("127.0.0.1:3197").await.expect("puerto");
    println!("http://localhost:3197");
    axum::serve(listener, app).await.expect("servidor");
}
