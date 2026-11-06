import type { ServerEvent } from '../domain/messaging';
import type { CallTransport } from './callClient';

/**
 * La conexión de un invitado sin cuenta (`/rt/guest/ws`): entra con el token del
 * enlace y su nombre. No tiene ticket del ERP ni API: solo la llamada.
 */
export class GuestTransport implements CallTransport {
  readonly canCall = false;
  private ws: WebSocket | null = null;
  private status: 'idle' | 'open' | 'closed' = 'idle';
  private iceServers: RTCIceServer[] = [];
  private readonly listeners = new Set<(event: ServerEvent) => void>();
  private readonly statusListeners = new Set<() => void>();

  constructor(private readonly token: string) {}

  connect(name: string): void {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/rt/guest/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.setStatus('open');
      ws.send(JSON.stringify({ token: this.token, name }));
    };
    ws.onmessage = (message) => {
      const event = JSON.parse(String(message.data)) as ServerEvent;
      if (event.type === 'guest.admitted') this.iceServers = event.iceServers;
      this.listeners.forEach((listener) => listener(event));
    };
    ws.onclose = () => this.setStatus('closed');
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }

  private setStatus(status: GuestTransport['status']): void {
    this.status = status;
    this.statusListeners.forEach((listener) => listener());
  }

  getStatus = (): string => this.status;

  subscribe(listener: (event: ServerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeStatus = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  };

  sendCall(event: { type: `call.${string}` } & Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(event));
  }

  /** Un invitado no tiene API: lo único que se le pide ya vino al dejarle entrar. */
  async request<T>(_method: string, path: string): Promise<T> {
    if (path === '/rtc/config') return { iceServers: this.iceServers } as T;
    throw new Error(`No disponible para invitados: ${path}`);
  }
}
