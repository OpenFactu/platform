import { coreApi } from '@/shared/api';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { NotificationCenter } from '@openfactu/ui';
import type { NotificationItem } from '@openfactu/ui';
import { useAuth } from '../../context/AuthContext';
import { useTabs } from '../../context/TabsContext';
import { useFormat } from '../../hooks/useFormat';
import { useRealtimeEvents } from '../../hooks/useRealtimeEvents';

interface Notification {
  id: string;
  title: string;
  body?: string | null;
  level: 'info' | 'warn' | 'error' | 'success';
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
}

/** Punto de color por nivel, con los tokens de estado del tema. */
const LEVEL_DOT: Record<string, string> = {
  info: 'bg-info',
  warn: 'bg-warning',
  error: 'bg-danger',
  success: 'bg-success',
};

/**
 * Campana del TopHeader: `NotificationCenter` de @openfactu/ui (desplegable en
 * escritorio, pantalla completa en móvil). Aquí solo queda lo propio de
 * Keirost: la carga, el contador al día y marcar como leídas.
 *
 * Polling cada 15 s a `/api/notifications/unread-count`; los eventos de negocio
 * por websocket lo refrescan al instante. Al llegar nuevas, la campana hace un
 * shake rápido. Al abrir, se cargan las últimas 20. Activar una la marca como
 * leída y, si trae `link`, abre esa ruta en una pestaña.
 */
export const NotificationBell: React.FC = () => {
  const { user } = useAuth();
  const { openTab } = useTabs();
  const fmt = useFormat();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [shake, setShake] = useState(false);
  const prevUnread = useRef(0);

  const loadCount = async () => {
    try {
      const res = await coreApi.raw('GET', '/api/notifications/unread-count');
      if (!res.ok) return;
      const n = Number(res.data?.count || 0);
      if (n > prevUnread.current) {
        setShake(true);
        setTimeout(() => setShake(false), 900);
      }
      const changed = n !== prevUnread.current;
      prevUnread.current = n;
      // El badge de la campana cuenta los no leídos de la lista cargada: se
      // mantiene al día cuando el contador del servidor cambia.
      if (changed) void loadList();
    } catch {
      /* silencioso */
    }
  };

  const loadList = async () => {
    try {
      const res = await coreApi.raw('GET', '/api/notifications?limit=20');
      if (!res.ok) return;
      setNotifs(Array.isArray(res.data) ? res.data : []);
    } catch {
      /* silencioso */
    }
  };

  useEffect(() => {
    if (!user?.tenantId) return;
    loadCount();
    const t = setInterval(loadCount, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  // Realtime: refresca el contador inmediatamente al recibir un evento de
  // negocio (documentos creados, pagos, asientos) sin esperar al polling.
  const refreshNow = () => {
    loadCount();
    if (open) loadList();
  };
  useRealtimeEvents({
    'salesInvoice.created': refreshNow,
    'purchaseInvoice.created': refreshNow,
    'salesOrder.created': refreshNow,
    'purchaseOrder.created': refreshNow,
    'salesDeliveryNote.created': refreshNow,
    'purchaseDeliveryNote.created': refreshNow,
    'payment.created': refreshNow,
    'journalEntry.posted': refreshNow,
    'notification.created': refreshNow,
  });

  const markRead = async (id: string) => {
    try {
      await coreApi.raw('POST', `/api/notifications/${id}/read`);
      setNotifs((ns) =>
        ns.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      loadCount();
    } catch {
      /* noop */
    }
  };

  const markAll = async () => {
    try {
      await coreApi.raw('POST', '/api/notifications/read-all');
      setNotifs((ns) => ns.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
      prevUnread.current = 0;
    } catch {
      /* noop */
    }
  };

  const items = useMemo<NotificationItem[]>(
    () =>
      notifs.map((n) => ({
        id: n.id,
        title: n.title,
        description: n.body ?? undefined,
        read: !!n.readAt,
        timestamp: fmt.date(new Date(n.createdAt)),
        icon: <span className={`h-2 w-2 rounded-full ${LEVEL_DOT[n.level] ?? 'bg-accent'}`} />,
      })),
    [notifs, fmt],
  );

  return (
    <NotificationCenter
      items={items}
      open={open}
      onOpenChange={(next) => {
        if (next) loadList();
        setOpen(next);
      }}
      onActivate={(item) => {
        void markRead(item.id);
        const link = notifs.find((n) => n.id === item.id)?.link;
        // La bandeja se cierra con una animación (en móvil es una modal a
        // pantalla completa con el scroll bloqueado): abrir la pestaña a la
        // vez dejaba la pantalla nueva medio cargada. Se espera a que termine.
        if (link) window.setTimeout(() => openTab(link), 250);
      }}
      onMarkAllRead={() => void markAll()}
      trigger={<Bell size={16} className={shake ? 'k-bell-shake' : ''} />}
      triggerClassName="relative p-2 rounded-xs text-fg-muted hover:text-accent hover:bg-bg-hover transition-colors"
    />
  );
};
