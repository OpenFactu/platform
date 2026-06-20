import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Marker } from 'react-map-gl/maplibre';
import { BaseMap } from '../../components/maps/BaseMap';
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

interface TrackEvent {
  kind: string;
  status: string | null;
  description: string | null;
  createdAt: string;
}

interface TrackPayload {
  status: string;
  legacyStatus: string;
  destination: { address: string | null };
  lastPosition: { lat: number; lng: number; reportedAt: string } | null;
  estimatedDelivery: string | null;
  deliveredAt: string | null;
  events: TrackEvent[];
  updatedAt: string;
}

/** Pasos lineales del viaje — usados para la progress bar superior. */
const STEPS: { key: string[]; label: string; Icon: any }[] = [
  { key: ['pending', 'draft', 'picking', 'packed'], label: 'En preparación', Icon: Package },
  { key: ['ready', 'dispatched'], label: 'Listo / Despachado', Icon: Package },
  { key: ['in_transit'], label: 'En camino', Icon: Truck },
  // `postponed` encaja aquí — está en ruta pero aplazado por un intento fallido.
  { key: ['out_for_delivery', 'postponed'], label: 'En reparto', Icon: Truck },
  { key: ['delivered'], label: 'Entregado', Icon: CheckCircle2 },
];

const STATUS_COPY: Record<
  string,
  { label: string; tone: string; accent: string; Icon: any; hero: string; sub: string }
> = {
  pending: {
    label: 'Preparándose',
    tone: 'bg-slate-100 text-slate-700',
    accent: 'bg-slate-500',
    Icon: Package,
    hero: 'Estamos preparando tu pedido',
    sub: 'Te avisaremos cuando salga del almacén.',
  },
  picking: {
    label: 'En preparación',
    tone: 'bg-amber-100 text-amber-800',
    accent: 'bg-amber-500',
    Icon: Package,
    hero: 'Estamos empaquetando tu pedido',
    sub: 'En cuanto esté listo, saldrá a reparto.',
  },
  packed: {
    label: 'Empaquetado',
    tone: 'bg-amber-100 text-amber-800',
    accent: 'bg-amber-500',
    Icon: Package,
    hero: 'Tu pedido está empaquetado',
    sub: 'Esperando a ser despachado.',
  },
  ready: {
    label: 'Listo para salir',
    tone: 'bg-blue-100 text-blue-800',
    accent: 'bg-blue-500',
    Icon: Package,
    hero: 'Tu pedido está listo para salir',
    sub: 'Saldrá en cuanto el repartidor lo recoja.',
  },
  dispatched: {
    label: 'Despachado',
    tone: 'bg-blue-100 text-blue-800',
    accent: 'bg-blue-500',
    Icon: Truck,
    hero: 'Tu pedido ha sido despachado',
    sub: 'En ruta hacia ti.',
  },
  in_transit: {
    label: 'En camino',
    tone: 'bg-indigo-100 text-indigo-800',
    accent: 'bg-indigo-500',
    Icon: Truck,
    hero: 'Tu pedido está en camino',
    sub: 'Sigue al repartidor en tiempo real.',
  },
  out_for_delivery: {
    label: 'Sale hoy hacia ti',
    tone: 'bg-violet-100 text-violet-800',
    accent: 'bg-violet-500',
    Icon: Truck,
    hero: '¡Tu pedido sale hoy hacia ti!',
    sub: 'Asegúrate de que haya alguien para recibirlo.',
  },
  postponed: {
    label: 'Entrega aplazada',
    tone: 'bg-amber-100 text-amber-800',
    accent: 'bg-amber-500',
    Icon: AlertTriangle,
    hero: 'Intento de entrega fallido',
    sub: 'No había nadie para recibir el pedido. Lo volveremos a intentar pronto.',
  },
  delivered: {
    label: 'Entregado',
    tone: 'bg-emerald-100 text-emerald-800',
    accent: 'bg-emerald-500',
    Icon: CheckCircle2,
    hero: '¡Entregado!',
    sub: 'Gracias por confiar en nosotros.',
  },
  exception: {
    label: 'Incidencia',
    tone: 'bg-rose-100 text-rose-800',
    accent: 'bg-rose-500',
    Icon: AlertTriangle,
    hero: 'Ha ocurrido una incidencia',
    sub: 'Te contactaremos cuanto antes.',
  },
  returned: {
    label: 'Devuelto',
    tone: 'bg-rose-100 text-rose-800',
    accent: 'bg-rose-500',
    Icon: AlertTriangle,
    hero: 'Tu pedido ha sido devuelto',
    sub: 'Consulta el historial para más detalles.',
  },
  cancelled: {
    label: 'Cancelado',
    tone: 'bg-slate-200 text-slate-700',
    accent: 'bg-slate-500',
    Icon: AlertTriangle,
    hero: 'Pedido cancelado',
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
  if (s < 60) return 'ahora';
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

export const TrackingPage: React.FC = () => {
  const { token } = useParams();
  const [data, setData] = useState<TrackPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const r = await fetch(`/api/logistics/track/${token}`);
      if (!r.ok) throw new Error('not found');
      const d = await r.json();
      setData(d);
      setError(null);
    } catch {
      setError('No encontramos tu envío. Revisa el enlace que te enviamos por email.');
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
  const copy = STATUS_COPY[statusKey] || STATUS_COPY.pending;

  /** Índice del paso actual dentro de STEPS (para la progress bar). */
  const stepIndex = useMemo(() => {
    const idx = STEPS.findIndex((s) => s.key.includes(statusKey));
    return idx === -1 ? 0 : idx;
  }, [statusKey]);

  const share = async () => {
    try {
      await navigator.share?.({
        title: 'Seguimiento de envío',
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
        <div className="animate-pulse text-sm text-slate-500">Cargando seguimiento…</div>
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
          <h1 className="text-xl font-black text-slate-800">Envío no encontrado</h1>
          <p className="text-sm text-slate-500">{error || 'Enlace inválido.'}</p>
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
              <div className="text-[10px] text-slate-500 leading-tight">Seguimiento</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="p-2 rounded-full hover:bg-slate-100 active:scale-95 transition"
              aria-label="Actualizar"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={share}
              className="p-2 rounded-full hover:bg-slate-100 active:scale-95 transition"
              aria-label="Compartir"
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
              {copy.label}
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-black leading-tight">{copy.hero}</h1>
            {copy.sub && <p className="mt-1.5 text-sm text-white/85">{copy.sub}</p>}

            {/* ETA o fecha de entrega */}
            {data.estimatedDelivery && !data.deliveredAt && (
              <div className="mt-5 inline-flex items-center gap-2 bg-white/20 px-3 py-2 rounded-xl text-sm backdrop-blur-sm">
                <Clock size={14} />
                Llegada estimada: <b>{new Date(data.estimatedDelivery).toLocaleString('es-ES')}</b>
              </div>
            )}
            {data.deliveredAt && (
              <div className="mt-5 inline-flex items-center gap-2 bg-white/20 px-3 py-2 rounded-xl text-sm backdrop-blur-sm">
                <CheckCircle2 size={14} />
                Entregado el {new Date(data.deliveredAt).toLocaleString('es-ES')}
              </div>
            )}
          </div>
        </section>

        {/* Progress bar — 5 pasos, mobile-friendly */}
        {statusKey !== 'exception' && statusKey !== 'returned' && statusKey !== 'cancelled' && (
          <section className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              {STEPS.map((s, i) => {
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
                      {s.label}
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
                  width: `${((stepIndex + (statusKey === 'delivered' ? 1 : 0.5)) / STEPS.length) * 100}%`,
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
                  Entregar en
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
                  Actualizado {timeAgo(data.lastPosition.reportedAt)}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Historial */}
        <section className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
          <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-4">
            Historial del envío
          </h2>
          {data.events.length === 0 ? (
            <div className="text-sm text-slate-400 italic">Sin eventos registrados todavía.</div>
          ) : (
            <ol className="relative">
              {/* Línea vertical punteada. */}
              <div className="absolute left-[9px] top-2 bottom-2 w-[1px] bg-slate-200" />
              {data.events.map((e, i) => {
                const s = STATUS_COPY[e.status || ''] || null;
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
                      {s?.label || e.kind}
                    </div>
                    {e.description && (
                      <div className="text-xs text-slate-500 mt-0.5 leading-snug">
                        {e.description}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {new Date(e.createdAt).toLocaleString('es-ES', {
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
          Actualizado automáticamente cada 30 segundos · Keirost ERP
        </footer>
      </main>
    </div>
  );
};

export default TrackingPage;
