//! El SFU: recibe el audio y el vídeo de cada navegador y lo reenvía al resto de
//! su sala, sin decodificarlo. No sabe nada de usuarios, permisos ni base de
//! datos: entra por `Command` y avisa por `Notice`.
//!
//! Una sola tarea es dueña de todos los `Rtc` (`str0m` no hace IO ni tiene
//! bloqueos) y de un único socket UDP, y reparte cada paquete con `accepts`.
//!
//! Cada navegador ofrece de entrada tres pistas: micro, cámara y pantalla. Apagar
//! o compartir luego no renegocia: cambia lo que envía por esa misma pista. Así
//! solo renegocia el servidor (cuando entra o sale alguien) y nunca hay dos
//! ofertas cruzadas.

use std::collections::{HashMap, VecDeque};
use std::net::SocketAddr;
use std::time::{Duration, Instant};

use str0m::bwe::{Bitrate, BweKind};
use str0m::change::{SdpAnswer, SdpOffer, SdpPendingOffer};
use str0m::media::{Direction, KeyframeRequestKind, MediaData, MediaKind, Mid, Rid};
use str0m::net::{Protocol, Receive};
use str0m::{Candidate, Event, IceConnectionState, Input, Output, Rtc};
use tokio::net::UdpSocket;
use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;

pub type PeerId = u64;

/// Sin conexión durante este tiempo (también al entrar), fuera de la llamada.
const DOWN_LIMIT: Duration = Duration::from_secs(30);
const KEYFRAME_EVERY: Duration = Duration::from_secs(1);
const ACTIVE_WITHIN: Duration = Duration::from_secs(3);
const LAYER_STALE: Duration = Duration::from_millis(500);
const MAX_IDLE_WAIT: Duration = Duration::from_millis(100);
const CHANNEL: usize = 256;
const INITIAL_BITRATE_KBPS: u64 = 500;
/// Por vídeo recibido: con cuánto ancho de banda vale cada capa de la cámara.
const HIGH_LAYER_BPS: f64 = 900_000.0;
const MID_LAYER_BPS: f64 = 300_000.0;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum JoinError {
    #[error("La llamada está llena")]
    RoomFull,
    #[error("La oferta del navegador no es válida")]
    BadOffer,
    #[error("El motor de vídeo no está disponible")]
    Unavailable,
}

pub enum Command {
    Join {
        room: Uuid,
        peer: PeerId,
        offer: SdpOffer,
        reply: oneshot::Sender<Result<SdpAnswer, JoinError>>,
    },
    /// Respuesta del navegador a una oferta del servidor.
    Answer {
        peer: PeerId,
        answer: SdpAnswer,
    },
    Leave {
        peer: PeerId,
    },
    /// La capa más alta que quiere recibir (`None`: la que le quepa).
    MaxLayer {
        peer: PeerId,
        layer: Option<Rid>,
    },
}

#[derive(Debug)]
pub enum Notice {
    /// Oferta para que el navegador reciba las pistas nuevas o suelte las viejas.
    Offer { peer: PeerId, offer: SdpOffer },
    /// Salió, o se perdió su conexión.
    Left { room: Uuid, peer: PeerId },
}

#[derive(Clone)]
pub struct Engine {
    commands: mpsc::Sender<Command>,
}

impl Engine {
    /// `advertised` es la dirección que se anuncia a los navegadores: la IP
    /// pública o de la red local, y el puerto del socket.
    pub fn spawn(
        socket: UdpSocket,
        advertised: SocketAddr,
        max_peers: usize,
    ) -> (Self, mpsc::Receiver<Notice>) {
        let (commands, rx) = mpsc::channel(CHANNEL);
        let (notices, notices_rx) = mpsc::channel(CHANNEL);
        let core = Core {
            socket,
            advertised,
            max_peers,
            commands: rx,
            notices,
            peers: HashMap::new(),
            queue: VecDeque::new(),
        };
        tokio::spawn(core.run());
        (Self { commands }, notices_rx)
    }

    pub async fn join(
        &self,
        room: Uuid,
        peer: PeerId,
        offer: SdpOffer,
    ) -> Result<SdpAnswer, JoinError> {
        let (reply, answer) = oneshot::channel();
        self.commands
            .send(Command::Join {
                room,
                peer,
                offer,
                reply,
            })
            .await
            .map_err(|_| JoinError::Unavailable)?;
        answer.await.map_err(|_| JoinError::Unavailable)?
    }

    pub async fn answer(&self, peer: PeerId, answer: SdpAnswer) {
        let _ = self.commands.send(Command::Answer { peer, answer }).await;
    }

    pub async fn set_max_layer(&self, peer: PeerId, layer: Option<Rid>) {
        let _ = self.commands.send(Command::MaxLayer { peer, layer }).await;
    }

    pub async fn leave(&self, peer: PeerId) {
        let _ = self.commands.send(Command::Leave { peer }).await;
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OutState {
    ToOpen,
    Negotiating(Mid),
    Open(Mid),
    NegotiatingStop,
}

/// Una pista de otro participante que este recibe.
struct TrackOut {
    origin: PeerId,
    origin_mid: Mid,
    kind: MediaKind,
    stream: String,
    state: OutState,
    /// Su origen se ha ido: hay que soltarla.
    gone: bool,
    /// La capa de la cámara que se le está enviando.
    layer: Option<Rid>,
    /// Cuándo se le envió algo: una cámara o pantalla apagada no gasta.
    last_sent: Option<Instant>,
}

#[derive(Clone)]
struct TrackIn {
    origin: PeerId,
    mid: Mid,
    kind: MediaKind,
    /// `<participante><mic|cam|screen>`: con esto sabe el navegador de quién es
    /// cada pista y qué es. Sin separador, que `str0m` los quita del SDP.
    stream: String,
}

/// Lo que un participante produce para los demás.
enum Forward {
    Open(Uuid, TrackIn),
    Media(Uuid, PeerId, Box<MediaData>),
    Keyframe {
        origin: PeerId,
        mid: Mid,
        rid: Option<Rid>,
    },
}

struct Peer {
    id: PeerId,
    room: Uuid,
    rtc: Rtc,
    pending: Option<SdpPendingOffer>,
    tracks_in: Vec<TrackIn>,
    tracks_out: Vec<TrackOut>,
    /// La capa que se le envía: la que le cabe, sin pasar de su tope.
    layer: Rid,
    /// La que le cabe según su ancho de banda.
    fits: Rid,
    /// La que ha pedido como máximo.
    max_layer: Option<Rid>,
    /// Desde cuándo no tiene conexión.
    down_since: Option<Instant>,
    last_keyframe: HashMap<(Mid, Option<Rid>), Instant>,
    left: bool,
}

impl Peer {
    fn new(id: PeerId, room: Uuid, rtc: Rtc) -> Self {
        Self {
            id,
            room,
            rtc,
            pending: None,
            tracks_in: Vec::new(),
            tracks_out: Vec::new(),
            layer: "l".into(),
            fits: "l".into(),
            max_layer: None,
            down_since: Some(Instant::now()),
            last_keyframe: HashMap::new(),
            left: false,
        }
    }

    fn receive(&mut self, track: &TrackIn) {
        self.tracks_out.push(TrackOut {
            origin: track.origin,
            origin_mid: track.mid,
            kind: track.kind,
            stream: track.stream.clone(),
            state: OutState::ToOpen,
            gone: false,
            layer: None,
            last_sent: None,
        });
    }

    fn media_added(&mut self, mid: Mid, kind: MediaKind) -> TrackIn {
        let source = match kind {
            MediaKind::Audio => "mic",
            MediaKind::Video => {
                let videos = self
                    .tracks_in
                    .iter()
                    .filter(|t| t.kind == MediaKind::Video)
                    .count();
                if videos == 0 {
                    "cam"
                } else {
                    "screen"
                }
            }
        };
        let track = TrackIn {
            origin: self.id,
            mid,
            kind,
            stream: format!("{}{source}", self.id),
        };
        self.tracks_in.push(track.clone());
        track
    }

    /// Ofrece al navegador lo que haya cambiado, si no hay otra oferta en curso.
    fn negotiate(&mut self) -> Option<SdpOffer> {
        if self.pending.is_some() {
            return None;
        }
        self.tracks_out
            .retain(|t| !(t.gone && t.state == OutState::ToOpen));

        let mut change = self.rtc.sdp_api();
        for track in &mut self.tracks_out {
            match track.state {
                OutState::ToOpen => {
                    let mid = change.add_media(
                        track.kind,
                        Direction::SendOnly,
                        Some(track.stream.clone()),
                        None,
                        None,
                    );
                    track.state = OutState::Negotiating(mid);
                }
                OutState::Open(mid) if track.gone => {
                    change.stop_media(mid);
                    track.state = OutState::NegotiatingStop;
                }
                _ => {}
            }
        }
        if !change.has_changes() {
            return None;
        }
        let (offer, pending) = change.apply()?;
        self.pending = Some(pending);
        Some(offer)
    }

    fn accept_answer(&mut self, answer: SdpAnswer) {
        let Some(pending) = self.pending.take() else {
            return;
        };
        if let Err(e) = self.rtc.sdp_api().accept_answer(pending, answer) {
            tracing::warn!(peer = self.id, error = %e, "Respuesta SDP no válida");
            self.rtc.disconnect();
            return;
        }
        for track in &mut self.tracks_out {
            if let OutState::Negotiating(mid) = track.state {
                track.state = OutState::Open(mid);
            }
        }
        self.tracks_out
            .retain(|t| t.state != OutState::NegotiatingStop);
    }

    /// Pide un fotograma completo, como mucho uno por segundo y por capa.
    fn request_keyframe(&mut self, mid: Mid, rid: Option<Rid>) {
        let now = Instant::now();
        let last = self
            .last_keyframe
            .entry((mid, rid))
            .or_insert(now - KEYFRAME_EVERY);
        if now.duration_since(*last) < KEYFRAME_EVERY {
            return;
        }
        *last = now;
        if let Some(mut writer) = self.rtc.writer(mid) {
            let _ = writer.request_keyframe(rid, KeyframeRequestKind::Pli);
        }
    }

    fn bitrate_changed(&mut self, bps: f64) {
        let videos = self
            .tracks_out
            .iter()
            .filter(|t| {
                t.kind == MediaKind::Video
                    && !t.gone
                    && t.last_sent.is_some_and(|at| at.elapsed() < ACTIVE_WITHIN)
            })
            .count()
            .max(1);
        self.fits = layer_for(bps / videos as f64);
        self.layer = capped(self.fits, self.max_layer);
        self.rtc
            .bwe()
            .set_desired_bitrate(Bitrate::bps((HIGH_LAYER_BPS * 1.2 * videos as f64) as u64));
    }

    /// Envía a este participante un paquete de otro; devuelve la petición de
    /// fotograma completo que haga falta para cambiar de capa.
    fn forward(&mut self, origin: PeerId, data: &MediaData) -> Option<Forward> {
        let wanted = self.layer;
        let track = self
            .tracks_out
            .iter_mut()
            .find(|t| t.origin == origin && t.origin_mid == data.mid && !t.gone)?;
        let OutState::Open(mid) = track.state else {
            return None;
        };

        let mut request = None;
        if let Some(rid) = data.rid {
            // Simulcast: se envía una capa, y solo se cambia en un fotograma
            // completo, para que el navegador pueda decodificarla desde ahí.
            // Una cámara pequeña no envía todas las capas, y quien envía puede dejar
            // de mandar una (poca conexión, o bajó su calidad): sin nada de la capa
            // actual, vale la primera que llegue, para no dejar el vídeo en negro.
            let stale = track.last_sent.is_none_or(|at| at.elapsed() > LAYER_STALE);
            if track.layer.is_none() || (stale && track.layer != Some(rid)) {
                if data.is_keyframe() {
                    track.layer = Some(rid);
                } else {
                    request = Some(Forward::Keyframe {
                        origin,
                        mid: data.mid,
                        rid: Some(rid),
                    });
                }
            }
            if track.layer != Some(wanted) {
                if rid == wanted && data.is_keyframe() {
                    track.layer = Some(wanted);
                } else if rid == wanted {
                    request = Some(Forward::Keyframe {
                        origin,
                        mid: data.mid,
                        rid: Some(wanted),
                    });
                }
            }
            if track.layer != Some(rid) {
                return request;
            }
        }

        track.last_sent = Some(Instant::now());
        let writer = self.rtc.writer(mid)?;
        let pt = writer.match_params(data.params)?;
        if let Err(e) = writer.write(pt, data.network_time, data.time, data.data.clone()) {
            tracing::warn!(peer = self.id, error = %e, "No se pudo reenviar");
            self.rtc.disconnect();
        }
        request
    }
}

fn layer_rank(rid: Rid) -> u8 {
    if rid == Rid::from("h") {
        2
    } else if rid == Rid::from("m") {
        1
    } else {
        0
    }
}

/// La que le cabe, sin pasar de lo que ha pedido.
fn capped(fits: Rid, max: Option<Rid>) -> Rid {
    match max {
        Some(max) if layer_rank(max) < layer_rank(fits) => max,
        _ => fits,
    }
}

/// La capa de cámara que cabe en ese ancho de banda por vídeo.
fn layer_for(bps_per_video: f64) -> Rid {
    if bps_per_video >= HIGH_LAYER_BPS {
        "h".into()
    } else if bps_per_video >= MID_LAYER_BPS {
        "m".into()
    } else {
        "l".into()
    }
}

struct Core {
    socket: UdpSocket,
    advertised: SocketAddr,
    max_peers: usize,
    commands: mpsc::Receiver<Command>,
    notices: mpsc::Sender<Notice>,
    peers: HashMap<PeerId, Peer>,
    queue: VecDeque<Forward>,
}

impl Core {
    async fn run(mut self) {
        let mut buf = vec![0u8; 2000];
        loop {
            self.remove_dead().await;

            let mut deadline = Instant::now() + MAX_IDLE_WAIT;
            let ids: Vec<PeerId> = self.peers.keys().copied().collect();
            for id in ids {
                deadline = deadline.min(self.drive(id).await);
            }
            if let Some(item) = self.queue.pop_front() {
                self.propagate(item);
                continue;
            }

            tokio::select! {
                command = self.commands.recv() => {
                    let Some(command) = command else { return };
                    self.handle(command);
                }
                received = self.socket.recv_from(&mut buf) => {
                    // Un error de UDP (en Windows, un ICMP de un puerto cerrado) no
                    // afecta a nadie más.
                    if let Ok((n, source)) = received {
                        self.receive(&buf[..n], source);
                    }
                }
                _ = tokio::time::sleep_until(deadline.into()) => {}
            }

            let now = Instant::now();
            for peer in self.peers.values_mut() {
                if peer.rtc.is_alive() {
                    if let Err(e) = peer.rtc.handle_input(Input::Timeout(now)) {
                        tracing::warn!(peer = peer.id, error = %e, "Conexión de vídeo caída");
                        peer.rtc.disconnect();
                    }
                }
            }
        }
    }

    fn receive(&mut self, packet: &[u8], source: SocketAddr) {
        let Ok(contents) = packet.try_into() else {
            return;
        };
        let input = Input::Receive(
            Instant::now(),
            Receive {
                proto: Protocol::Udp,
                source,
                destination: self.advertised,
                contents,
            },
        );
        if let Some(peer) = self.peers.values_mut().find(|p| p.rtc.accepts(&input)) {
            if let Err(e) = peer.rtc.handle_input(input) {
                tracing::warn!(peer = peer.id, error = %e, "Paquete rechazado");
                peer.rtc.disconnect();
            }
        }
    }

    fn handle(&mut self, command: Command) {
        match command {
            Command::Join {
                room,
                peer,
                offer,
                reply,
            } => {
                let _ = reply.send(self.join(room, peer, offer));
            }
            Command::Answer { peer, answer } => {
                if let Some(peer) = self.peers.get_mut(&peer) {
                    peer.accept_answer(answer);
                }
            }
            Command::MaxLayer { peer, layer } => {
                if let Some(peer) = self.peers.get_mut(&peer) {
                    peer.max_layer = layer;
                    peer.layer = capped(peer.fits, layer);
                }
            }
            Command::Leave { peer } => {
                if let Some(peer) = self.peers.get_mut(&peer) {
                    peer.left = true;
                    peer.rtc.disconnect();
                }
            }
        }
    }

    fn join(&mut self, room: Uuid, id: PeerId, offer: SdpOffer) -> Result<SdpAnswer, JoinError> {
        let in_room = self.peers.values().filter(|p| p.room == room).count();
        if in_room >= self.max_peers {
            return Err(JoinError::RoomFull);
        }
        let mut rtc = Rtc::builder()
            .enable_bwe(Some(Bitrate::kbps(INITIAL_BITRATE_KBPS)))
            .build(Instant::now());
        let candidate =
            Candidate::host(self.advertised, "udp").map_err(|_| JoinError::Unavailable)?;
        rtc.add_local_candidate(candidate)
            .ok_or(JoinError::Unavailable)?;
        let answer = rtc
            .sdp_api()
            .accept_offer(offer)
            .map_err(|_| JoinError::BadOffer)?;

        let mut peer = Peer::new(id, room, rtc);
        // Lo que ya están enviando los que estaban dentro.
        for other in self.peers.values().filter(|p| p.room == room) {
            for track in &other.tracks_in {
                peer.receive(track);
            }
        }
        self.peers.insert(id, peer);
        Ok(answer)
    }

    /// Saca a los que ya no están, y sus pistas de los demás.
    async fn remove_dead(&mut self) {
        let now = Instant::now();
        let dead: Vec<PeerId> = self
            .peers
            .values_mut()
            .filter_map(|p| {
                if p.down_since
                    .is_some_and(|since| now.duration_since(since) > DOWN_LIMIT)
                {
                    p.rtc.disconnect();
                }
                (!p.rtc.is_alive()).then_some(p.id)
            })
            .collect();
        for id in dead {
            let Some(peer) = self.peers.remove(&id) else {
                continue;
            };
            for other in self.peers.values_mut().filter(|p| p.room == peer.room) {
                for track in other.tracks_out.iter_mut().filter(|t| t.origin == id) {
                    track.gone = true;
                }
            }
            let _ = self
                .notices
                .send(Notice::Left {
                    room: peer.room,
                    peer: id,
                })
                .await;
        }
    }

    /// Saca de un participante todo lo que tenga pendiente; devuelve hasta cuándo
    /// no necesita nada.
    async fn drive(&mut self, id: PeerId) -> Instant {
        loop {
            let Some(peer) = self.peers.get_mut(&id) else {
                return Instant::now();
            };
            if !peer.rtc.is_alive() {
                return Instant::now();
            }
            if let Some(offer) = peer.negotiate() {
                let _ = self.notices.send(Notice::Offer { peer: id, offer }).await;
                continue;
            }
            let output = match peer.rtc.poll_output() {
                Ok(output) => output,
                Err(e) => {
                    tracing::warn!(peer = id, error = %e, "Conexión de vídeo caída");
                    peer.rtc.disconnect();
                    return Instant::now();
                }
            };
            match output {
                Output::Timeout(at) => return at,
                Output::Transmit(t) => {
                    let _ = self.socket.send_to(&t.contents, t.destination).await;
                }
                Output::Event(event) => self.event(id, event),
            }
        }
    }

    fn event(&mut self, id: PeerId, event: Event) {
        let Some(peer) = self.peers.get_mut(&id) else {
            return;
        };
        let room = peer.room;
        match event {
            Event::Connected => peer.down_since = None,
            Event::IceConnectionStateChange(state) => match state {
                IceConnectionState::Disconnected => {
                    peer.down_since.get_or_insert_with(Instant::now);
                }
                IceConnectionState::Connected | IceConnectionState::Completed => {
                    peer.down_since = None;
                }
                _ => {}
            },
            Event::MediaAdded(added) => {
                let track = peer.media_added(added.mid, added.kind);
                self.queue.push_back(Forward::Open(room, track));
            }
            Event::MediaData(data) => {
                if !data.contiguous {
                    peer.request_keyframe(data.mid, data.rid);
                }
                self.queue
                    .push_back(Forward::Media(room, id, Box::new(data)));
            }
            // Un navegador que recibe pide un fotograma completo: va a quien lo envía.
            Event::KeyframeRequest(request) => {
                let found = peer.tracks_out.iter().find(|t| match t.state {
                    OutState::Open(mid) => mid == request.mid,
                    _ => false,
                });
                if let Some(track) = found {
                    self.queue.push_back(Forward::Keyframe {
                        origin: track.origin,
                        mid: track.origin_mid,
                        rid: track.layer,
                    });
                }
            }
            Event::EgressBitrateEstimate(BweKind::Twcc { estimate, .. }) => {
                peer.bitrate_changed(estimate.as_f64());
            }
            _ => {}
        }
    }

    fn propagate(&mut self, item: Forward) {
        match item {
            Forward::Open(room, track) => {
                for peer in self.peers.values_mut() {
                    if peer.room == room && peer.id != track.origin {
                        peer.receive(&track);
                    }
                }
            }
            Forward::Media(room, origin, data) => {
                for peer in self.peers.values_mut() {
                    if peer.room == room && peer.id != origin && peer.rtc.is_alive() {
                        if let Some(request) = peer.forward(origin, &data) {
                            self.queue.push_back(request);
                        }
                    }
                }
            }
            Forward::Keyframe { origin, mid, rid } => {
                if let Some(peer) = self.peers.get_mut(&origin) {
                    peer.request_keyframe(mid, rid);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_capa_sale_del_ancho_de_banda_por_video() {
        assert_eq!(layer_for(2_000_000.0), Rid::from("h"));
        assert_eq!(layer_for(500_000.0), Rid::from("m"));
        assert_eq!(layer_for(100_000.0), Rid::from("l"));
    }

    #[test]
    fn el_tope_baja_la_capa_pero_no_la_sube() {
        assert_eq!(capped("h".into(), Some("m".into())), Rid::from("m"));
        assert_eq!(capped("l".into(), Some("m".into())), Rid::from("l"));
        assert_eq!(capped("h".into(), None), Rid::from("h"));
    }
}
