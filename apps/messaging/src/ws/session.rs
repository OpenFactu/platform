use std::collections::HashMap;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::extract::ws::{CloseFrame, Message, WebSocket};
use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use uuid::Uuid;

use super::protocol::{ClientEvent, ServerEvent};
use crate::auth::{AuthError, Session};
use crate::state::AppState;
use crate::store;

const AUTH_TIMEOUT: Duration = Duration::from_secs(10);
const PING_EVERY: Duration = Duration::from_secs(30);
/// Sin noticias del cliente en este tiempo, la conexión se da por muerta.
const IDLE_LIMIT: Duration = Duration::from_secs(75);
/// "Escribiendo…" como mucho una vez cada tanto por conversación.
const TYPING_EVERY: Duration = Duration::from_secs(2);
/// Margen tras caducar el ticket para que llegue el `ticket.refresh`.
const EXPIRY_GRACE_SECS: u64 = 60;

/// Códigos de cierre propios (rango 4000-4999 reservado a aplicaciones).
const CLOSE_UNAUTHORIZED: u16 = 4401;

type Sink = SplitSink<WebSocket, Message>;

pub async fn run(socket: WebSocket, state: AppState) {
    let (mut sink, mut stream) = socket.split();

    let mut session = match authenticate(&mut stream, &state).await {
        Ok(s) => s,
        Err(e) => {
            let _ = send(&mut sink, &ServerEvent::Error { code: e.code() }).await;
            close(&mut sink, CLOSE_UNAUTHORIZED, e.code()).await;
            return;
        }
    };

    let tenant = session.tenant_id.clone();
    let user = session.user_id.clone();
    let mut reg = state.hub.register(&tenant, &user);
    if reg.came_online {
        state.hub.publish_tenant(
            &tenant,
            &ServerEvent::Presence {
                user_id: user.clone(),
                online: true,
            },
        );
    }

    let ready = ServerEvent::Ready {
        user_id: user.clone(),
        online: state.hub.online_users(&tenant),
    };
    if send(&mut sink, &ready).await.is_ok() {
        let mut ping = tokio::time::interval(PING_EVERY);
        ping.tick().await; // el primero salta al instante
        let mut last_seen = Instant::now();
        let mut last_typing: HashMap<Uuid, Instant> = HashMap::new();

        loop {
            tokio::select! {
                outgoing = reg.rx.recv() => {
                    let Some(text) = outgoing else { break };
                    if sink.send(Message::Text(text)).await.is_err() {
                        break;
                    }
                }
                incoming = stream.next() => {
                    let Some(Ok(msg)) = incoming else { break };
                    last_seen = Instant::now();
                    match msg {
                        Message::Text(text) => {
                            let reply = handle_client_event(
                                &state, &mut session, &mut last_typing, text.as_str(),
                            )
                            .await;
                            match reply {
                                Ok(Some(ev)) => {
                                    if send(&mut sink, &ev).await.is_err() {
                                        break;
                                    }
                                }
                                Ok(None) => {}
                                Err(code) => {
                                    let _ = send(&mut sink, &ServerEvent::Error { code }).await;
                                    close(&mut sink, CLOSE_UNAUTHORIZED, code).await;
                                    break;
                                }
                            }
                        }
                        Message::Close(_) => break,
                        _ => {}
                    }
                }
                _ = ping.tick() => {
                    if last_seen.elapsed() > IDLE_LIMIT {
                        break;
                    }
                    if unix_now() > session.expires_at + EXPIRY_GRACE_SECS {
                        let code = AuthError::Expired.code();
                        let _ = send(&mut sink, &ServerEvent::Error { code }).await;
                        close(&mut sink, CLOSE_UNAUTHORIZED, code).await;
                        break;
                    }
                    if sink.send(Message::Ping(Default::default())).await.is_err() {
                        break;
                    }
                }
            }
        }
    }

    if state.hub.unregister(&tenant, &user, reg.id) {
        state.hub.publish_tenant(
            &tenant,
            &ServerEvent::Presence {
                user_id: user,
                online: false,
            },
        );
    }
}

/// Espera el `auth` como primer mensaje.
async fn authenticate(
    stream: &mut SplitStream<WebSocket>,
    state: &AppState,
) -> Result<Session, AuthError> {
    let first = tokio::time::timeout(AUTH_TIMEOUT, async {
        while let Some(Ok(msg)) = stream.next().await {
            match msg {
                Message::Text(text) => return Some(text),
                Message::Close(_) => return None,
                _ => continue,
            }
        }
        None
    })
    .await
    .ok()
    .flatten()
    .ok_or(AuthError::Missing)?;

    match serde_json::from_str::<ClientEvent>(first.as_str()) {
        Ok(ClientEvent::Auth { ticket }) => state.tickets.verify(&ticket),
        _ => Err(AuthError::Missing),
    }
}

/// `Err(code)` cierra la conexión.
async fn handle_client_event(
    state: &AppState,
    session: &mut Session,
    last_typing: &mut HashMap<Uuid, Instant>,
    text: &str,
) -> Result<Option<ServerEvent>, &'static str> {
    let Ok(event) = serde_json::from_str::<ClientEvent>(text) else {
        return Ok(Some(ServerEvent::Error { code: "bad_event" }));
    };

    match event {
        ClientEvent::Ping => Ok(Some(ServerEvent::Pong)),
        ClientEvent::Auth { .. } => Ok(None),
        ClientEvent::TicketRefresh { ticket } => {
            let fresh = state.tickets.verify(&ticket).map_err(|e| e.code())?;
            // El ticket nuevo tiene que ser de la misma persona y empresa.
            if fresh.user_id != session.user_id || fresh.tenant_id != session.tenant_id {
                return Err(AuthError::Invalid.code());
            }
            *session = fresh;
            Ok(None)
        }
        ClientEvent::Typing { conversation_id } => {
            let now = Instant::now();
            if last_typing
                .get(&conversation_id)
                .is_some_and(|t| now.duration_since(*t) < TYPING_EVERY)
            {
                return Ok(None);
            }
            last_typing.insert(conversation_id, now);
            if let Err(e) = publish_typing(state, session, conversation_id).await {
                tracing::warn!(error = %e, "No se pudo avisar de que escribe");
            }
            Ok(None)
        }
    }
}

async fn publish_typing(
    state: &AppState,
    session: &Session,
    conversation_id: Uuid,
) -> Result<(), sqlx::Error> {
    let member = store::conversations::membership(
        &state.db,
        &session.tenant_id,
        conversation_id,
        &session.user_id,
    )
    .await?;
    if member.is_none() {
        return Ok(());
    }
    let others: Vec<String> = store::conversations::active_user_ids(&state.db, conversation_id)
        .await?
        .into_iter()
        .filter(|u| *u != session.user_id)
        .collect();
    state.broadcaster.publish(
        &session.tenant_id,
        &others,
        &ServerEvent::Typing {
            conversation_id,
            user_id: session.user_id.clone(),
        },
    );
    Ok(())
}

async fn send(sink: &mut Sink, event: &ServerEvent) -> Result<(), axum::Error> {
    let text = serde_json::to_string(event).expect("los eventos siempre serializan");
    sink.send(Message::Text(text.into())).await
}

async fn close(sink: &mut Sink, code: u16, reason: &'static str) {
    let _ = sink
        .send(Message::Close(Some(CloseFrame {
            code,
            reason: reason.into(),
        })))
        .await;
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default()
}
