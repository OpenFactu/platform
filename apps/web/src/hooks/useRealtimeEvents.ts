import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

export interface RealtimeEvent {
  type: string;
  payload?: any;
  timestamp?: number;
}

type Handlers = Record<string, (payload: any, ev: RealtimeEvent) => void>;

/**
 * Abre una conexión WebSocket a `/ws/events?tenant=<id>` y despacha cada
 * evento al handler correspondiente en `handlers`. Reconnecta automáticamente
 * con backoff si se cae.
 *
 *   useRealtimeEvents({
 *     'salesInvoice.created': (p) => refetch(),
 *     'payment.created':       (p) => refetch(),
 *   });
 */
export function useRealtimeEvents(handlers: Handlers) {
  const { user, token } = useAuth();
  // Mantenemos la referencia más reciente de handlers para que reconectar
  // no pise el callback del consumidor.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const tenantId = user?.tenantId;
    if (!tenantId || !token) return;

    let ws: WebSocket | null = null;
    let retry = 0;
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${proto}://${window.location.host}/ws/events?tenant=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(token)}`;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        scheduleReconnect();
        return;
      }
      ws.onopen = () => {
        retry = 0;
      };
      ws.onmessage = (ev) => {
        try {
          const data: RealtimeEvent = JSON.parse(ev.data);
          const h = handlersRef.current[data.type];
          if (h) h(data.payload, data);
        } catch {
          /* noop */
        }
      };
      ws.onclose = (ev) => {
        // 4401: el servidor no acepta la sesión (revocada o caducada); reintentar no sirve.
        if (ev.code === 4401) return;
        scheduleReconnect();
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* noop */
        }
      };
    };

    const scheduleReconnect = () => {
      if (stopped) return;
      retry += 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(retry, 5));
      reconnectTimer = setTimeout(connect, delay);
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        /* noop */
      }
    };
  }, [user?.tenantId, token]);
}
