//! `/rt/guest/ws`: la conexión de un invitado sin cuenta. Lo único del servicio
//! que no pasa por un ticket del ERP: entra con el token de un enlace, espera a
//! que alguien de dentro le deje pasar y, ya en la llamada, solo puede hacer lo
//! de la llamada. No hay acceso a conversaciones, mensajes ni personas.

use std::time::{Duration, Instant};

use axum::extract::ws::{Message, WebSocket};
use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use uuid::Uuid;

use super::protocol::{ClientEvent, ServerEvent};
use crate::rtc::{guest_scope, Calls, GuestTicket};
use crate::state::AppState;
use crate::store;
use crate::store::invites::InviteRow;

const HELLO_TIMEOUT: Duration = Duration::from_secs(15);
/// Frena a quien pruebe enlaces, aunque el token no se pueda adivinar.
const BAD_TOKEN_DELAY: Duration = Duration::from_secs(1);
const PING_EVERY: Duration = Duration::from_secs(30);
const IDLE_LIMIT: Duration = Duration::from_secs(75);

#[derive(Deserialize)]
struct Hello {
    token: String,
    name: String,
}

type Sink = SplitSink<WebSocket, Message>;

pub async fn run(socket: WebSocket, state: AppState) {
    let (mut sink, mut stream) = socket.split();
    let Some(hello) = read_hello(&mut stream).await else {
        return;
    };
    let invite = match store::invites::find_valid(&state.db, &hello.token).await {
        Ok(Some(invite)) => invite,
        Ok(None) => {
            tokio::time::sleep(BAD_TOKEN_DELAY).await;
            let _ = send(
                &mut sink,
                &ServerEvent::Error {
                    code: "invite_invalid",
                },
            )
            .await;
            return;
        }
        Err(e) => {
            tracing::error!(error = %e, "No se pudo comprobar el enlace");
            let _ = send(&mut sink, &ServerEvent::Error { code: "internal" }).await;
            return;
        }
    };
    let Some(name) = Calls::valid_guest_name(&hello.name) else {
        let _ = send(&mut sink, &ServerEvent::Error { code: "bad_name" }).await;
        return;
    };

    let scope = guest_scope(&invite.tenant_id);
    let user_id = format!("guest:{}", Uuid::now_v7());
    let mut reg = state.hub.register(&scope, &user_id, false);
    let ticket = GuestTicket {
        guest_id: reg.id,
        scope: scope.clone(),
        user_id: user_id.clone(),
    };

    if state
        .calls
        .wait_in_lobby(&state, &invite, name.clone(), &ticket)
        .await
    {
        if send(&mut sink, &ServerEvent::GuestWaiting).await.is_ok() {
            session(
                &mut sink,
                &mut stream,
                &mut reg.rx,
                &state,
                &invite,
                &name,
                &ticket,
            )
            .await;
        }
        state.calls.guest_gone(&state, &invite, reg.id).await;
    } else {
        let _ = send(&mut sink, &ServerEvent::Error { code: "lobby_full" }).await;
    }
    state.hub.unregister(&scope, &user_id, reg.id);
}

async fn read_hello(stream: &mut SplitStream<WebSocket>) -> Option<Hello> {
    tokio::time::timeout(HELLO_TIMEOUT, async {
        while let Some(Ok(msg)) = stream.next().await {
            if let Message::Text(text) = msg {
                return serde_json::from_str(text.as_str()).ok();
            }
        }
        None
    })
    .await
    .ok()
    .flatten()
}

async fn session(
    sink: &mut Sink,
    stream: &mut SplitStream<WebSocket>,
    rx: &mut tokio::sync::mpsc::Receiver<axum::extract::ws::Utf8Bytes>,
    state: &AppState,
    invite: &InviteRow,
    name: &str,
    ticket: &GuestTicket,
) {
    let mut ping = tokio::time::interval(PING_EVERY);
    ping.tick().await;
    let mut last_seen = Instant::now();
    loop {
        tokio::select! {
            outgoing = rx.recv() => {
                let Some(text) = outgoing else { return };
                if sink.send(Message::Text(text)).await.is_err() {
                    return;
                }
            }
            incoming = stream.next() => {
                let Some(Ok(msg)) = incoming else { return };
                last_seen = Instant::now();
                match msg {
                    Message::Text(text) => {
                        if let Some(reply) = handle(state, invite, name, ticket, text.as_str()).await {
                            if send(sink, &reply).await.is_err() {
                                return;
                            }
                        }
                    }
                    Message::Close(_) => return,
                    _ => {}
                }
            }
            _ = ping.tick() => {
                if last_seen.elapsed() > IDLE_LIMIT
                    || sink.send(Message::Ping(Default::default())).await.is_err()
                {
                    return;
                }
            }
        }
    }
}

/// Lo único que puede hacer un invitado. El resto de eventos se ignora, y dejar
/// pasar a otros, por ejemplo, también.
async fn handle(
    state: &AppState,
    invite: &InviteRow,
    name: &str,
    ticket: &GuestTicket,
    text: &str,
) -> Option<ServerEvent> {
    let conn = ticket.guest_id;
    match serde_json::from_str::<ClientEvent>(text).ok()? {
        ClientEvent::Ping => Some(ServerEvent::Pong),
        ClientEvent::CallJoin { call_id, sdp } => Some(
            state
                .calls
                .join_guest(state, ticket, invite, name, call_id, sdp)
                .await,
        ),
        ClientEvent::CallAnswer { call_id, sdp } => {
            state.calls.answer(conn, call_id, sdp).await;
            None
        }
        ClientEvent::CallLeave { call_id } => {
            state.calls.leave(conn, call_id).await;
            None
        }
        ClientEvent::CallQuality { call_id, quality } => {
            state.calls.set_quality(conn, call_id, &quality).await;
            None
        }
        ClientEvent::CallMedia {
            call_id,
            mic,
            cam,
            screen,
        } => {
            state
                .calls
                .set_media(state, conn, call_id, (mic, cam, screen))
                .await;
            None
        }
        ClientEvent::CallChat { call_id, text } => {
            state.calls.chat(state, conn, call_id, &text);
            None
        }
        _ => None,
    }
}

async fn send(sink: &mut Sink, event: &ServerEvent) -> Result<(), axum::Error> {
    let text = serde_json::to_string(event).expect("los eventos siempre serializan");
    sink.send(Message::Text(text.into())).await
}
