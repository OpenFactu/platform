import { apiClient } from '@/shared/http';
import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Marker } from 'react-map-gl/maplibre';
import { BaseMap } from '@/modules/logistics/components/maps/BaseMap';
import { TrackingChatWidget } from './TrackingChatWidget';
import {
  Truck,
  CheckCircle2,
  Package,
  AlertTriangle,
  MapPin,
  Clock,
  RefreshCw,
  Share2,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { formatDateTime } from '@/i18n/format';
import { t as tNow } from '@/i18n/i18n';

interface TrackEvent {
  kind: string;
  status: string | null;
  description: string | null;
  createdAt: string;
}

interface TrackPayload {
  status: string;
  legacyStatus: string;
  /** 'delivery' (entrega) o 'pickup_return' (pasamos a recoger un paquete). */
  kind?: string;
  destination: { address: string | null };
  lastPosition: { lat: number; lng: number; reportedAt: string } | null;
  estimatedDelivery: string | null;
  deliveredAt: string | null;
  events: TrackEvent[];
  updatedAt: string;
  chatEnabled?: boolean;
}

/** Pasos lineales del viaje — usados para la progress bar superior. */
const STEPS: { key: string[]; label: string; Icon: any }[] = [
  { key: ['pending', 'draft', 'picking', 'packed'], label: 'app.tracking.copy.t0', Icon: Package },
  { key: ['ready', 'dispatched'], label: 'app.tracking.copy.t1', Icon: Package },
  { key: ['in_transit'], label: 'app.tracking.copy.t2', Icon: Truck },
  // `postponed` encaja aquí — está en ruta pero aplazado por un intento fallido.
  { key: ['out_for_delivery', 'postponed'], label: 'app.tracking.copy.t3', Icon: Truck },
  { key: ['delivered'], label: 'app.tracking.copy.t4', Icon: CheckCircle2 },
];

/** Mismos pasos con vocabulario de RECOGIDA — vamos a por el paquete. */
const PICKUP_STEPS: { key: string[]; label: string; Icon: any }[] = [
  { key: ['pending', 'draft', 'picking', 'packed'], label: 'app.tracking.copy.t5', Icon: Package },
  { key: ['ready', 'dispatched'], label: 'app.tracking.copy.t6', Icon: Package },
  { key: ['in_transit'], label: 'app.tracking.copy.t2', Icon: Truck },
  { key: ['out_for_delivery', 'postponed'], label: 'app.tracking.copy.t7', Icon: Truck },
  { key: ['delivered'], label: 'app.tracking.copy.t8', Icon: CheckCircle2 },
];

const STATUS_COPY: Record<
  string,
  { label: string; tone: string; accent: string; Icon: any; hero: string; sub: string }
> = {
  pending: {
    label: 'app.tracking.copy.t9',
    tone: 'bg-slate-100 text-slate-700',
    accent: 'bg-slate-500',
    Icon: Package,
    hero: 'app.tracking.copy.t10',
    sub: 'app.tracking.copy.t11',
  },
  picking: {
    label: 'app.tracking.copy.t0',
    tone: 'bg-amber-100 text-amber-800',
    accent: 'bg-amber-500',
    Icon: Package,
    hero: 'app.tracking.copy.t12',
    sub: 'app.tracking.copy.t13',
  },
  packed: {
    label: 'app.tracking.copy.t14',
    tone: 'bg-amber-100 text-amber-800',
    accent: 'bg-amber-500',
    Icon: Package,
    hero: 'app.tracking.copy.t15',
    sub: 'app.tracking.copy.t16',
  },
  ready: {
    label: 'app.tracking.copy.t17',
    tone: 'bg-blue-100 text-blue-800',
    accent: 'bg-blue-500',
    Icon: Package,
    hero: 'app.tracking.copy.t18',
    sub: 'app.tracking.copy.t19',
  },
  dispatched: {
    label: 'app.tracking.copy.t20',
    tone: 'bg-blue-100 text-blue-800',
    accent: 'bg-blue-500',
    Icon: Truck,
    hero: 'app.tracking.copy.t21',
    sub: 'app.tracking.copy.t22',
  },
  in_transit: {
    label: 'app.tracking.copy.t2',
    tone: 'bg-indigo-100 text-indigo-800',
    accent: 'bg-indigo-500',
    Icon: Truck,
    hero: 'app.tracking.copy.t23',
    sub: 'app.tracking.copy.t24',
  },
  out_for_delivery: {
    label: 'app.tracking.copy.t25',
    tone: 'bg-violet-100 text-violet-800',
    accent: 'bg-violet-500',
    Icon: Truck,
    hero: 'app.tracking.copy.t26',
    sub: 'app.tracking.copy.t27',
  },
  postponed: {
    label: 'app.tracking.copy.t28',
    tone: 'bg-amber-100 text-amber-800',
    accent: 'bg-amber-500',
    Icon: AlertTriangle,
    hero: 'app.tracking.copy.t29',
    sub: 'app.tracking.copy.t30',
  },
  delivered: {
    label: 'app.tracking.copy.t4',
    tone: 'bg-emerald-100 text-emerald-800',
    accent: 'bg-emerald-500',
    Icon: CheckCircle2,
    hero: 'app.tracking.copy.t31',
    sub: 'app.tracking.copy.t32',
  },
  exception: {
    label: 'app.tracking.copy.t33',
    tone: 'bg-rose-100 text-rose-800',
    accent: 'bg-rose-500',
    Icon: AlertTriangle,
    hero: 'app.tracking.copy.t34',
    sub: 'app.tracking.copy.t35',
  },
  returned: {
    label: 'app.tracking.copy.t36',
    tone: 'bg-rose-100 text-rose-800',
    accent: 'bg-rose-500',
    Icon: AlertTriangle,
    hero: 'app.tracking.copy.t37',
    sub: 'app.tracking.copy.t38',
  },
  cancelled: {
    label: 'app.tracking.copy.t39',
    tone: 'bg-slate-200 text-slate-700',
    accent: 'bg-slate-500',
    Icon: AlertTriangle,
    hero: 'app.tracking.copy.t40',
    sub: '',
  },
};

/**
 * Overrides de copy para RECOGIDAS (kind='pickup_return'): el sentido se
 * invierte — el repartidor va a la dirección del cliente a RECOGER un
 * paquete. Los estados sin override caen al copy genérico de entrega.
 */
const PICKUP_STATUS_COPY: Partial<typeof STATUS_COPY> = {
  pending: {
    label: 'app.tracking.copy.t41',
    tone: 'bg-violet-100 text-violet-800',
    accent: 'bg-violet-500',
    Icon: Package,
    hero: 'app.tracking.copy.t42',
    sub: 'app.tracking.copy.t43',
  },
  dispatched: {
    label: 'app.tracking.copy.t6',
    tone: 'bg-blue-100 text-blue-800',
    accent: 'bg-blue-500',
    Icon: Truck,
    hero: 'app.tracking.copy.t44',
    sub: 'app.tracking.copy.t45',
  },
  in_transit: {
    label: 'app.tracking.copy.t2',
    tone: 'bg-indigo-100 text-indigo-800',
    accent: 'bg-indigo-500',
    Icon: Truck,
    hero: 'app.tracking.copy.t46',
    sub: 'app.tracking.copy.t24',
  },
  out_for_delivery: {
    label: 'app.tracking.copy.t7',
    tone: 'bg-violet-100 text-violet-800',
    accent: 'bg-violet-500',
    Icon: Truck,
    hero: 'app.tracking.copy.t47',
    sub: 'app.tracking.copy.t48',
  },
  postponed: {
    label: 'app.tracking.copy.t49',
    tone: 'bg-amber-100 text-amber-800',
    accent: 'bg-amber-500',
    Icon: AlertTriangle,
    hero: 'app.tracking.copy.t50',
    sub: 'app.tracking.copy.t51',
  },
  delivered: {
    label: 'app.tracking.copy.t8',
    tone: 'bg-emerald-100 text-emerald-800',
    accent: 'bg-emerald-500',
    Icon: CheckCircle2,
    hero: 'app.tracking.copy.t52',
    sub: 'app.tracking.copy.t53',
  },
  cancelled: {
    label: 'app.tracking.copy.t54',
    tone: 'bg-slate-200 text-slate-700',
    accent: 'bg-slate-500',
    Icon: AlertTriangle,
    hero: 'app.tracking.copy.t54',
    sub: '',
  },
};

function TruckMarker({ selected = true }: { selected?: boolean }) {
  return (
    <div
      style={{
        background: selected ? '#6366f1' : '#94a3b8',
        color: '#fff',
        width: 34,
        height: 34,
        borderRadius: 17,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '3px solid #fff',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        fontSize: 18,
      }}
    >
      🚚
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return tNow('app.tracking.now');
  const m = Math.floor(s / 60);
  if (m < 60) return tNow('app.tracking.minutesAgo', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return tNow('app.tracking.hoursAgo', { n: h });
  const d = Math.floor(h / 24);
  return tNow('app.tracking.daysAgo', { n: d });
}

export const TrackingPage: React.FC = () => {
  const { token } = useParams();
  const [data, setData] = useState<TrackPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useI18n();

  const load = async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const d = await apiClient.get<any>(`/api/logistics/track/${token}`, { auth: false });
      setData(d);
      setError(null);
    } catch {
      setError(t('app.tracking.notFoundBody'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const iv = setInterval(() => load(true), 30_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const statusKey = data?.status || data?.legacyStatus || 'pending';
  const isPickup = data?.kind === 'pickup_return';
  const copy =
    (isPickup ? PICKUP_STATUS_COPY[statusKey] : undefined) ||
    STATUS_COPY[statusKey] ||
    STATUS_COPY.pending;
  const steps = isPickup ? PICKUP_STEPS : STEPS;

  /** Índice del paso actual dentro de los pasos (para la progress bar). */
  const stepIndex = useMemo(() => {
    const idx = steps.findIndex((s) => s.key.includes(statusKey));
    return idx === -1 ? 0 : idx;
  }, [statusKey, steps]);

  const share = async () => {
    try {
      await navigator.share?.({
        title: t('app.tracking.shareTitle'),
        url: window.location.href,
      });
    } catch {
      try {
        await navigator.clipboard.writeText(window.location.href);
      } catch {
        /* silencioso */
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="animate-pulse text-sm text-slate-500">{t('app.tracking.loading')}</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 to-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-3 bg-white rounded-3xl p-8 shadow-xl">
          <div className="w-16 h-16 mx-auto rounded-full bg-rose-50 flex items-center justify-center">
            <AlertTriangle className="text-rose-500" size={32} />
          </div>
          <h1 className="text-xl font-black text-slate-800">{t('app.tracking.notFound')}</h1>
          <p className="text-sm text-slate-500">{error || t('app.tracking.invalidLink')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header fijo */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-lg border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center">
              <Truck size={16} />
            </div>
            <div>
              <div className="text-[13px] font-black tracking-tight text-slate-900 leading-none">
                Keirost
              </div>
              <div className="text-[10px] text-slate-500 leading-tight">
                {t('app.tracking.tracking')}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="p-2 rounded-full hover:bg-slate-100 active:scale-95 transition"
              aria-label={t('app.common.refresh')}
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={share}
              className="p-2 rounded-full hover:bg-slate-100 active:scale-95 transition"
              aria-label={t('app.tracking.share')}
            >
              <Share2 size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-16">
        {/* Hero — estado actual grande */}
        <section
          className={
            'relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-lg ' + copy.accent
          }
        >
          {/* Blob decorativo */}
          <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-xs font-bold backdrop-blur-sm">
              <copy.Icon size={14} strokeWidth={2.5} />
              {t(copy.label)}
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-black leading-tight">{t(copy.hero)}</h1>
            {copy.sub && <p className="mt-1.5 text-sm text-white/85">{t(copy.sub)}</p>}

            {/* ETA o fecha de entrega */}
            {data.estimatedDelivery && !data.deliveredAt && (
              <div className="mt-5 inline-flex items-center gap-2 bg-white/20 px-3 py-2 rounded-xl text-sm backdrop-blur-sm">
                <Clock size={14} />
                {t('app.tracking.eta')} <b>{formatDateTime(data.estimatedDelivery)}</b>
              </div>
            )}
            {data.deliveredAt && (
              <div className="mt-5 inline-flex items-center gap-2 bg-white/20 px-3 py-2 rounded-xl text-sm backdrop-blur-sm">
                <CheckCircle2 size={14} />
                {t(isPickup ? 'app.tracking.pickedUpOn' : 'app.tracking.deliveredOn', {
                  date: formatDateTime(data.deliveredAt),
                })}
              </div>
            )}
          </div>
        </section>

        {/* Progress bar — 5 pasos, mobile-friendly */}
        {statusKey !== 'exception' && statusKey !== 'returned' && statusKey !== 'cancelled' && (
          <section className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              {steps.map((s, i) => {
                const done = i < stepIndex;
                const current = i === stepIndex;
                return (
                  <div key={i} className="flex flex-col items-center flex-1 min-w-0">
                    <div
                      className={
                        'w-9 h-9 rounded-full flex items-center justify-center text-white transition-colors ' +
                        (done
                          ? 'bg-emerald-500'
                          : current
                            ? copy.accent
                            : 'bg-slate-200 text-slate-400')
                      }
                    >
                      {done ? (
                        <CheckCircle2 size={16} strokeWidth={3} />
                      ) : (
                        <s.Icon size={15} strokeWidth={2.5} />
                      )}
                    </div>
                    <div
                      className={
                        'mt-1.5 text-[10px] leading-tight text-center font-bold tracking-tight ' +
                        (done || current ? 'text-slate-700' : 'text-slate-400')
                      }
                    >
                      {t(s.label)}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Línea horizontal de progreso detrás de los círculos — opcional visual extra */}
            <div className="relative h-1 bg-slate-100 rounded-full mt-3 -mx-1">
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: `${((stepIndex + (statusKey === 'delivered' ? 1 : 0.5)) / steps.length) * 100}%`,
                }}
              />
            </div>
          </section>
        )}

        {/* Destino */}
        {data.destination.address && (
          <section className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="flex gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                <MapPin size={18} className="text-slate-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {isPickup ? t('app.tracking.pickupAt') : t('app.tracking.deliverTo')}
                </div>
                <div className="text-sm font-semibold text-slate-800 leading-snug mt-0.5 break-words">
                  {data.destination.address}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Mapa */}
        {data.lastPosition && (
          <section className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm">
            <div className="h-64 sm:h-80 relative">
              <BaseMap
                latitude={data.lastPosition.lat}
                longitude={data.lastPosition.lng}
                zoom={14}
                showNavControl={false}
                interactive={false}
              >
                <Marker
                  latitude={data.lastPosition.lat}
                  longitude={data.lastPosition.lng}
                  anchor="center"
                >
                  <TruckMarker selected />
                </Marker>
              </BaseMap>
              {/* Overlay con hora de última actualización. */}
              <div className="absolute bottom-2 left-2 right-2 flex justify-between items-end pointer-events-none">
                <div className="pointer-events-auto inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-md text-[11px] font-semibold text-slate-700">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {t('app.tracking.updated', { ago: timeAgo(data.lastPosition.reportedAt) })}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Historial */}
        <section className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
          <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-4">
            {t('app.tracking.history')}
          </h2>
          {data.events.length === 0 ? (
            <div className="text-sm text-slate-400 italic">{t('app.tracking.noEvents')}</div>
          ) : (
            <ol className="relative">
              {/* Línea vertical punteada. */}
              <div className="absolute left-[9px] top-2 bottom-2 w-[1px] bg-slate-200" />
              {data.events.map((e, i) => {
                const s =
                  (isPickup ? PICKUP_STATUS_COPY[e.status || ''] : undefined) ||
                  STATUS_COPY[e.status || ''] ||
                  null;
                const isLatest = i === 0;
                return (
                  <li key={i} className="relative pl-8 pb-4 last:pb-0">
                    <div
                      className={
                        'absolute left-0 top-1 w-[19px] h-[19px] rounded-full border-2 border-white ' +
                        (isLatest ? s?.accent || 'bg-slate-500' : 'bg-slate-300')
                      }
                      style={{
                        boxShadow: isLatest ? '0 0 0 4px rgba(99,102,241,0.15)' : undefined,
                      }}
                    />
                    <div className="text-sm font-bold text-slate-800 leading-tight">
                      {s?.label ? t(s.label) : e.kind}
                    </div>
                    {e.description && (
                      <div className="text-xs text-slate-500 mt-0.5 leading-snug">
                        {e.description}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {formatDateTime(e.createdAt, {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <footer className="text-center text-[11px] text-slate-400 pt-3">
          {t('app.tracking.footer')}
        </footer>
      </main>

      {data.chatEnabled && token && <TrackingChatWidget token={token} />}
    </div>
  );
};

export default TrackingPage;
