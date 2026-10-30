import { apiClient, ApiError } from '@/shared/http';
import type { ServerEvent } from '../domain/messaging';

/**
 * Conexión con el servicio de mensajería (`apps/messaging`): ticket, websocket
 * y peticiones REST. Una sola por pestaña, compartida por toda la app.
 *
 * El ticket lo emite el ERP (`POST /api/messaging/ticket`) tras comprobar flag
 * y permiso; dura 15 minutos y se renueva antes de caducar sin cerrar el
 * socket. Si el ERP lo niega (403), la mensajería queda desactivada hasta el
 * siguiente `start()`.
 */

export type RtStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'disabled';

interface Ticket {
  value: string;
  expiresAt: number;
  canWrite: boolean;
}

const RENEW_BEFORE_MS = 2 * 60_000;
const MAX_BACKOFF_MS = 30_000;
/** Cierres propios del servicio: ticket ausente, caducado o ajeno. */
const CLOSE_UNAUTHORIZED = 4401;

class RtClient {
  private ticket: Ticket | null = null;
  private ticketRequest: Promise<Ticket> | null = null;
  private ws: WebSocket | null = null;
  private running = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private renewTimer: ReturnType<typeof setTimeout> | null = null;
  private status: RtStatus = 'idle';
  private readonly listeners = new Set<(event: ServerEvent) => void>();
  private readonly statusListeners = new Set<() => void>();

  // ── Ciclo de vida ──────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return;
    this.running = true;
    this.attempt = 0;
    void this.connect();
  }

  stop(): void {
    this.running = false;
    this.clearTimers();
    this.ticket = null;
    this.ticketRequest = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000);
    this.setStatus('idle');
  }

  get canWrite(): boolean {
    return this.ticket?.canWrite ?? false;
  }

  getStatus = (): RtStatus => this.status;

  subscribeStatus = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  };

  subscribe(listener: (event: ServerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Avisa de que se está escribiendo (el servicio limita la frecuencia). */
  typing(conversationId: string): void {
    this.send({ type: 'typing', conversationId });
  }

  // ── Ticket ─────────────────────────────────────────────────────────────────

  /** Ticket vigente; pide uno nuevo si falta o está a punto de caducar. */
  async ensureTicket(force = false): Promise<Ticket> {
    if (!force && this.ticket && this.ticket.expiresAt - Date.now() > RENEW_BEFORE_MS) {
      return this.ticket;
    }
    if (!this.ticketRequest) {
      this.ticketRequest = apiClient
        .post<{ ticket: string; expiresIn: number; canWrite: boolean }>('/api/messaging/ticket')
        .then((res) => {
          const ticket = {
            value: res.ticket,
            expiresAt: Date.now() + res.expiresIn * 1000,
            canWrite: res.canWrite,
          };
          this.ticket = ticket;
          this.scheduleRenew();
          return ticket;
        })
        .finally(() => {
          this.ticketRequest = null;
        });
    }
    return this.ticketRequest;
  }

  private scheduleRenew(): void {
    if (this.renewTimer) clearTimeout(this.renewTimer);
    if (!this.ticket || !this.running) return;
    const wait = Math.max(5_000, this.ticket.expiresAt - Date.now() - RENEW_BEFORE_MS);
    this.renewTimer = setTimeout(() => {
      this.ensureTicket(true)
        .then((t) => this.send({ type: 'ticket.refresh', ticket: t.value }))
        .catch((err) => this.handleTicketError(err));
    }, wait);
  }

  private handleTicketError(err: unknown): void {
    // 403: flag apagado o sin permiso. No tiene sentido insistir.
    if (err instanceof ApiError && err.status === 403) {
      this.running = false;
      this.clearTimers();
      this.ws?.close(1000);
      this.setStatus('disabled');
      return;
    }
    this.scheduleReconnect();
  }

  // ── REST ───────────────────────────────────────────────────────────────────

  /**
   * Petición al servicio con el ticket como Bearer (no con el token del ERP:
   * `auth: false` evita además que un 401 de aquí cierre la sesión).
   */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const call = (ticket: Ticket) => {
      const opts = { auth: false, headers: { Authorization: `Bearer ${ticket.value}` } };
      const url = `/rt/v1${path}`;
      switch (method) {
        case 'GET':
          return apiClient.get<T>(url, opts);
        case 'POST':
          return apiClient.post<T>(url, body, opts);
        case 'PUT':
          return apiClient.put<T>(url, body, opts);
        case 'PATCH':
          return apiClient.patch<T>(url, body, opts);
        default:
          return apiClient.delete<T>(url, opts);
      }
    };
    try {
      return await call(await this.ensureTicket());
    } catch (err) {
      // Ticket caducado entre medias: uno nuevo y un reintento.
      if (err instanceof ApiError && err.status === 401) {
        return call(await this.ensureTicket(true));
      }
      throw err;
    }
  }

  // ── Websocket ──────────────────────────────────────────────────────────────

  private async connect(): Promise<void> {
    if (!this.running) return;
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let ticket: Ticket;
    try {
      ticket = await this.ensureTicket();
    } catch (err) {
      this.handleTicketError(err);
      return;
    }
    if (!this.running) return;

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/rt/ws`);
    this.ws = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', ticket: ticket.value }));
    ws.onmessage = (e) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (event.type === 'ready') {
        this.attempt = 0;
        this.setStatus('open');
      }
      this.listeners.forEach((l) => l(event));
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (!this.running) return;
      if (e.code === CLOSE_UNAUTHORIZED) this.ticket = null;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer) return;
    this.setStatus('reconnecting');
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private send(event: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(event));
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.renewTimer) clearTimeout(this.renewTimer);
    this.reconnectTimer = null;
    this.renewTimer = null;
  }

  private setStatus(status: RtStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusListeners.forEach((l) => l());
  }
}

export const rtClient = new RtClient();
