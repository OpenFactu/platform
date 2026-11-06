//! Videollamadas: quién está en cada llamada, sobre el SFU de `engine.rs`.
//!
//! Solo hay estado en memoria de quién está dentro, quién espera en la sala de
//! espera y el chat de la llamada. Las llamadas en sí están en la tabla `call`, y
//! al arrancar se cierran las que quedaron abiertas.
//!
//! Los invitados (sin cuenta, ver `ws/guest.rs`) van en el hub bajo otra clave de
//! empresa (`guest_scope`): así nunca les llega nada de la empresa, como la
//! presencia del equipo o los mensajes. Solo lo que se les envía aquí a ellos.

pub mod engine;

use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use serde::Serialize;
use serde_json::{json, Value};
use sha1::Sha1;
use str0m::change::{SdpAnswer, SdpOffer};
use tokio::net::UdpSocket;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::auth::Session;
use crate::config::RtcConfig;
use crate::domain::conversation::ConversationKind;
use crate::domain::message::{MessageKind, ValidMessage};
use crate::state::AppState;
use crate::store;
use crate::store::calls::CallRow;
use crate::store::invites::InviteRow;
use crate::ws::protocol::ServerEvent;
use engine::{Engine, JoinError, Notice, PeerId};

/// Empezada y sin nadie dentro durante este tiempo: se da por terminada.
const EMPTY_LIMIT_SECS: i64 = 300;
const SWEEP_EVERY: Duration = Duration::from_secs(30);
const TURN_TTL_SECS: i64 = 3600;
const MAX_WAITING: usize = 20;
const MAX_NAME_CHARS: usize = 60;
const MAX_CHAT_CHARS: usize = 2000;
const MAX_CHAT_LINES: usize = 500;
const CHAT_EVERY: Duration = Duration::from_millis(250);

/// El espacio de los invitados en el hub: nada de lo publicado a la empresa llega.
pub fn guest_scope(tenant_id: &str) -> String {
    format!("guest:{tenant_id}")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Participant {
    pub peer_id: PeerId,
    pub user_id: String,
    pub name: String,
    pub guest: bool,
    pub mic: bool,
    pub cam: bool,
    pub screen: bool,
}

/// Lo que ve la web de una llamada.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallState {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub meeting_id: Option<Uuid>,
    pub started_by: String,
    pub started_at: DateTime<Utc>,
    pub participants: Vec<Participant>,
}

/// Una línea del chat de la llamada: vive en memoria y se va al colgar.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatLine {
    pub id: u64,
    pub peer_id: PeerId,
    pub name: String,
    pub text: String,
    pub at: DateTime<Utc>,
}

/// Quien espera a que le dejen entrar.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WaitingGuest {
    pub guest_id: u64,
    pub name: String,
    #[serde(skip)]
    scope: String,
    #[serde(skip)]
    user_id: String,
    #[serde(skip)]
    invite_id: Uuid,
    /// El enlace era de una llamada: al acabar esta, deja de tener sentido esperar.
    #[serde(skip)]
    call_bound: bool,
}

/// Una pestaña dentro de una llamada.
#[derive(Debug, Clone)]
struct Seat {
    peer_id: PeerId,
    call_id: Uuid,
    conn: u64,
    /// Bajo qué clave del hub está esa conexión.
    scope: String,
    tenant_id: String,
    user_id: String,
    name: String,
    guest: bool,
    media: (bool, bool, bool),
    /// Ya ha colgado y el motor lo está sacando: puede volver a entrar.
    leaving: bool,
    last_chat: Option<Instant>,
}

pub struct Calls {
    /// `None` si no se pudo abrir el puerto UDP: el chat sigue, las llamadas no.
    engine: Option<Engine>,
    advertised: Option<SocketAddr>,
    config: RtcConfig,
    next_peer: AtomicU64,
    next_line: AtomicU64,
    seats: Mutex<HashMap<PeerId, Seat>>,
    /// Llamadas en las que ha entrado alguien: las demás no dejan constancia.
    answered: Mutex<HashSet<Uuid>>,
    /// Sala de espera, por conversación: un enlace de reunión llega antes que nadie.
    lobby: Mutex<HashMap<Uuid, Vec<WaitingGuest>>>,
    /// Invitados a los que ya han dejado entrar: conexión → llamada.
    admitted: Mutex<HashMap<u64, Uuid>>,
    chats: Mutex<HashMap<Uuid, Vec<ChatLine>>>,
}

/// Quién es un invitado en el hub.
pub struct GuestTicket {
    /// Su conexión en el hub.
    pub guest_id: u64,
    pub scope: String,
    pub user_id: String,
}

impl Calls {
    pub async fn start(config: &RtcConfig) -> (Arc<Self>, Option<mpsc::Receiver<Notice>>) {
        let ip = config.public_ip.unwrap_or_else(local_ip);
        let bound = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, config.port)).await;
        let (engine, advertised, notices) = match bound {
            Ok(socket) => {
                let advertised = SocketAddr::new(ip, config.port);
                tracing::info!(%advertised, turn = config.turn.is_some(), "Vídeo escuchando");
                let (engine, notices) = Engine::spawn(socket, advertised, config.max_peers);
                (Some(engine), Some(advertised), Some(notices))
            }
            Err(e) => {
                tracing::error!(error = %e, port = config.port, "No se pudo abrir el puerto de vídeo: no habrá llamadas");
                (None, None, None)
            }
        };
        let calls = Self {
            engine,
            advertised,
            config: config.clone(),
            next_peer: AtomicU64::new(1),
            next_line: AtomicU64::new(1),
            seats: Mutex::default(),
            answered: Mutex::default(),
            lobby: Mutex::default(),
            admitted: Mutex::default(),
            chats: Mutex::default(),
        };
        (Arc::new(calls), notices)
    }

    /// Cierra lo que quedó abierto y atiende al motor y a las llamadas vacías.
    pub async fn run_background(state: &AppState, notices: Option<mpsc::Receiver<Notice>>) {
        match store::calls::close_all_open(&state.db).await {
            Ok(0) => {}
            Ok(n) => tracing::info!(n, "Llamadas de antes del reinicio cerradas"),
            Err(e) => tracing::error!(error = %e, "No se pudieron cerrar las llamadas viejas"),
        }
        let Some(mut notices) = notices else {
            return;
        };
        let state = state.clone();
        tokio::spawn(async move {
            let mut sweep = tokio::time::interval(SWEEP_EVERY);
            loop {
                tokio::select! {
                    notice = notices.recv() => {
                        let Some(notice) = notice else { return };
                        state.calls.notice(&state, notice).await;
                    }
                    _ = sweep.tick() => state.calls.end_empty(&state).await,
                }
            }
        });
    }

    fn seats(&self) -> std::sync::MutexGuard<'_, HashMap<PeerId, Seat>> {
        self.seats.lock().expect("asientos")
    }

    fn seat_of(&self, conn: u64, call_id: Uuid) -> Option<Seat> {
        self.seats()
            .values()
            .find(|s| s.conn == conn && s.call_id == call_id && !s.leaving)
            .cloned()
    }

    fn seats_of_call(&self, call_id: Uuid) -> Vec<Seat> {
        self.seats()
            .values()
            .filter(|s| s.call_id == call_id && !s.leaving)
            .cloned()
            .collect()
    }

    pub fn available(&self) -> bool {
        self.engine.is_some()
    }

    /// Estado de una llamada para la web.
    pub fn state_of(&self, row: &CallRow) -> CallState {
        let mut participants: Vec<Participant> = self
            .seats()
            .values()
            .filter(|s| s.call_id == row.id)
            .map(|s| Participant {
                peer_id: s.peer_id,
                user_id: s.user_id.clone(),
                name: s.name.clone(),
                guest: s.guest,
                mic: s.media.0,
                cam: s.media.1,
                screen: s.media.2,
            })
            .collect();
        participants.sort_by_key(|p| p.peer_id);
        CallState {
            id: row.id,
            conversation_id: row.conversation_id,
            meeting_id: row.meeting_id,
            started_by: row.started_by.clone(),
            started_at: row.started_at,
            participants,
        }
    }

    // ── Entrar ──────────────────────────────────────────────────────────────

    pub async fn join(
        &self,
        state: &AppState,
        session: &Session,
        conn: u64,
        call_id: Uuid,
        sdp: Value,
    ) -> ServerEvent {
        match self.try_join(state, session, conn, call_id, sdp).await {
            Ok(event) => event,
            Err(code) => ServerEvent::CallError { call_id, code },
        }
    }

    async fn try_join(
        &self,
        state: &AppState,
        session: &Session,
        conn: u64,
        call_id: Uuid,
        sdp: Value,
    ) -> Result<ServerEvent, &'static str> {
        if !session.calls {
            return Err("calls_required");
        }
        let row = store::calls::active(&state.db, &session.tenant_id, call_id)
            .await
            .map_err(|_| "internal")?
            .ok_or("call_not_found")?;
        let member = store::conversations::access(
            &state.db,
            &session.tenant_id,
            row.conversation_id,
            &session.user_id,
            session.customers,
        )
        .await
        .map_err(|_| "internal")?
        .ok_or("call_not_found")?;
        if member.kind == ConversationKind::Customer {
            return Err("calls_not_supported");
        }
        let reply = self
            .sit(
                state,
                &row,
                Seat {
                    peer_id: 0,
                    call_id: row.id,
                    conn,
                    scope: session.tenant_id.clone(),
                    tenant_id: session.tenant_id.clone(),
                    user_id: session.user_id.clone(),
                    name: session.name.clone(),
                    guest: false,
                    media: (false, false, false),
                    leaving: false,
                    last_chat: None,
                },
                sdp,
            )
            .await?;
        // Quien acaba de entrar ya puede dejar pasar a los que esperan.
        self.send_lobby(state, &row, Some(conn));
        Ok(reply)
    }

    /// Un invitado al que ya han dejado entrar.
    pub async fn join_guest(
        &self,
        state: &AppState,
        ticket: &GuestTicket,
        invite: &InviteRow,
        name: &str,
        call_id: Uuid,
        sdp: Value,
    ) -> ServerEvent {
        let not_found = ServerEvent::CallError {
            call_id,
            code: "call_not_found",
        };
        let admitted = self
            .admitted
            .lock()
            .expect("admitidos")
            .get(&ticket.guest_id)
            == Some(&call_id);
        if !admitted {
            return not_found;
        }
        let Ok(Some(row)) = store::calls::active(&state.db, &invite.tenant_id, call_id).await
        else {
            return not_found;
        };
        let seat = Seat {
            peer_id: 0,
            call_id: row.id,
            conn: ticket.guest_id,
            scope: ticket.scope.clone(),
            tenant_id: invite.tenant_id.clone(),
            user_id: ticket.user_id.clone(),
            name: name.to_string(),
            guest: true,
            media: (false, false, false),
            leaving: false,
            last_chat: None,
        };
        match self.sit(state, &row, seat, sdp).await {
            Ok(event) => event,
            Err(code) => ServerEvent::CallError { call_id, code },
        }
    }

    async fn sit(
        &self,
        state: &AppState,
        row: &CallRow,
        mut seat: Seat,
        sdp: Value,
    ) -> Result<ServerEvent, &'static str> {
        let engine = self.engine.as_ref().ok_or("video_unavailable")?;
        if self.seat_of(seat.conn, row.id).is_some() {
            return Err("already_in_call");
        }
        let offer: SdpOffer = serde_json::from_value(sdp).map_err(|_| "bad_offer")?;
        let peer_id = self.next_peer.fetch_add(1, Ordering::Relaxed);
        seat.peer_id = peer_id;
        // El asiento antes que el motor: en cuanto entra, el motor ya puede
        // mandarle una oferta, y sin asiento se perdería.
        self.seats().insert(peer_id, seat);
        let answer = match engine.join(row.id, peer_id, offer).await {
            Ok(answer) => answer,
            Err(e) => {
                self.seats().remove(&peer_id);
                return Err(match e {
                    JoinError::RoomFull => "call_full",
                    JoinError::BadOffer => "bad_offer",
                    JoinError::Unavailable => "video_unavailable",
                });
            }
        };
        self.answered.lock().expect("contestadas").insert(row.id);
        self.publish_updated(state, row).await;
        let chat = self
            .chats
            .lock()
            .expect("chats")
            .get(&row.id)
            .cloned()
            .unwrap_or_default();
        Ok(ServerEvent::CallJoined {
            call_id: row.id,
            peer_id,
            sdp: serde_json::to_value(answer).map_err(|_| "internal")?,
            chat,
        })
    }

    // ── Sala de espera ──────────────────────────────────────────────────────

    pub fn valid_guest_name(name: &str) -> Option<String> {
        let name = name.trim();
        (!name.is_empty() && name.chars().count() <= MAX_NAME_CHARS).then(|| name.to_string())
    }

    /// Pone al invitado a esperar. `false` si ya hay demasiados esperando.
    pub async fn wait_in_lobby(
        &self,
        state: &AppState,
        invite: &InviteRow,
        name: String,
        ticket: &GuestTicket,
    ) -> bool {
        {
            let mut lobby = self.lobby.lock().expect("sala de espera");
            let waiting = lobby.entry(invite.conversation_id).or_default();
            if waiting.len() >= MAX_WAITING {
                return false;
            }
            waiting.push(WaitingGuest {
                guest_id: ticket.guest_id,
                name,
                scope: ticket.scope.clone(),
                user_id: ticket.user_id.clone(),
                invite_id: invite.id,
                call_bound: invite.call_id.is_some(),
            });
        }
        self.lobby_changed(state, invite.conversation_id, &invite.tenant_id)
            .await;
        true
    }

    /// Se fue el invitado: de la sala de espera y de la llamada.
    pub async fn guest_gone(&self, state: &AppState, invite: &InviteRow, guest_id: u64) {
        let was_waiting = {
            let mut lobby = self.lobby.lock().expect("sala de espera");
            let waiting = lobby.entry(invite.conversation_id).or_default();
            let before = waiting.len();
            waiting.retain(|g| g.guest_id != guest_id);
            before != waiting.len()
        };
        self.admitted.lock().expect("admitidos").remove(&guest_id);
        if was_waiting {
            self.lobby_changed(state, invite.conversation_id, &invite.tenant_id)
                .await;
        }
        self.connection_closed(state, guest_id).await;
    }

    /// Dejar pasar o no. Solo quien está dentro de esa llamada, y del equipo.
    pub async fn decide_guest(
        &self,
        state: &AppState,
        conn: u64,
        call_id: Uuid,
        guest_id: u64,
        admit: bool,
    ) {
        let Some(seat) = self.seat_of(conn, call_id).filter(|s| !s.guest) else {
            return;
        };
        let Ok(Some(row)) = store::calls::active(&state.db, &seat.tenant_id, call_id).await else {
            return;
        };
        let guest = {
            let mut lobby = self.lobby.lock().expect("sala de espera");
            let waiting = lobby.entry(row.conversation_id).or_default();
            let index = waiting.iter().position(|g| g.guest_id == guest_id);
            index.map(|i| waiting.remove(i))
        };
        let Some(guest) = guest else { return };
        if admit {
            self.admitted
                .lock()
                .expect("admitidos")
                .insert(guest_id, call_id);
            let now = Utc::now().timestamp();
            state.hub.send_to(
                &guest.scope,
                &guest.user_id,
                guest.guest_id,
                &ServerEvent::GuestAdmitted {
                    call: self.state_of(&row),
                    ice_servers: self.ice_servers(&guest.user_id, now),
                },
            );
        } else {
            state.hub.send_to(
                &guest.scope,
                &guest.user_id,
                guest.guest_id,
                &ServerEvent::GuestRejected,
            );
        }
        self.send_lobby(state, &row, None);
    }

    /// Se revocó un enlace: quien esperaba con él deja de esperar.
    pub async fn invite_revoked(
        &self,
        state: &AppState,
        tenant_id: &str,
        conversation_id: Uuid,
        invite_id: Uuid,
    ) {
        let gone: Vec<WaitingGuest> = {
            let mut lobby = self.lobby.lock().expect("sala de espera");
            let waiting = lobby.entry(conversation_id).or_default();
            let (gone, keep) = std::mem::take(waiting)
                .into_iter()
                .partition(|g| g.invite_id == invite_id);
            *waiting = keep;
            gone
        };
        for guest in &gone {
            state.hub.send_to(
                &guest.scope,
                &guest.user_id,
                guest.guest_id,
                &ServerEvent::GuestRejected,
            );
        }
        if !gone.is_empty() {
            self.lobby_changed(state, conversation_id, tenant_id).await;
        }
    }

    async fn lobby_changed(&self, state: &AppState, conversation_id: Uuid, tenant_id: &str) {
        if let Ok(Some(row)) =
            store::calls::active_in_conversation(&state.db, tenant_id, conversation_id).await
        {
            self.send_lobby(state, &row, None);
        }
    }

    /// La sala de espera, a quienes están dentro de la llamada y son del equipo
    /// (o solo a una conexión, la que acaba de entrar).
    fn send_lobby(&self, state: &AppState, row: &CallRow, only: Option<u64>) {
        let waiting = self
            .lobby
            .lock()
            .expect("sala de espera")
            .get(&row.conversation_id)
            .cloned()
            .unwrap_or_default();
        let event = ServerEvent::CallLobby {
            call_id: row.id,
            waiting,
        };
        for seat in self.seats_of_call(row.id) {
            if !seat.guest && only.is_none_or(|c| c == seat.conn) {
                state
                    .hub
                    .send_to(&seat.scope, &seat.user_id, seat.conn, &event);
            }
        }
    }

    // ── Durante la llamada ──────────────────────────────────────────────────

    pub async fn answer(&self, conn: u64, call_id: Uuid, sdp: Value) {
        let (Some(seat), Some(engine)) = (self.seat_of(conn, call_id), &self.engine) else {
            return;
        };
        match serde_json::from_value::<SdpAnswer>(sdp) {
            Ok(answer) => engine.answer(seat.peer_id, answer).await,
            Err(e) => tracing::warn!(error = %e, "Respuesta SDP ilegible"),
        }
    }

    pub async fn leave(&self, conn: u64, call_id: Uuid) {
        if let (Some(seat), Some(engine)) = (self.seat_of(conn, call_id), &self.engine) {
            if let Some(found) = self.seats().get_mut(&seat.peer_id) {
                found.leaving = true;
            }
            engine.leave(seat.peer_id).await;
        }
    }

    pub async fn set_quality(&self, conn: u64, call_id: Uuid, quality: &str) {
        let (Some(seat), Some(engine)) = (self.seat_of(conn, call_id), &self.engine) else {
            return;
        };
        let layer = match quality {
            "low" => Some("l".into()),
            "medium" => Some("m".into()),
            _ => None,
        };
        engine.set_max_layer(seat.peer_id, layer).await;
    }

    pub async fn set_media(
        &self,
        state: &AppState,
        conn: u64,
        call_id: Uuid,
        media: (bool, bool, bool),
    ) {
        let Some(seat) = self.seat_of(conn, call_id) else {
            return;
        };
        if let Some(found) = self.seats().get_mut(&seat.peer_id) {
            found.media = media;
        }
        match store::calls::active(&state.db, &seat.tenant_id, call_id).await {
            Ok(Some(row)) => self.publish_updated(state, &row).await,
            Ok(None) => {}
            Err(e) => tracing::warn!(error = %e, "No se pudo leer la llamada"),
        }
    }

    /// El chat de la llamada: lo ven solo los que están dentro, y no se guarda.
    pub fn chat(&self, state: &AppState, conn: u64, call_id: Uuid, text: &str) {
        let text = text.trim();
        if text.is_empty() || text.chars().count() > MAX_CHAT_CHARS {
            return;
        }
        let Some(seat) = self.seat_of(conn, call_id) else {
            return;
        };
        {
            let mut seats = self.seats();
            let Some(found) = seats.get_mut(&seat.peer_id) else {
                return;
            };
            if found.last_chat.is_some_and(|at| at.elapsed() < CHAT_EVERY) {
                return;
            }
            found.last_chat = Some(Instant::now());
        }
        let line = ChatLine {
            id: self.next_line.fetch_add(1, Ordering::Relaxed),
            peer_id: seat.peer_id,
            name: seat.name.clone(),
            text: text.to_string(),
            at: Utc::now(),
        };
        {
            let mut chats = self.chats.lock().expect("chats");
            let lines = chats.entry(call_id).or_default();
            if lines.len() >= MAX_CHAT_LINES {
                lines.remove(0);
            }
            lines.push(line.clone());
        }
        let event = ServerEvent::CallChat { call_id, line };
        for seat in self.seats_of_call(call_id) {
            state
                .hub
                .send_to(&seat.scope, &seat.user_id, seat.conn, &event);
        }
    }

    /// Se cerró el websocket: esa pestaña sale de sus llamadas.
    pub async fn connection_closed(&self, _state: &AppState, conn: u64) {
        let Some(engine) = &self.engine else { return };
        let peers: Vec<PeerId> = self
            .seats()
            .values_mut()
            .filter(|s| s.conn == conn && !s.leaving)
            .map(|s| {
                s.leaving = true;
                s.peer_id
            })
            .collect();
        for peer in peers {
            engine.leave(peer).await;
        }
    }

    // ── Avisos del motor y final ────────────────────────────────────────────

    async fn notice(&self, state: &AppState, notice: Notice) {
        match notice {
            Notice::Offer { peer, offer } => {
                let Some(seat) = self.seats().get(&peer).cloned() else {
                    return;
                };
                let Ok(sdp) = serde_json::to_value(offer) else {
                    return;
                };
                state.hub.send_to(
                    &seat.scope,
                    &seat.user_id,
                    seat.conn,
                    &ServerEvent::CallOffer {
                        call_id: seat.call_id,
                        sdp,
                    },
                );
            }
            Notice::Left { room, peer } => {
                let seat = self.seats().remove(&peer);
                let Some(seat) = seat else { return };
                if let Err(e) = self.someone_left(state, room, &seat).await {
                    tracing::error!(error = %e, "No se pudo actualizar la llamada");
                }
            }
        }
    }

    async fn someone_left(
        &self,
        state: &AppState,
        room: Uuid,
        seat: &Seat,
    ) -> Result<(), sqlx::Error> {
        let remaining: Vec<Seat> = self
            .seats()
            .values()
            .filter(|s| s.call_id == room)
            .cloned()
            .collect();
        if remaining.is_empty() {
            return self.finish(state, room).await;
        }
        let row = store::calls::active(&state.db, &seat.tenant_id, room).await?;
        // Sin nadie del equipo dentro, la llamada no sigue solo con invitados.
        if remaining.iter().all(|s| s.guest) {
            for guest in &remaining {
                if let Some(row) = &row {
                    state.hub.send_to(
                        &guest.scope,
                        &guest.user_id,
                        guest.conn,
                        &ServerEvent::CallEnded {
                            call_id: room,
                            conversation_id: row.conversation_id,
                        },
                    );
                }
                self.leave(guest.conn, room).await;
            }
            return Ok(());
        }
        if let Some(row) = row {
            self.publish_updated(state, &row).await;
        }
        Ok(())
    }

    /// Las que se empezaron y siguen sin nadie dentro.
    async fn end_empty(&self, state: &AppState) {
        let rows = match store::calls::open_older_than(&state.db, EMPTY_LIMIT_SECS).await {
            Ok(rows) => rows,
            Err(e) => {
                tracing::warn!(error = %e, "No se pudieron revisar las llamadas");
                return;
            }
        };
        for row in rows {
            let empty = !self.seats().values().any(|s| s.call_id == row.id);
            if empty {
                if let Err(e) = self.finish(state, row.id).await {
                    tracing::error!(error = %e, "No se pudo cerrar la llamada");
                }
            }
        }
    }

    /// Termina la llamada, avisa y deja constancia en la conversación.
    async fn finish(&self, state: &AppState, id: Uuid) -> Result<(), sqlx::Error> {
        let Some(row) = store::calls::end(&state.db, id).await? else {
            return Ok(());
        };
        self.chats.lock().expect("chats").remove(&id);
        self.admitted
            .lock()
            .expect("admitidos")
            .retain(|_, call| *call != id);
        // Los que esperaban con un enlace de esta llamada ya no van a entrar.
        let gone: Vec<WaitingGuest> = {
            let mut lobby = self.lobby.lock().expect("sala de espera");
            let waiting = lobby.entry(row.conversation_id).or_default();
            let (gone, keep) = std::mem::take(waiting)
                .into_iter()
                .partition(|g| g.call_bound);
            *waiting = keep;
            gone
        };
        for guest in gone {
            state.hub.send_to(
                &guest.scope,
                &guest.user_id,
                guest.guest_id,
                &ServerEvent::GuestRejected,
            );
        }

        let users = store::conversations::active_user_ids(&state.db, row.conversation_id).await?;
        state.broadcaster.publish(
            &row.tenant_id,
            &users,
            &ServerEvent::CallEnded {
                call_id: row.id,
                conversation_id: row.conversation_id,
            },
        );

        // Nadie llegó a entrar: no hay nada que contar.
        if !self.answered.lock().expect("contestadas").remove(&row.id) {
            return Ok(());
        }
        let Some(author) =
            store::calls::participant_of(&state.db, row.conversation_id, &row.started_by).await?
        else {
            return Ok(());
        };
        let message = ValidMessage {
            kind: MessageKind::Call,
            body: None,
            payload: Some(json!({
                "callId": row.id,
                "startedBy": row.started_by,
                "seconds": (Utc::now() - row.started_at).num_seconds().max(0),
            })),
            client_msg_id: None,
            reply_to_id: None,
        };
        let (dto, _) = store::messages::insert(
            &state.db,
            &state.vault,
            &row.tenant_id,
            row.conversation_id,
            author,
            &message,
        )
        .await?;
        state.broadcaster.publish(
            &row.tenant_id,
            &users,
            &ServerEvent::MessageCreated { message: dto },
        );
        Ok(())
    }

    /// Al equipo de la conversación y a los invitados que estén dentro.
    async fn publish_updated(&self, state: &AppState, row: &CallRow) {
        let event = ServerEvent::CallUpdated {
            call: self.state_of(row),
        };
        match store::conversations::active_user_ids(&state.db, row.conversation_id).await {
            Ok(users) => state.broadcaster.publish(&row.tenant_id, &users, &event),
            Err(e) => tracing::warn!(error = %e, "No se pudo avisar de la llamada"),
        }
        for seat in self.seats_of_call(row.id) {
            if seat.guest {
                state
                    .hub
                    .send_to(&seat.scope, &seat.user_id, seat.conn, &event);
            }
        }
    }

    fn ice_servers(&self, user_id: &str, now: i64) -> Value {
        let servers = self
            .config
            .turn
            .as_ref()
            .map(|turn| {
                let (username, credential) = turn_credentials(&turn.secret, user_id, now);
                vec![json!({ "urls": [turn.url], "username": username, "credential": credential })]
            })
            .unwrap_or_default();
        Value::Array(servers)
    }

    /// Para el navegador y para el diagnóstico del administrador.
    pub fn client_config(&self, user_id: &str, now: i64) -> Value {
        json!({
            "available": self.available(),
            "iceServers": self.ice_servers(user_id, now),
            "advertised": self.advertised.map(|a| a.to_string()),
            "turn": self.config.turn.is_some(),
            "publicIpConfigured": self.config.public_ip.is_some(),
            "maxPeers": self.config.max_peers,
        })
    }
}

/// Credenciales temporales de TURN (la API REST de coturn): usuario con su
/// caducidad y contraseña firmada con el secreto compartido.
fn turn_credentials(secret: &str, user_id: &str, now: i64) -> (String, String) {
    let username = format!("{}:{user_id}", now + TURN_TTL_SECS);
    let mut mac =
        Hmac::<Sha1>::new_from_slice(secret.as_bytes()).expect("HMAC admite cualquier clave");
    mac.update(username.as_bytes());
    let credential = B64.encode(mac.finalize().into_bytes());
    (username, credential)
}

/// La IP de esta máquina en la red local: abrir un socket UDP "conectado" no
/// envía nada, pero dice por qué interfaz saldría.
fn local_ip() -> IpAddr {
    std::net::UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))
        .and_then(|s| {
            s.connect((Ipv4Addr::new(192, 0, 2, 1), 9))?;
            s.local_addr()
        })
        .map(|a| a.ip())
        .unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credenciales_turn_como_las_espera_coturn() {
        let (user, pass) = turn_credentials("secreto", "u1", 1000);
        assert_eq!(user, "4600:u1");
        // base64(HMAC-SHA1("secreto", "4600:u1"))
        let mut mac = Hmac::<Sha1>::new_from_slice(b"secreto").unwrap();
        mac.update(b"4600:u1");
        assert_eq!(pass, B64.encode(mac.finalize().into_bytes()));
        assert_ne!(turn_credentials("otro", "u1", 1000).1, pass);
    }

    #[test]
    fn nombre_de_invitado() {
        assert_eq!(Calls::valid_guest_name("  Ana  ").as_deref(), Some("Ana"));
        assert_eq!(Calls::valid_guest_name("   "), None);
        assert_eq!(Calls::valid_guest_name(&"a".repeat(61)), None);
    }

    #[test]
    fn los_invitados_van_aparte_de_su_empresa() {
        assert_ne!(guest_scope("t1"), "t1");
    }
}
