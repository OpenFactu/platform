import type { ServerEvent } from '../domain/messaging';
import {
  activeLayers,
  parseStreamId,
  problemFromMedia,
  problemFromServer,
  type CallChatLine,
  type CallParticipant,
  type CallProblem,
  type CallQuality,
  type CallState,
  type RtcClientConfig,
  type WaitingGuest,
} from '../domain/call';
import { rtClient } from './rtClient';

/**
 * La videollamada de esta pestaña: la `RTCPeerConnection`, los medios locales y
 * la señalización sobre `rtClient`. Una sola a la vez, y vive fuera de React para
 * que siga al cambiar de pantalla.
 *
 * Se ofrecen de entrada tres pistas (micro, cámara, pantalla) y encender o apagar
 * cambia lo que envía cada una, sin renegociar: solo renegocia el servidor,
 * cuando alguien entra o sale.
 */

/** Por dónde habla: el equipo por `rtClient`, un invitado por `GuestTransport`. */
export interface CallTransport {
  readonly canCall: boolean;
  getStatus(): string;
  subscribe(listener: (event: ServerEvent) => void): () => void;
  subscribeStatus(listener: () => void): () => void;
  sendCall(event: { type: `call.${string}` } & Record<string, unknown>): void;
  request<T>(method: string, path: string, body?: unknown): Promise<T>;
}

export type CallPhase = 'idle' | 'preview' | 'connecting' | 'connected';

export interface CallSnapshot {
  phase: CallPhase;
  /** La llamada en la que se está o en la que se va a entrar. */
  call: CallState | null;
  myPeerId: number | null;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  /** Lo que se ve en la vista previa y en el recuadro propio. */
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  /** Lo que llega de los demás, por `<participante><mic|cam|screen>`. */
  remote: Record<string, MediaStream>;
  /** Llamadas en curso en mis conversaciones, por conversación. */
  active: Record<string, CallState>;
  /** Una llamada que está sonando. */
  ringing: CallState | null;
  problem: CallProblem | null;
  quality: CallQuality;
  /** El chat de la llamada, solo mientras dura. */
  chat: CallChatLine[];
  /** Quién espera a que le dejen entrar. */
  lobby: WaitingGuest[];
}

const QUALITY_KEY = 'keirost:callQuality';

function savedQuality(): CallQuality {
  try {
    const value = localStorage.getItem(QUALITY_KEY);
    return value === 'medium' || value === 'low' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

const EMPTY: CallSnapshot = {
  phase: 'idle',
  call: null,
  myPeerId: null,
  mic: true,
  cam: true,
  screen: false,
  localStream: null,
  screenStream: null,
  remote: {},
  active: {},
  ringing: null,
  problem: null,
  quality: savedQuality(),
  chat: [],
  lobby: [],
};

const RING_MS = 45_000;

/** Tres capas: el servidor envía a cada uno la que le quepa. */
const CAMERA_LAYERS: RTCRtpEncodingParameters[] = [
  { rid: 'l', scaleResolutionDownBy: 4, maxBitrate: 150_000 },
  { rid: 'm', scaleResolutionDownBy: 2, maxBitrate: 500_000 },
  { rid: 'h', maxBitrate: 1_500_000 },
];

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const rest = { ...record };
  delete rest[key];
  return rest;
}

export class CallClient {
  private state: CallSnapshot = EMPTY;
  private readonly listeners = new Set<() => void>();
  private pc: RTCPeerConnection | null = null;
  private micSender: RTCRtpSender | null = null;
  private camSender: RTCRtpSender | null = null;
  private screenSender: RTCRtpSender | null = null;
  private ringTimer: ReturnType<typeof setTimeout> | null = null;
  /** Una oferta del servidor puede adelantar a la respuesta de `call.join`. */
  private earlyOffers: RTCSessionDescriptionInit[] = [];
  private unsubscribe: (() => void) | null = null;
  private unsubscribeStatus: (() => void) | null = null;

  constructor(private readonly transport: CallTransport) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CallSnapshot => this.state;

  private set(patch: Partial<CallSnapshot>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Empieza a escuchar: lo llama quien monta la mensajería. */
  attach(): () => void {
    this.unsubscribe = this.transport.subscribe(this.onEvent);
    this.unsubscribeStatus = this.transport.subscribeStatus(this.onStatus);
    if (this.transport.canCall) void this.loadActive();
    return () => {
      this.leave();
      this.unsubscribe?.();
      this.unsubscribeStatus?.();
      this.state = EMPTY;
    };
  }

  private async loadActive(): Promise<void> {
    try {
      const calls = await this.transport.request<CallState[]>('GET', '/calls');
      this.set({ active: Object.fromEntries(calls.map((c) => [c.conversationId, c])) });
    } catch {
      // Solo ofrece volver a entrar: sin esto se puede llamar igual.
    }
  }

  // ── Entrar ────────────────────────────────────────────────────────────────

  /** Llamar en una conversación, o entrar en la llamada que ya tenga. */
  async callConversation(conversationId: string): Promise<void> {
    await this.prepare(() =>
      this.transport.request<CallState>('POST', `/conversations/${conversationId}/calls`),
    );
  }

  /** Entrar en una reunión de Keirost. */
  async joinMeeting(meetingId: string): Promise<void> {
    await this.prepare(() =>
      this.transport.request<CallState>('POST', `/meetings/${meetingId}/call`),
    );
  }

  /** Abre la vista previa con cámara y micro, a la espera de `confirm`. */
  private async prepare(getCall: () => Promise<CallState>): Promise<void> {
    if (this.state.phase !== 'idle') return;
    if (!window.isSecureContext || !navigator.mediaDevices) {
      this.set({ problem: 'insecure' });
      return;
    }
    this.clearRing();
    let call: CallState;
    try {
      call = await getCall();
    } catch (err) {
      const code = (err as { body?: { code?: string } }).body?.code;
      this.set({ problem: code ? problemFromServer(code) : 'generic' });
      return;
    }
    this.set({ phase: 'preview', call, problem: null, ringing: null });
    await this.openDevices(true, true);
  }

  /** Invitado: prueba cámara y micro antes de pedir entrar. */
  async beginGuestPreview(): Promise<void> {
    if (!window.isSecureContext || !navigator.mediaDevices) {
      this.set({ problem: 'insecure' });
      return;
    }
    this.set({ phase: 'preview' });
    await this.openDevices(true, true);
  }

  /** Invitado: ya le han dejado pasar. */
  async admitted(call: CallState): Promise<void> {
    this.set({ call });
    await this.confirm();
  }

  /** Pide cámara y micro. Si falla la cámara, se entra solo con micro. */
  async openDevices(mic: boolean, cam: boolean, micId?: string, camId?: string): Promise<void> {
    this.state.localStream?.getTracks().forEach((t) => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micId ? { deviceId: { exact: micId } } : true,
        video: cam
          ? camId
            ? { deviceId: { exact: camId } }
            : { width: 1280, height: 720 }
          : false,
      });
      stream.getAudioTracks().forEach((t) => (t.enabled = mic));
      this.set({ localStream: stream, mic, cam, problem: null });
    } catch (err) {
      if (cam) {
        await this.openDevices(mic, false, micId);
        this.set({ problem: problemFromMedia(err) });
      } else {
        this.set({ localStream: null, mic: false, cam: false, problem: problemFromMedia(err) });
      }
    }
  }

  /** Conectar, con lo elegido en la vista previa. */
  async confirm(): Promise<void> {
    const { call, localStream, mic, cam } = this.state;
    if (!call || this.state.phase !== 'preview') return;
    this.set({ phase: 'connecting', problem: null });
    try {
      const config = await this.transport.request<RtcClientConfig>('GET', '/rtc/config');
      const pc = new RTCPeerConnection({ iceServers: config.iceServers });
      this.pc = pc;
      const audio = localStream?.getAudioTracks()[0] ?? null;
      const video = localStream?.getVideoTracks()[0] ?? null;
      this.micSender = pc.addTransceiver(audio ?? 'audio', { direction: 'sendonly' }).sender;
      this.camSender = pc.addTransceiver(video ?? 'video', {
        direction: 'sendonly',
        sendEncodings: CAMERA_LAYERS,
      }).sender;
      this.screenSender = pc.addTransceiver('video', { direction: 'sendonly' }).sender;

      pc.ontrack = (e) => this.onTrack(e);
      pc.onconnectionstatechange = () => this.onConnectionState(pc);

      await pc.setLocalDescription(await pc.createOffer());
      this.transport.sendCall({ type: 'call.join', callId: call.id, sdp: pc.localDescription });
      this.sendMedia(mic && Boolean(audio), cam && Boolean(video), false);
    } catch {
      this.fail('generic');
    }
  }

  private onTrack(e: RTCTrackEvent): void {
    const stream = e.streams[0];
    if (!stream || !parseStreamId(stream.id)) return;
    this.set({ remote: { ...this.state.remote, [stream.id]: stream } });
    e.track.onended = () => {
      this.set({ remote: without(this.state.remote, stream.id) });
    };
  }

  private onConnectionState(pc: RTCPeerConnection): void {
    if (pc !== this.pc) return;
    if (pc.connectionState === 'connected') this.set({ phase: 'connected' });
    if (pc.connectionState === 'failed') this.fail('connection_failed');
  }

  // ── Durante la llamada ────────────────────────────────────────────────────

  toggleMic(): void {
    const mic = !this.state.mic;
    this.state.localStream?.getAudioTracks().forEach((t) => (t.enabled = mic));
    this.set({ mic });
    this.syncMedia();
  }

  async toggleCam(): Promise<void> {
    const cam = !this.state.cam;
    const stream = this.state.localStream;
    if (cam) {
      // La luz de la cámara se apaga de verdad: al volver, se abre otra vez.
      try {
        const fresh = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
        });
        const track = fresh.getVideoTracks()[0];
        const next = new MediaStream([...(stream?.getAudioTracks() ?? []), track]);
        await this.camSender?.replaceTrack(track);
        this.set({ localStream: next, cam: true, problem: null });
      } catch (err) {
        this.set({ problem: problemFromMedia(err) });
        return;
      }
    } else {
      stream?.getVideoTracks().forEach((t) => t.stop());
      await this.camSender?.replaceTrack(null);
      const next = new MediaStream(stream?.getAudioTracks() ?? []);
      this.set({ localStream: next, cam: false });
    }
    this.syncMedia();
  }

  async toggleScreen(): Promise<void> {
    if (this.state.screen) {
      this.stopScreen();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      track.contentHint = 'detail';
      track.onended = () => this.stopScreen();
      await this.screenSender?.replaceTrack(track);
      this.set({ screen: true, screenStream: stream });
      this.syncMedia();
    } catch (err) {
      // Cancelar el selector no es un error.
      if (err instanceof DOMException && err.name === 'NotAllowedError') return;
      this.set({ problem: problemFromMedia(err) });
    }
  }

  private stopScreen(): void {
    this.state.screenStream?.getTracks().forEach((t) => t.stop());
    void this.screenSender?.replaceTrack(null);
    this.set({ screen: false, screenStream: null });
    this.syncMedia();
  }

  private syncMedia(): void {
    this.sendMedia(this.state.mic, this.state.cam, this.state.screen);
  }

  private sendMedia(mic: boolean, cam: boolean, screen: boolean): void {
    const id = this.state.call?.id;
    if (id) this.transport.sendCall({ type: 'call.media', callId: id, mic, cam, screen });
  }

  sendChat(text: string): void {
    const id = this.state.call?.id;
    if (id && text.trim()) this.transport.sendCall({ type: 'call.chat', callId: id, text });
  }

  /** Dejar pasar a un invitado que espera, o no. */
  decideGuest(guestId: number, admit: boolean): void {
    const id = this.state.call?.id;
    if (id) this.transport.sendCall({ type: 'call.admit', callId: id, guestId, admit });
  }

  /** Cuánto vídeo se envía y se recibe: para ahorrar datos o con mala conexión. */
  setQuality(quality: CallQuality): void {
    this.set({ quality });
    try {
      localStorage.setItem(QUALITY_KEY, quality);
    } catch {
      // Solo es recordar la preferencia.
    }
    this.applyQuality();
  }

  private applyQuality(): void {
    const { call, quality } = this.state;
    if (!call) return;
    this.transport.sendCall({ type: 'call.quality', callId: call.id, quality });
    const sender = this.camSender;
    if (!sender) return;
    const layers = activeLayers(quality);
    const params = sender.getParameters();
    if (!params.encodings?.length) return;
    params.encodings.forEach((e) => {
      e.active = !e.rid || layers.has(e.rid);
    });
    void sender.setParameters(params).catch(() => undefined);
  }

  /** Nivel de audio de cada participante, para resaltar quién habla. */
  async speakers(): Promise<Set<number>> {
    const talking = new Set<number>();
    const pc = this.pc;
    if (!pc) return talking;
    const stats = await pc.getStats();
    const byMid = new Map(
      pc
        .getTransceivers()
        .map((t) => [
          t.mid,
          Object.keys(this.state.remote).find((k) =>
            this.state.remote[k].getTracks().includes(t.receiver.track),
          ),
        ]),
    );
    stats.forEach((s) => {
      if (s.type !== 'inbound-rtp' || s.kind !== 'audio' || !(s.audioLevel > 0.02)) return;
      const key = byMid.get(s.mid);
      const parsed = key ? parseStreamId(key) : null;
      if (parsed) talking.add(parsed.peerId);
    });
    return talking;
  }

  // ── Salir ─────────────────────────────────────────────────────────────────

  /** Colgar, o cancelar la vista previa. */
  leave(): void {
    const { call, phase } = this.state;
    if (call && (phase === 'connecting' || phase === 'connected')) {
      this.transport.sendCall({ type: 'call.leave', callId: call.id });
    }
    this.reset();
  }

  private fail(problem: CallProblem): void {
    this.reset();
    this.set({ problem });
  }

  private reset(): void {
    this.pc?.close();
    this.pc = null;
    this.micSender = this.camSender = this.screenSender = null;
    this.earlyOffers = [];
    this.state.localStream?.getTracks().forEach((t) => t.stop());
    this.state.screenStream?.getTracks().forEach((t) => t.stop());
    this.set({
      phase: 'idle',
      call: null,
      myPeerId: null,
      localStream: null,
      screenStream: null,
      remote: {},
      mic: true,
      cam: true,
      screen: false,
      chat: [],
      lobby: [],
    });
  }

  dismissProblem(): void {
    this.set({ problem: null });
  }

  dismissRinging(): void {
    this.clearRing();
    this.set({ ringing: null });
  }

  private clearRing(): void {
    if (this.ringTimer) clearTimeout(this.ringTimer);
    this.ringTimer = null;
  }

  // ── Señalización ──────────────────────────────────────────────────────────

  private onStatus = (): void => {
    // Sin websocket, el servidor ya nos ha sacado de la llamada.
    const inCall = this.state.phase === 'connecting' || this.state.phase === 'connected';
    if (inCall && this.transport.getStatus() !== 'open') this.fail('connection_lost');
    if (this.transport.getStatus() === 'open' && this.transport.canCall) void this.loadActive();
  };

  private onEvent = (event: ServerEvent): void => {
    switch (event.type) {
      case 'call.ringing':
        this.setActive(event.call);
        if (this.state.phase === 'idle') {
          this.clearRing();
          this.ringTimer = setTimeout(() => this.dismissRinging(), RING_MS);
          this.set({ ringing: event.call });
        }
        break;
      case 'call.updated':
        this.setActive(event.call);
        if (this.state.call?.id === event.call.id) this.set({ call: event.call });
        break;
      case 'call.ended': {
        this.set({ active: without(this.state.active, event.conversationId) });
        if (this.state.ringing?.id === event.callId) this.dismissRinging();
        if (this.state.call?.id === event.callId) this.reset();
        break;
      }
      case 'call.joined':
        if (this.state.call?.id === event.callId && this.pc) {
          this.set({ myPeerId: event.peerId, chat: event.chat });
          void this.applyAnswer(event.callId, event.sdp);
          this.syncMedia();
          this.applyQuality();
        }
        break;
      case 'call.chat':
        if (this.state.call?.id === event.callId) {
          this.set({ chat: [...this.state.chat, event.line] });
        }
        break;
      case 'call.lobby':
        if (this.state.call?.id === event.callId) this.set({ lobby: event.waiting });
        break;
      case 'call.offer':
        if (this.state.call?.id !== event.callId) break;
        if (this.state.myPeerId === null) this.earlyOffers.push(event.sdp);
        else void this.answerOffer(event.callId, event.sdp);
        break;
      case 'call.error':
        if (this.state.call?.id === event.callId) this.fail(problemFromServer(event.code));
        break;
    }
  };

  private async applyAnswer(callId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    try {
      await this.pc?.setRemoteDescription(sdp);
      const early = this.earlyOffers;
      this.earlyOffers = [];
      for (const offer of early) await this.answerOffer(callId, offer);
    } catch {
      this.fail('generic');
    }
  }

  private async answerOffer(callId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    try {
      await pc.setRemoteDescription(sdp);
      await pc.setLocalDescription(await pc.createAnswer());
      this.transport.sendCall({ type: 'call.answer', callId, sdp: pc.localDescription });
    } catch {
      this.fail('generic');
    }
  }

  private setActive(call: CallState): void {
    this.set({ active: { ...this.state.active, [call.conversationId]: call } });
  }
}

export const callClient = new CallClient(rtClient);
export type { CallParticipant };
