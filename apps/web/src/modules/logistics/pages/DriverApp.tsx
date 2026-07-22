import { packagesApi, routesApi, shipmentsApi, stagingAreasApi } from '../api';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Button, Badge, Loader, Modal, Input, useToast } from '@openfactu/ui';
import {
  MapPin,
  Play,
  Square,
  Navigation,
  CheckCircle2,
  Route as RouteIcon,
  ChevronDown,
  ChevronUp,
  Maximize2,
  QrCode,
  X as XIcon,
  AlertTriangle,
  Truck as TruckIconLucide,
  Warehouse,
} from 'lucide-react';
import { BarcodeCameraModal } from '@/components/scanner/BarcodeCameraModal';
import { DeliveryProofModal } from '../components/DeliveryProofModal';
import { Marker, Source, Layer, Popup } from 'react-map-gl/maplibre';
import { BaseMap, type BaseMapHandle } from '@/components/maps/BaseMap';
import { useAuth } from '@/context/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { ApiError } from '@/shared/http';
import type { Route, RouteDetail, RouteStop } from '../domain/route';
import type { Shipment } from '../domain/shipment';

/** Pin numerado — muestra la secuencia dentro de la ruta. */
function NumberedPin({ n, done }: { n: number; done: boolean }) {
  const bg = done ? '#10b981' : '#0D9488';
  return (
    <div
      style={{
        background: bg,
        color: '#fff',
        width: 28,
        height: 28,
        borderRadius: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 900,
        fontSize: 13,
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        border: '2px solid white',
      }}
    >
      {n}
    </div>
  );
}

const STOP_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  en_route: 'En camino',
  arrived: 'En la puerta',
  delivered: 'Entregado',
  postponed: 'Aplazado',
  exception: 'Incidencia',
  cancelled: 'Cancelado',
};

const SHIP_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  picking: 'Preparando',
  packed: 'Empaquetado',
  ready: 'Listo',
  dispatched: 'Despachado',
  in_transit: 'En tránsito',
  out_for_delivery: 'En reparto',
  postponed: 'Aplazado',
  delivered: 'Entregado',
  exception: 'Incidencia',
  returned: 'Devuelto',
  cancelled: 'Cancelado',
};

/**
 * Construye una URL `wa.me` a partir de un teléfono libre. Quita espacios,
 * paréntesis y guiones; si no empieza por `+` ni por código país, asume
 * España (34). Incluye el mensaje inicial ya URL-encoded.
 */
function buildWhatsAppUrl(phone: string, message: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  let intl = cleaned;
  if (!intl.startsWith('+')) {
    // Si empieza por 6/7/8/9 (móvil español) y tiene 9 dígitos, asumimos +34.
    if (/^[6789]\d{8}$/.test(intl)) intl = `+34${intl}`;
  }
  // wa.me espera el número sin el `+` (formato E.164 sin prefijo internacional).
  const waPhone = intl.replace(/^\+/, '');
  return `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
}

/** Devuelve [lat,lng] o null fusionando stop+ship. */
function resolveCoords(stop: RouteStop, ship: Shipment | undefined): [number, number] | null {
  if (stop.lat != null && stop.lng != null) return [stop.lat, stop.lng];
  if (ship?.destinationLat != null && ship?.destinationLng != null)
    return [ship.destinationLat, ship.destinationLng];
  return null;
}

/** Dirección textual efectiva para la parada. */
function resolveAddress(stop: RouteStop, ship: Shipment | undefined): string {
  return stop.address || ship?.destinationAddress || '';
}

/** URL de Google Maps para navegar hacia un destino. Preferimos la dirección
 *  TEXTUAL: el geocodificador de Google es mejor que el nuestro (MapTiler/
 *  Photon/Nominatim) y nuestras coords a veces apuntan a un sitio equivocado.
 *  Las coords propias solo se usan si no hay dirección escrita. */
function mapsUrl(stop: RouteStop, ship: Shipment | undefined) {
  const addr = resolveAddress(stop, ship);
  if (addr) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}&travelmode=driving`;
  }
  const coords = resolveCoords(stop, ship);
  if (!coords) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${coords[0]},${coords[1]}&travelmode=driving`;
}

/** URL de Maps con la ruta COMPLETA: el origen es la ubicación actual del
 *  navegador ("current location"), los waypoints son las paradas intermedias,
 *  y la última parada es el destino. */
function routeUrl(stops: RouteStop[], shipmentsById: Map<string, Shipment>) {
  const active = stops
    .filter((s) => s.status !== 'delivered' && s.status !== 'cancelled')
    .map((s) => {
      const ship = s.shipmentId ? shipmentsById.get(s.shipmentId) : undefined;
      // Dirección textual primero — mismo motivo que en mapsUrl.
      const a = resolveAddress(s, ship);
      if (a) return encodeURIComponent(a);
      const c = resolveCoords(s, ship);
      return c ? `${c[0]},${c[1]}` : null;
    })
    .filter((x): x is string => !!x);
  if (active.length === 0) return null;
  const destination = active[active.length - 1];
  const waypoints = active.slice(0, -1);
  const params = new URLSearchParams();
  params.set('api', '1');
  params.set('destination', destination);
  if (waypoints.length) params.set('waypoints', waypoints.join('|'));
  params.set('travelmode', 'driving');
  return `https://www.google.com/maps/dir/?${params.toString()}`.replace(/%7C/g, '|');
}

/** Fecha local yyyy-mm-dd (sin depender de toISOString, que va en UTC). */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * App del conductor — mobile-first, sin menú lateral.
 */
export const DriverApp: React.FC = () => {
  const { token, user } = useAuth();
  const fmt = useFormat();
  const toast = useToast();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [lastFix, setLastFix] = useState<{ lat: number; lng: number; at: number } | null>(null);
  const [mapOpen, setMapOpen] = useState(true);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [openPopupStopId, setOpenPopupStopId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  /** Petición de iniciar/finalizar ruta en vuelo — evita doble tap. */
  const [routeBusy, setRouteBusy] = useState(false);
  const [finishConfirm, setFinishConfirm] = useState(false);
  /** Filtro de fecha de la lista de rutas — por defecto hoy; '' = todas. */
  const [dateFilter, setDateFilter] = useState<string>(todayStr());
  const [podFor, setPodFor] = useState<{
    stopId: string;
    shipmentId: string | null;
    label: string;
  } | null>(null);
  const [postponeFor, setPostponeFor] = useState<{
    stopId: string;
    shipmentId: string | null;
    reason: string;
  } | null>(null);
  const [exceptionFor, setExceptionFor] = useState<{
    stopId: string;
    shipmentId: string | null;
    reason: string;
  } | null>(null);
  const [confirmBulkArrive, setConfirmBulkArrive] = useState<number | null>(null);
  const [packageScan, setPackageScan] = useState<null | {
    code: string;
    status: string;
    weightKg: number | null;
    trackingNumber: string | null;
    destinationAddress: string | null;
    shipmentStatus: string | null;
  }>(null);
  const [scanResult, setScanResult] = useState<null | {
    ownership: 'mine' | 'other' | 'unassigned';
    stagingName: string;
    stagingCode: string;
    myRoutes?: { id: string; code: string; name: string }[];
    otherDriver?: string;
    otherRouteCode?: string;
    packagesCount: number;
  }>(null);
  const watchId = useRef<number | null>(null);
  const mapRef = useRef<BaseMapHandle | null>(null);
  const mapRefFull = useRef<BaseMapHandle | null>(null);

  const loadRoutes = async () => {
    setLoading(true);
    try {
      const d = await routesApi.myRoutes();
      setRoutes(Array.isArray(d) ? d : []);
    } catch {
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  };
  const loadDetail = async (id: string) => {
    try {
      const d = await routesApi.myRouteDetail(id);
      setDetail(d);
    } catch {
      setDetail(null);
    }
  };
  useEffect(() => {
    if (user?.tenantId) loadRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const startGps = () => {
    if (!navigator.geolocation) {
      toast.error('Este dispositivo no soporta geolocalización');
      return;
    }
    if (!detail) return;
    setTracking(true);
    watchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, speed, heading, accuracy } = pos.coords;
        setLastFix({ lat: latitude, lng: longitude, at: Date.now() });
        const active = detail.shipments.filter(
          (s) => s.status !== 'delivered' && s.status !== 'cancelled',
        );
        await Promise.all(
          active.map((s) =>
            shipmentsApi
              .reportPosition(s.reportToken, {
                lat: latitude,
                lng: longitude,
                speedKmh: speed != null ? speed * 3.6 : null,
                heading,
                accuracyMeters: accuracy,
              })
              .catch(() => null),
          ),
        );
      },
      (err) => toast.error(`GPS: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );
  };

  const stopGps = () => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setTracking(false);
  };

  useEffect(() => {
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  // Auto-start del GPS solo cuando la ruta está ACTIVA: al pulsar "Iniciar
  // ruta" (el status pasa a active y este efecto dispara) o al reabrir la app
  // a mitad de reparto. Con la ruta aún planificada no reportamos posición.
  useEffect(() => {
    if (detail && !tracking && detail.route.status === 'active') {
      startGps();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.route?.id, detail?.route?.status]);

  const handleScan = async (raw: string) => {
    setScanOpen(false);
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      toast.error('QR no reconocido');
      return;
    }

    // QR de un paquete individual (impreso como etiqueta): { v:1, type:'package', id, code }
    if (parsed?.v === 1 && parsed.type === 'package' && parsed.id) {
      try {
        const pkg = await packagesApi.get(parsed.id);
        let ship: Shipment | null = null;
        if (pkg.shipmentId) {
          ship = await shipmentsApi.get(pkg.shipmentId).catch(() => null);
        }
        setPackageScan({
          code: pkg.code,
          status: pkg.status,
          weightKg: pkg.weightKg,
          trackingNumber: ship?.trackingNumber || null,
          destinationAddress: ship?.destinationAddress || null,
          shipmentStatus: ship?.status || null,
        });
        if (navigator.vibrate) navigator.vibrate([60, 30, 60]);
      } catch {
        toast.error('No se pudo leer el paquete');
      }
      return;
    }

    if (!parsed || parsed.v !== 1 || !parsed.s) {
      toast.error('QR no válido para un acopio');
      return;
    }
    if (parsed.t && user?.tenantId && parsed.t !== user.tenantId) {
      toast.error('Este acopio pertenece a otra empresa');
      return;
    }
    try {
      const payload = await stagingAreasApi.payload(parsed.s);
      const myRouteIds = new Set(routes.map((x) => x.id));
      const hits = (payload.routes || []).filter((pr: any) => myRouteIds.has(pr.id));
      if (hits.length > 0) {
        setScanResult({
          ownership: 'mine',
          stagingName: payload.staging?.name || '',
          stagingCode: payload.staging?.code || '',
          myRoutes: hits.map((h: any) => ({ id: h.id, code: h.code, name: h.name })),
          packagesCount: payload.packages?.length || 0,
        });
      } else if ((payload.routes || []).length > 0) {
        const other = payload.routes[0];
        setScanResult({
          ownership: 'other',
          stagingName: payload.staging?.name || '',
          stagingCode: payload.staging?.code || '',
          otherDriver: other.driverName || '—',
          otherRouteCode: other.code,
          packagesCount: payload.packages?.length || 0,
        });
      } else {
        setScanResult({
          ownership: 'unassigned',
          stagingName: payload.staging?.name || '',
          stagingCode: payload.staging?.code || '',
          packagesCount: payload.packages?.length || 0,
        });
      }
      if (navigator.vibrate) navigator.vibrate(hits.length > 0 ? [80, 40, 80] : 200);
    } catch (e: any) {
      toast.error('No se pudo cargar el acopio');
    }
  };

  const openMyRouteFromScan = (routeId: string) => {
    setSelectedId(routeId);
    setScanResult(null);
  };

  /**
   * Marca TODAS las paradas pendientes como `arrived` de golpe. Útil cuando
   * el repartidor ya está en la primera parada y no quiere ir pulsando
   * "Llegué" en cada una. Las que ya estén en otro estado (arrived/en_route
   * /delivered) las deja tal cual.
   */
  const markAllArrived = () => {
    if (!selectedId || !detail) return;
    const pending = detail.stops.filter((s) => s.status === 'pending');
    if (pending.length === 0) {
      toast.error('No hay paradas pendientes');
      return;
    }
    setConfirmBulkArrive(pending.length);
  };

  const confirmMarkAllArrived = async () => {
    if (!selectedId || !detail) return;
    const pending = detail.stops.filter((s) => s.status === 'pending' || s.status === 'en_route');
    const now = new Date().toISOString();
    await Promise.all(
      pending.map((s) => routesApi.updateStop(selectedId, s.id, { status: 'arrived', arrivedAt: now })),
    );
    setConfirmBulkArrive(null);
    loadDetail(selectedId);
    toast.success(`${pending.length} parada(s) marcadas como llegadas`);
  };

  /**
   * Inicio explícito de la ruta: el server pone la ruta en `active`, los
   * envíos pasan a "en camino" (con email al cliente) y la primera parada
   * arranca en reparto. El GPS se enciende solo vía el efecto de arriba
   * cuando el detalle recargado llega con status active.
   */
  const startRoute = async () => {
    if (!selectedId || routeBusy) return;
    setRouteBusy(true);
    try {
      await routesApi.start(selectedId);
      toast.success('Ruta iniciada — ¡buen reparto!');
      await loadDetail(selectedId);
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || 'No se pudo iniciar la ruta');
    } finally {
      setRouteBusy(false);
    }
  };

  /** Cierra la ruta aunque queden paradas: las pendientes vuelven aplazadas. */
  const finishRoute = async () => {
    if (!selectedId || routeBusy) return;
    setRouteBusy(true);
    try {
      await routesApi.finish(selectedId);
      toast.success('Ruta finalizada');
      setFinishConfirm(false);
      stopGps();
      setSelectedId(null);
      loadRoutes();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || 'No se pudo finalizar la ruta');
    } finally {
      setRouteBusy(false);
    }
  };

  const markArrived = async (stopId: string) => {
    if (!selectedId) return;
    await routesApi.updateStop(selectedId, stopId, {
      status: 'arrived',
      arrivedAt: new Date().toISOString(),
    });
    loadDetail(selectedId);
  };

  /** Abre el modal de prueba de entrega; la entrega efectiva se hace en onConfirm. */
  /**
   * Aplazar la entrega — típicamente porque no había nadie para recibirlo.
   * Marca el stop como `postponed`, propaga el estado al shipment y añade
   * una entrada `shipmentEvent` con el motivo que teclee el conductor.
   */
  const markPostponed = (stopId: string, shipmentId: string | null) => {
    setPostponeFor({ stopId, shipmentId, reason: 'No había nadie para recibirlo' });
  };

  const submitPostpone = async () => {
    if (!selectedId || !postponeFor) return;
    const { stopId, shipmentId, reason } = postponeFor;
    await routesApi.updateStop(selectedId, stopId, {
      status: 'postponed',
      arrivedAt: new Date().toISOString(),
      podNotes: reason.trim() || null,
    });
    if (shipmentId) {
      await shipmentsApi.update(shipmentId, { status: 'postponed', reason: reason.trim() || null });
    }
    setPostponeFor(null);
    loadDetail(selectedId);
    toast.success('Entrega aplazada');
  };

  /** Reporta una incidencia: el stop queda `exception`, el shipment también. */
  const reportException = (stopId: string, shipmentId: string | null) => {
    setExceptionFor({ stopId, shipmentId, reason: '' });
  };

  const submitException = async () => {
    if (!selectedId || !exceptionFor) return;
    const { stopId, shipmentId, reason } = exceptionFor;
    if (!reason.trim()) {
      toast.error('Necesitas describir la incidencia');
      return;
    }
    await routesApi.updateStop(selectedId, stopId, {
      status: 'exception',
      arrivedAt: new Date().toISOString(),
      podNotes: reason.trim(),
    });
    if (shipmentId) {
      await shipmentsApi.update(shipmentId, { status: 'exception', reason: reason.trim() });
    }
    setExceptionFor(null);
    loadDetail(selectedId);
    toast.success('Incidencia reportada');
  };

  const markDelivered = (stopId: string, shipmentId: string | null) => {
    if (!selectedId) return;
    const stop = detail?.stops.find((s) => s.id === stopId);
    const ship = stop?.shipmentId ? shipmentsById.get(stop.shipmentId) : undefined;
    const label = stop ? resolveAddress(stop, ship) || `Parada ${stop.sequence}` : 'Parada';
    setPodFor({ stopId, shipmentId, label });
  };

  const confirmDelivery = async (pod: {
    recipientName: string;
    recipientDocument: string;
    signatureImage: string | null;
    photoImage: string | null;
    podNotes: string;
  }) => {
    if (!podFor || !selectedId) return;
    try {
      await routesApi.updateStop(selectedId, podFor.stopId, {
        status: 'delivered',
        departedAt: new Date().toISOString(),
        recipientName: pod.recipientName || null,
        recipientDocument: pod.recipientDocument || null,
        signatureImage: pod.signatureImage,
        photoImage: pod.photoImage,
        podNotes: pod.podNotes || null,
      });
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      const status = err instanceof ApiError ? err.status : undefined;
      toast.error(`No se pudo marcar como entregado: ${msg || `Error ${status}`}`);
      return;
    }
    if (podFor.shipmentId) {
      await shipmentsApi.update(podFor.shipmentId, { status: 'delivered' });
    }
    await loadDetail(selectedId);
    setPodFor(null);
    toast.success('Entregado');
  };

  const shipmentsById = useMemo(
    () => new Map((detail?.shipments || []).map((s) => [s.id, s] as const)),
    [detail],
  );

  // Puntos con coordenadas resueltas (para el mapa mini).
  const mapPoints = useMemo(() => {
    if (!detail) return [] as Array<{ stop: RouteStop; coords: [number, number] }>;
    return detail.stops
      .map((s) => {
        const ship = s.shipmentId ? shipmentsById.get(s.shipmentId) : undefined;
        const coords = resolveCoords(s, ship);
        return coords ? { stop: s, coords } : null;
      })
      .filter((x): x is { stop: RouteStop; coords: [number, number] } => !!x);
  }, [detail, shipmentsById]);

  const renderScanModals = () => (
    <>
      <Modal
        isOpen={!!packageScan}
        onClose={() => setPackageScan(null)}
        title="Paquete escaneado"
        maxWidth="sm"
      >
        {packageScan && (
          <div className="pt-2 space-y-3">
            <div className="flex items-center gap-2">
              <code className="px-2 py-1 bg-slate-900 text-white rounded font-mono text-xs">
                {packageScan.code}
              </code>
              <Badge variant={packageScan.status === 'delivered' ? 'success' : 'info'}>
                {packageScan.status}
              </Badge>
              {packageScan.weightKg != null && (
                <span className="text-xs text-slate-500">{packageScan.weightKg} kg</span>
              )}
            </div>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border-2 border-amber-500 p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">
                Entregar en
              </div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
                {packageScan.destinationAddress || 'SIN DIRECCIÓN'}
              </div>
            </div>
            {packageScan.trackingNumber && (
              <div className="text-xs text-slate-500">
                Envío: <code className="font-mono">{packageScan.trackingNumber}</code>
              </div>
            )}
          </div>
        )}
      </Modal>
      <DeliveryProofModal
        open={!!podFor}
        onClose={() => setPodFor(null)}
        onConfirm={confirmDelivery}
        stopLabel={podFor?.label}
      />
      <BarcodeCameraModal open={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScan} />
      <Modal
        isOpen={!!scanResult}
        onClose={() => setScanResult(null)}
        title="Acopio escaneado"
        maxWidth="sm"
      >
        {scanResult && (
          <div className="pt-2">
            {scanResult.ownership === 'mine' && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border-2 border-emerald-500 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 size={28} className="text-emerald-500" strokeWidth={2.5} />
                  <div className="text-lg font-black text-emerald-700 dark:text-emerald-300">
                    ¡Es tuyo!
                  </div>
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-200">
                  Acopio <b>{scanResult.stagingName}</b> ({scanResult.stagingCode}) —{' '}
                  {scanResult.packagesCount} paquete(s).
                </div>
                {scanResult.myRoutes && scanResult.myRoutes.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      {scanResult.myRoutes.length > 1 ? 'Tus rutas en este acopio' : 'Tu ruta'}
                    </div>
                    {scanResult.myRoutes.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => openMyRouteFromScan(r.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-500/50 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 active:scale-[0.98] transition"
                      >
                        <code className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 text-[11px] font-mono rounded">
                          {r.code}
                        </code>
                        <span className="flex-1 text-left text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {r.name || '—'}
                        </span>
                        <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold">
                          Abrir →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {scanResult.ownership === 'other' && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 border-2 border-rose-500 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <XIcon size={28} className="text-rose-500" strokeWidth={2.5} />
                  <div className="text-lg font-black text-rose-700 dark:text-rose-300">
                    Este acopio NO es tuyo
                  </div>
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-200">
                  Está asignado a <b>{scanResult.otherDriver}</b>
                  {scanResult.otherRouteCode && (
                    <>
                      {' '}
                      (ruta <code className="font-mono">{scanResult.otherRouteCode}</code>)
                    </>
                  )}
                  .
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  No cargues este palet. Consulta con el almacén.
                </div>
              </div>
            )}
            {scanResult.ownership === 'unassigned' && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border-2 border-amber-500 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={28} className="text-amber-500" strokeWidth={2.5} />
                  <div className="text-lg font-black text-amber-700 dark:text-amber-300">
                    Sin ruta asignada
                  </div>
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-200">
                  El acopio <b>{scanResult.stagingName}</b> aún no tiene ruta planificada ni activa.
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Confirmar llegada masiva */}
      <Modal
        isOpen={confirmBulkArrive !== null}
        onClose={() => setConfirmBulkArrive(null)}
        title="Marcar todas como llegadas"
        maxWidth="sm"
      >
        <div className="pt-2 space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Se marcarán <b>{confirmBulkArrive}</b> parada(s) pendiente(s) como <b>llegadas</b> con
            la hora actual.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmBulkArrive(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmMarkAllArrived}>Marcar como llegadas</Button>
          </div>
        </div>
      </Modal>

      {/* Aplazar entrega */}
      <Modal
        isOpen={!!postponeFor}
        onClose={() => setPostponeFor(null)}
        title="Aplazar entrega"
        subtitle="El motivo se envía al destinatario por email."
        maxWidth="sm"
      >
        {postponeFor && (
          <div className="pt-2 space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Motivo
              </label>
              <Input
                value={postponeFor.reason}
                onChange={(e) => setPostponeFor({ ...postponeFor, reason: e.target.value })}
                placeholder="No había nadie para recibirlo"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPostponeFor(null)}>
                Cancelar
              </Button>
              <Button onClick={submitPostpone} className="!bg-amber-600 hover:!bg-amber-700">
                ⏸ Aplazar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reportar incidencia */}
      <Modal
        isOpen={!!exceptionFor}
        onClose={() => setExceptionFor(null)}
        title="Reportar incidencia"
        subtitle="Dirección errónea, daño, rechazo del cliente, etc."
        maxWidth="sm"
      >
        {exceptionFor && (
          <div className="pt-2 space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Descripción<span className="text-rose-500 ml-0.5">*</span>
              </label>
              <Input
                value={exceptionFor.reason}
                onChange={(e) => setExceptionFor({ ...exceptionFor, reason: e.target.value })}
                placeholder="Describe la incidencia"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setExceptionFor(null)}>
                Cancelar
              </Button>
              <Button onClick={submitException} className="!bg-rose-600 hover:!bg-rose-700">
                ⚠ Reportar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );

  const visibleRoutes = dateFilter
    ? routes.filter((r) => String(r.plannedDate || '').slice(0, 10) === dateFilter)
    : routes;

  if (!selectedId) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 p-3">
        <header className="mb-3 flex items-start gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">
              Hola, {user?.username}
            </h1>
            <p className="text-xs text-slate-500">Tus rutas asignadas</p>
          </div>
          <button
            onClick={() => setScanOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 px-4 py-2 rounded-xl bg-primary text-white shadow-md active:scale-95 transition-transform"
            title="Escanear acopio"
          >
            <QrCode size={22} />
            <span className="text-[10px] font-bold tracking-wide">ESCANEAR</span>
          </button>
        </header>
        {renderScanModals()}

        {/* Filtro de fecha — por defecto solo las rutas de hoy. */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setDateFilter(todayStr())}
            className={`h-8 px-3 rounded-lg text-[11px] font-black uppercase tracking-wider transition ${
              dateFilter === todayStr()
                ? 'bg-primary text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            Hoy
          </button>
          <button
            onClick={() => setDateFilter('')}
            className={`h-8 px-3 rounded-lg text-[11px] font-black uppercase tracking-wider transition ${
              !dateFilter
                ? 'bg-primary text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            Todas
          </button>
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="ml-auto !w-auto"
          />
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader />
          </div>
        ) : routes.length === 0 ? (
          <Card bodyClassName="py-10 text-center text-sm text-slate-500">
            No tienes rutas asignadas.
          </Card>
        ) : visibleRoutes.length === 0 ? (
          <Card bodyClassName="py-10 text-center text-sm text-slate-500">
            Sin rutas para {dateFilter === todayStr() ? 'hoy' : 'ese día'} — usa «Todas» para ver el
            resto.
          </Card>
        ) : (
          <div className="space-y-2">
            {visibleRoutes.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className="w-full text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={r.status === 'active' ? 'info' : 'neutral'}>{r.status}</Badge>
                  <code className="text-[10px] font-mono">{r.code}</code>
                </div>
                <div className="font-bold text-slate-800 dark:text-slate-100">{r.name}</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {r.plannedDate} · {r.vehiclePlate || '—'}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="py-20 flex justify-center">
        <Loader />
      </div>
    );
  }

  const fullRouteMapsUrl = routeUrl(detail.stops, shipmentsById);

  // Centro del mapa: última posición del conductor si hay GPS, si no primera parada.
  const [mapCenterLat, mapCenterLng] = lastFix
    ? [lastFix.lat, lastFix.lng]
    : mapPoints[0]?.coords || [40.4168, -3.7038];

  // Polyline de paradas en GeoJSON (maplibre = [lng, lat]).
  const stopsPolylineGeoJSON =
    mapPoints.length >= 2
      ? {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: mapPoints.map((p) => [p.coords[1], p.coords[0]] as [number, number]),
          },
          properties: {},
        }
      : null;

  // Centra el mapa indicado (el mini-mapa o el del modal ampliado) en mi GPS
  // si lo tengo; si no, en la 1ª parada.
  const centerMap = (ref: React.RefObject<BaseMapHandle | null>) => {
    if (lastFix) {
      ref.current?.flyTo({ longitude: lastFix.lng, latitude: lastFix.lat, zoom: 15 });
      return;
    }
    const first = mapPoints[0];
    if (first) {
      ref.current?.flyTo({ longitude: first.coords[1], latitude: first.coords[0], zoom: 14 });
    }
  };

  // Marcadores/popup/polyline compartidos entre el mini-mapa y el mapa
  // ampliado del modal — cada uno vive en su propia instancia de <BaseMap>.
  const renderMapMarkers = () => (
    <>
      {lastFix && (
        <Marker longitude={lastFix.lng} latitude={lastFix.lat} anchor="center">
          <div
            title="Tu ubicación"
            style={{
              background: '#0284c7',
              color: '#fff',
              width: 14,
              height: 14,
              borderRadius: 7,
              border: '3px solid white',
              boxShadow: '0 0 0 4px rgba(2,132,199,0.25)',
            }}
          />
        </Marker>
      )}
      {mapPoints.map(({ stop, coords }) => {
        const done = stop.status === 'delivered';
        return (
          <Marker
            key={stop.id}
            longitude={coords[1]}
            latitude={coords[0]}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setOpenPopupStopId(openPopupStopId === stop.id ? null : stop.id);
            }}
          >
            <NumberedPin n={stop.sequence} done={done} />
          </Marker>
        );
      })}
      {openPopupStopId &&
        (() => {
          const pt = mapPoints.find((p) => p.stop.id === openPopupStopId);
          if (!pt) return null;
          const ship = pt.stop.shipmentId ? shipmentsById.get(pt.stop.shipmentId) : undefined;
          return (
            <Popup
              longitude={pt.coords[1]}
              latitude={pt.coords[0]}
              anchor="bottom"
              onClose={() => setOpenPopupStopId(null)}
              closeOnClick={false}
            >
              <div className="text-xs">
                <div className="font-black mb-1">Parada {pt.stop.sequence}</div>
                <div className="text-slate-700">{resolveAddress(pt.stop, ship) || '—'}</div>
                <a
                  href={mapsUrl(pt.stop, ship) || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="block mt-2 text-blue-600 underline"
                >
                  Abrir en Maps →
                </a>
              </div>
            </Popup>
          );
        })()}
      {stopsPolylineGeoJSON && (
        <Source id="stops-line" type="geojson" data={stopsPolylineGeoJSON}>
          <Layer
            id="stops-line-layer"
            type="line"
            paint={{
              'line-color': '#0D9488',
              'line-width': 3,
              'line-opacity': 0.7,
              'line-dasharray': [2, 2],
            }}
          />
        </Source>
      )}
    </>
  );

  const routeStarted = detail.route.status !== 'planned';
  const openStopsCount = detail.stops.filter(
    (s) => !['delivered', 'postponed', 'exception', 'cancelled'].includes(s.status),
  ).length;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 p-3 space-y-3">
      {renderScanModals()}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            stopGps();
            setSelectedId(null);
          }}
          className="text-xs text-slate-500 underline"
        >
          ← Mis rutas
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setScanOpen(true)}
            className="p-2 rounded-lg bg-primary text-white shadow-sm active:scale-95 transition-transform"
            title="Escanear acopio"
          >
            <QrCode size={18} />
          </button>
          <div className="text-[11px] text-slate-500">
            {lastFix ? `GPS: ${lastFix.lat.toFixed(4)}, ${lastFix.lng.toFixed(4)}` : 'GPS inactivo'}
          </div>
        </div>
      </div>

      <Card bodyClassName="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="font-bold text-slate-800 dark:text-slate-100">{detail.route.name}</div>
            <div className="text-[11px] text-slate-500">
              {detail.route.plannedDate} · {detail.route.vehiclePlate || '—'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {fullRouteMapsUrl && (
              <a
                href={fullRouteMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-emerald-500 text-white text-xs font-black uppercase tracking-wider shadow-sm hover:shadow-md active:scale-[0.97] transition-all"
              >
                <RouteIcon size={14} /> Navegar ruta
              </a>
            )}
            {tracking ? (
              <Button onClick={stopGps} variant="danger" className="flex items-center gap-2">
                <Square size={14} /> Detener GPS
              </Button>
            ) : (
              <Button onClick={startGps} className="flex items-center gap-2">
                <Play size={14} /> Iniciar GPS
              </Button>
            )}
          </div>
        </div>

        {/* Inicio/fin explícito de la ruta — el inicio avisa a los clientes
            ("en camino") y enciende el GPS; hasta entonces las paradas están
            bloqueadas. */}
        {!routeStarted && (
          <>
            <Button
              onClick={startRoute}
              disabled={routeBusy}
              className="w-full flex items-center justify-center gap-2"
            >
              <Play size={16} /> Iniciar ruta
            </Button>
            <div className="text-[11px] text-slate-500 text-center">
              Inicia la ruta para empezar el reparto — avisaremos a los clientes de que su pedido va
              en camino.
            </div>
          </>
        )}
        {detail.route.status === 'active' && (
          <Button
            variant="secondary"
            onClick={() => setFinishConfirm(true)}
            disabled={routeBusy}
            className="w-full flex items-center justify-center gap-2"
          >
            <Square size={14} /> Finalizar ruta
          </Button>
        )}

        {/* Vehículo detallado */}
        {detail.vehicle && (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2">
            <div className="flex items-center gap-2">
              <TruckIconLucide size={16} className="text-slate-500" />
              <span className="font-mono font-bold text-sm text-slate-800 dark:text-slate-100">
                {detail.vehicle.plate}
              </span>
              {(detail.vehicle.brand || detail.vehicle.model) && (
                <span className="text-xs text-slate-500">
                  · {[detail.vehicle.brand, detail.vehicle.model].filter(Boolean).join(' ')}
                </span>
              )}
              {detail.vehicle.capacity != null && (
                <span className="ml-auto text-[11px] text-slate-500">
                  Capacidad: {detail.vehicle.capacity} kg
                </span>
              )}
            </div>
            {detail.vehicle.notes && (
              <div className="text-[11px] text-slate-500 mt-1">{detail.vehicle.notes}</div>
            )}
          </div>
        )}

        {/* Puntos de recogida (acopios + plataformas) */}
        {detail.pickups && detail.pickups.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Recoge en
            </div>
            <div className="space-y-1.5">
              {detail.pickups.map((p) => {
                const navUrl =
                  p.lat != null && p.lng != null
                    ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`
                    : p.address
                      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.address)}&travelmode=driving`
                      : null;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2"
                  >
                    <Warehouse size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {p.name}
                        {p.platform && (
                          <span className="ml-2 text-[11px] font-normal text-slate-500">
                            · {p.platform.name}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {p.address || p.platform?.address || 'Sin dirección'} ·{' '}
                        <b>{p.packageCount}</b> paquete(s)
                      </div>
                    </div>
                    {navUrl && (
                      <a
                        href={navUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-md bg-amber-500 text-white text-[11px] font-bold uppercase tracking-wider shadow-sm hover:opacity-90"
                      >
                        <Navigation size={12} /> Ir
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Mini-mapa con todas las paradas */}
      {mapPoints.length > 0 && (
        <Card bodyClassName="p-0 overflow-hidden">
          <button
            type="button"
            onClick={() => setMapOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500"
          >
            <span>
              Mapa · {mapPoints.length} parada{mapPoints.length === 1 ? '' : 's'}
            </span>
            {mapOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {mapOpen && (
            <div style={{ height: 320 }} className="relative">
              <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => centerMap(mapRef)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 shadow-md border border-slate-200 dark:border-slate-700 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition"
                  title={lastFix ? 'Centrar en mi GPS' : 'Centrar en la 1ª parada'}
                >
                  <Navigation size={12} /> Centrar
                </button>
                <button
                  type="button"
                  onClick={() => setMapFullscreen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 shadow-md border border-slate-200 dark:border-slate-700 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition"
                  title="Ampliar mapa"
                >
                  <Maximize2 size={12} /> Ampliar
                </button>
              </div>
              <BaseMap ref={mapRef} latitude={mapCenterLat} longitude={mapCenterLng} zoom={12}>
                {renderMapMarkers()}
              </BaseMap>
            </div>
          )}
        </Card>
      )}

      {/* Mapa ampliado a pantalla completa — misma instancia de marcadores,
          otro <BaseMap>/ref independiente para no pelear por el mismo mapRef
          con el mini-mapa de arriba. */}
      <Modal
        isOpen={mapFullscreen}
        onClose={() => setMapFullscreen(false)}
        title={`Mapa · ${mapPoints.length} parada${mapPoints.length === 1 ? '' : 's'}`}
        maxWidth="full"
      >
        <div style={{ height: '75vh' }} className="relative">
          <button
            type="button"
            onClick={() => centerMap(mapRefFull)}
            className="absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 shadow-md border border-slate-200 dark:border-slate-700 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition"
            title={lastFix ? 'Centrar en mi GPS' : 'Centrar en la 1ª parada'}
          >
            <Navigation size={12} /> Centrar
          </button>
          {mapFullscreen && (
            <BaseMap ref={mapRefFull} latitude={mapCenterLat} longitude={mapCenterLng} zoom={12}>
              {renderMapMarkers()}
            </BaseMap>
          )}
        </div>
      </Modal>

      {/* Confirmación de finalizar ruta — avisa si quedan paradas sin cerrar. */}
      <Modal isOpen={finishConfirm} onClose={() => setFinishConfirm(false)} title="Finalizar ruta">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {openStopsCount > 0
              ? `Quedan ${openStopsCount} parada(s) sin entregar. Se marcarán como aplazadas y volverán al almacén para reintentarse.`
              : 'Todas las paradas están cerradas. ¿Finalizar la ruta?'}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setFinishConfirm(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={finishRoute} disabled={routeBusy}>
              Finalizar ruta
            </Button>
          </div>
        </div>
      </Modal>

      {/* Header de la lista de repartos */}
      <div className="flex items-center justify-between mt-2 mb-1 px-1">
        <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
          Repartos · {detail.stops.length}
        </h2>
        <span className="text-[10px] text-slate-400">
          {detail.stops.filter((s) => s.status === 'delivered').length} / {detail.stops.length}{' '}
          entregados
        </span>
      </div>

      {/* Botón masivo — útil cuando el repartidor empieza la ruta y quiere
           abrir todas las paradas pendientes de golpe. Bloqueado hasta
           iniciar la ruta, como el resto de acciones. */}
      {routeStarted &&
        detail.stops.some((s) => s.status === 'pending' || s.status === 'en_route') && (
          <button
            onClick={markAllArrived}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-blue-500 text-white text-sm font-black uppercase tracking-wider shadow-sm active:scale-[0.98] transition-all mb-2"
          >
            <MapPin size={16} /> Llegué en todas las paradas pendientes
          </button>
        )}

      <div className="space-y-2">
        {detail.stops.map((s) => {
          const ship = s.shipmentId ? shipmentsById.get(s.shipmentId) : undefined;
          // Cancelado cuenta como cerrado: el envío se devolvió/canceló y la
          // parada ya no se puede operar.
          const isDone = s.status === 'delivered' || s.status === 'cancelled';
          const href = mapsUrl(s, ship);
          const addr = resolveAddress(s, ship);
          const isPickup = ship?.kind === 'pickup_return';
          return (
            <Card
              key={s.id}
              bodyClassName={`p-4 ${isDone ? 'opacity-60' : ''} ${isPickup ? 'border-l-4 border-l-purple-500' : ''}`}
            >
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
                  {s.sequence}
                </span>
                <Badge variant={isDone ? 'success' : s.status === 'en_route' ? 'info' : 'neutral'}>
                  {(isPickup && s.status === 'delivered' ? 'Recogido' : STOP_LABEL[s.status]) ||
                    s.status}
                </Badge>
                {ship && (
                  <Badge variant="info">
                    {(isPickup && ship.status === 'delivered'
                      ? 'Recogido'
                      : isPickup && ship.status === 'out_for_delivery'
                        ? 'Recogiendo'
                        : SHIP_LABEL[ship.status]) || ship.status}
                  </Badge>
                )}
                {isPickup && <Badge variant="warning">↩ Recogida de devolución</Badge>}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">
                {isPickup ? 'Recoger de' : 'Entregar en'}
              </div>
              <div className="font-semibold text-slate-800 dark:text-slate-100">{addr || '—'}</div>
              {(ship?.recipientName || ship?.recipientEmail) && (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {ship?.recipientName && (
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {ship.recipientName}
                    </span>
                  )}
                  {ship?.recipientName && ship?.recipientEmail && ' · '}
                  {ship?.recipientEmail && (
                    <a href={`mailto:${ship.recipientEmail}`} className="underline">
                      {ship.recipientEmail}
                    </a>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {href && (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-500 text-white text-[11px] font-black uppercase tracking-wider shadow-sm hover:shadow-md active:scale-[0.97] transition-all"
                  >
                    <Navigation size={12} /> Abrir en Maps
                  </a>
                )}
                {ship?.recipientPhone && (
                  <>
                    {/* Llamada directa */}
                    <a
                      href={`tel:${ship.recipientPhone.replace(/\s+/g, '')}`}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-[11px] font-black uppercase tracking-wider active:scale-[0.97] transition-all"
                    >
                      📞 Llamar
                    </a>
                    {/* WhatsApp con mensaje prerrellenado */}
                    <a
                      href={buildWhatsAppUrl(
                        ship.recipientPhone,
                        `Hola${ship.recipientName ? ` ${ship.recipientName}` : ''}, soy el repartidor. ${
                          isPickup
                            ? 'Voy de camino a recoger tu paquete — tenlo preparado, por favor.'
                            : 'Voy de camino con tu pedido.'
                        }`,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-500 text-white text-[11px] font-black uppercase tracking-wider active:scale-[0.97] transition-all"
                    >
                      💬 WhatsApp
                    </a>
                  </>
                )}
              </div>
              {!isDone && (
                <>
                  <div className="flex gap-2 mt-3">
                    {s.status !== 'arrived' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!routeStarted}
                        onClick={() => markArrived(s.id)}
                        className="flex-1 flex items-center justify-center gap-1"
                      >
                        <MapPin size={14} /> Llegué
                      </Button>
                    )}
                    <Button
                      size="sm"
                      disabled={!routeStarted}
                      onClick={() => markDelivered(s.id, s.shipmentId)}
                      className="flex-1 flex items-center justify-center gap-1"
                    >
                      <CheckCircle2 size={14} /> {isPickup ? 'Recogí' : 'Entregué'}
                    </Button>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      disabled={!routeStarted}
                      onClick={() => markPostponed(s.id, s.shipmentId)}
                      className="flex-1 inline-flex items-center justify-center gap-1 h-9 px-3 rounded-lg bg-amber-50 text-amber-800 text-[11px] font-bold uppercase tracking-wider border border-amber-200 hover:bg-amber-100 active:scale-[0.97] transition disabled:opacity-40 disabled:pointer-events-none"
                    >
                      ⏸ Aplazar
                    </button>
                    <button
                      disabled={!routeStarted}
                      onClick={() => reportException(s.id, s.shipmentId)}
                      className="flex-1 inline-flex items-center justify-center gap-1 h-9 px-3 rounded-lg bg-rose-50 text-rose-700 text-[11px] font-bold uppercase tracking-wider border border-rose-200 hover:bg-rose-100 active:scale-[0.97] transition disabled:opacity-40 disabled:pointer-events-none"
                    >
                      ⚠ Incidencia
                    </button>
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default DriverApp;
