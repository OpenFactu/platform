/**
 * Canal WebSocket `/ws/events` para difundir eventos de negocio en tiempo real
 * al frontend. Aísla por tenant: el cliente se conecta con `?tenant=<tenantId>`
 * y solo recibe eventos de ese tenant.
 *
 * Eventos difundidos:
 *   - `salesInvoice.created`, `purchaseInvoice.created`
 *   - `salesOrder.created`, `purchaseOrder.created`
 *   - `salesDeliveryNote.created`, `purchaseDeliveryNote.created`
 *   - `payment.created`, `payment.deleted`
 *   - `journalEntry.posted`, `journalEntry.reversed`
 *   - `period.closed`
 *   - `payroll.approved`
 *
 * Patrón inspirado en `apps/server/src/plugins/devSocket.ts`.
 */
import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'http';
import { onSessionRevoked, resolveSession } from '../auth/sessions';

export interface RealtimeEvent {
  type: string;
  payload?: any;
  timestamp?: number;
}

let wss: WebSocketServer | null = null;
const clients = new Map<string, Set<WebSocket>>();
// Sockets por sesión: revocar el `sid` los cierra (4401).
const bySid = new Map<string, Set<WebSocket>>();
let revokeHooked = false;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

function addClient(tenantId: string, ws: WebSocket) {
  if (!clients.has(tenantId)) clients.set(tenantId, new Set());
  clients.get(tenantId)!.add(ws);
}

function removeClient(ws: WebSocket) {
  for (const [sid, set] of bySid.entries()) {
    if (set.delete(ws) && set.size === 0) bySid.delete(sid);
  }
  for (const [tenantId, set] of clients.entries()) {
    if (set.delete(ws) && set.size === 0) clients.delete(tenantId);
  }
}

export function startEventSocket(server: Server) {
  if (wss) return;
  wss = new WebSocketServer({ server, path: '/ws/events' });

  if (!revokeHooked) {
    revokeHooked = true;
    onSessionRevoked((sid) => {
      const set = bySid.get(sid);
      if (!set) return;
      for (const ws of [...set]) {
        try {
          ws.close(4401, 'session revoked');
        } catch {
          /* ya cerrado */
        }
      }
      bySid.delete(sid);
    });
  }

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '', 'http://localhost');
    const tenantId = url.searchParams.get('tenant');
    const token = url.searchParams.get('token');
    if (!tenantId) {
      ws.close(1008, 'missing tenant');
      return;
    }
    // Un `error` temprano (conexión rota durante el await) no puede tumbar el proceso.
    ws.on('error', () => removeClient(ws));
    ws.on('close', () => removeClient(ws));
    // Sin sesión viva no hay canal: el tenant de la URL no se cree sin más.
    const resolved = token ? await resolveSession(token).catch(() => null) : null;
    if (!resolved || 'error' in resolved) {
      ws.close(4401, 'unauthorized');
      return;
    }
    const isSuper = resolved.payload?.role === 'SUPERUSER';
    if (!isSuper && resolved.session.tenantId !== tenantId) {
      ws.close(4401, 'unauthorized');
      return;
    }
    // Pudo revocarse mientras se resolvía, o el socket cerrarse ya.
    if (ws.readyState !== WebSocket.OPEN) return;
    const sid = resolved.session.id;
    if (!bySid.has(sid)) bySid.set(sid, new Set());
    bySid.get(sid)!.add(ws);
    addClient(tenantId, ws);
    // Si se revocó entre resolver y registrar, el aviso no nos encontró: se mira otra vez
    // ya registrado (la revocación local vacía la caché, así que esto lee la base).
    const again = await resolveSession(token!).catch(() => null);
    if (!again || 'error' in again) {
      removeClient(ws);
      ws.close(4401, 'unauthorized');
      return;
    }
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'hello', payload: { tenantId }, timestamp: Date.now() }));

    // Heartbeat desde el cliente (opcional): responder pong.
    ws.on('pong', () => {
      /* alive */
    });
  });

  // Heartbeat: ping cada 30s; cierra conexiones muertas.
  heartbeatInterval = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      try {
        (ws as any).ping();
      } catch {
        removeClient(ws);
      }
    });
  }, 30_000);

  console.log('[EventSocket] /ws/events activo');
}

/**
 * Difunde un evento a todos los clientes conectados del tenant dado.
 */
export function broadcastEvent(tenantId: string, ev: RealtimeEvent) {
  const set = clients.get(tenantId);
  if (!set || set.size === 0) return;
  const msg = JSON.stringify({ ...ev, timestamp: ev.timestamp || Date.now() });
  set.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

export function stopEventSocket() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (wss) wss.close();
  wss = null;
  clients.clear();
  bySid.clear();
}
