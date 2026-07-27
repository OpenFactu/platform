import { coreApi } from '@/shared/api';
import React, { useEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, Inbox } from 'lucide-react';
import { cn } from '@openfactu/ui';
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

const LEVEL_COLORS: Record<string, string> = {
  info: 'bg-blue-500',
  warn: 'bg-amber-500',
  error: 'bg-rose-500',
  success: 'bg-emerald-500',
};

/**
 * Icono de campana en el TopHeader. Polling cada 15s a
 * `/api/notifications/unread-count`. Al llegar nuevas:
 *   - La campana hace un shake rápido.
 *   - El punto rojo pulsa.
 *
 * Click → popover con lista de últimas 20 notificaciones. Click en una:
 *   - Marca como leída (POST /api/notifications/:id/read).
 *   - Si tiene `link`, abre ese path en una pestaña nueva.
 */
export const NotificationBell: React.FC = () => {
  const { token, user } = useAuth();
  const { openTab } = useTabs();
  const fmt = useFormat();
  const [unread, setUnread] = useState(0);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [shake, setShake] = useState(false);
  const prevUnread = useRef(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const headers = {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  const loadCount = async () => {
    try {
      const res = await coreApi.raw('GET', '/api/notifications/unread-count');
      if (!res.ok) return;
      const data = res.data;
      const n = Number(data?.count || 0);
      if (n > prevUnread.current) {
        setShake(true);
        setTimeout(() => setShake(false), 900);
      }
      prevUnread.current = n;
      setUnread(n);
    } catch {
      /* silencioso */
    }
  };

  const loadList = async () => {
    try {
      const res = await coreApi.raw('GET', '/api/notifications?limit=20');
      if (!res.ok) return;
      const data = res.data;
      setNotifs(Array.isArray(data) ? data : []);
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

  // Cerrar al click fuera
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const togglePanel = () => {
    if (!open) loadList();
    setOpen((v) => !v);
  };

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
      setUnread(0);
    } catch {
      /* noop */
    }
  };

  const openNotif = (n: Notification) => {
    markRead(n.id);
    if (n.link) {
      openTab(n.link);
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={togglePanel}
        className="relative p-2 rounded-xs text-fg-muted hover:text-accent dark:hover:text-accent hover:bg-bg-hover transition-colors"
        aria-label={`${unread} notificaciones sin leer`}
      >
        <Bell size={16} className={shake ? 'k-bell-shake' : ''} />
        {unread > 0 && (
          <span
            className={cn(
              'absolute top-1 right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold leading-[14px] text-center k-pulse-dot',
            )}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-bg-card border border-border-default rounded-sm shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
            <span className="text-[10px] font-bold uppercase tracking-widest text-fg-muted">
              Notificaciones
            </span>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="text-[10px] font-bold text-accent hover:underline flex items-center gap-1"
              >
                <CheckCheck size={11} /> Marcar todas
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-2 text-ink-400">
                <Inbox size={24} />
                <p className="text-[10px] font-mono uppercase tracking-wider">Sin notificaciones</p>
              </div>
            ) : (
              notifs.map((n, idx) => (
                <button
                  key={n.id}
                  onClick={() => openNotif(n)}
                  style={{ animationDelay: `${idx * 25}ms` }}
                  className={cn(
                    'w-full text-left k-slide-fade flex items-start gap-3 px-3 py-2.5 border-b border-border-subtle hover:bg-bg-hover transition-colors',
                    !n.readAt && 'bg-accent/5',
                  )}
                >
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full shrink-0 mt-1.5',
                      n.readAt ? 'bg-fg-subtle' : LEVEL_COLORS[n.level] || 'bg-accent',
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        'text-sm truncate',
                        n.readAt ? 'text-fg-muted' : 'font-bold text-fg-default',
                      )}
                    >
                      {n.title}
                    </div>
                    {n.body && (
                      <div className="text-[11px] text-fg-muted line-clamp-2 mt-0.5">{n.body}</div>
                    )}
                    <div className="text-[10px] font-mono text-ink-400 mt-0.5">
                      {fmt.date(new Date(n.createdAt))}
                    </div>
                  </div>
                  {!n.readAt && (
                    <span
                      className="text-ink-400 hover:text-accent transition-colors"
                      title="Marcada como leída al hacer click"
                    >
                      <Check size={12} />
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
