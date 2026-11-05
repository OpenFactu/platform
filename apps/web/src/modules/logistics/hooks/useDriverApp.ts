import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@openfactu/ui';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import { driverApi, shipmentsApi, type DeliveryProofInput } from '../api';
import { DEFAULT_DELIVERY_FLOW } from '../domain/deliveryFlow';
import { enqueue, flushOutbox, readOutbox, type QueuedStopAction } from '../domain/driverOutbox';
import { isOpenStop, nextOpenStop, stopCoords, todayStr, type Coords } from '../domain/driverRoute';
import type { Route, RouteDetail, RoutePackage, RouteStop } from '../domain/route';
import type { Shipment } from '../domain/shipment';

const FLUSH_EVERY_MS = 30_000;

/** Sin respuesta del servidor: no es un rechazo, es que no hay señal. */
const isNetworkError = (err: unknown) =>
  !(err instanceof ApiError) || err.status === 0 || err.status >= 502;

function sendQueued(action: QueuedStopAction) {
  switch (action.kind) {
    case 'arrive':
      return driverApi.arrive(action.routeId, action.stopId);
    case 'deliver':
      return driverApi.deliver(action.routeId, action.stopId, action.proof);
    case 'postpone':
      return driverApi.postpone(action.routeId, action.stopId, action.reason);
    case 'incident':
      return driverApi.incident(action.routeId, action.stopId, action.reason);
  }
}

const STATUS_AFTER: Record<QueuedStopAction['kind'], string> = {
  arrive: 'arrived',
  deliver: 'delivered',
  postpone: 'postponed',
  incident: 'exception',
};

/** Rutas, parada a parada, GPS y la cola de lo marcado sin cobertura. */
export function useDriverApp(tenantId: string | null | undefined) {
  const { t } = useI18n();
  const toast = useToast();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  const [dateFilter, setDateFilter] = useState(todayStr());
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [lastFix, setLastFix] = useState<{ lat: number; lng: number } | null>(null);
  const [pending, setPending] = useState(() => readOutbox().length);
  const watchId = useRef<number | null>(null);
  const [focusedStopId, setFocusedStopId] = useState<string | null>(null);
  const autoOpened = useRef(false);

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await driverApi.myRoutes();
      setRoutes(Array.isArray(rows) ? rows : []);
    } catch {
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await driverApi.myRouteDetail(id));
    } catch {
      setDetail(null);
    }
  }, []);

  useEffect(() => {
    if (tenantId) loadRoutes();
  }, [tenantId, loadRoutes]);

  useEffect(() => {
    setFocusedStopId(null);
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  // Con una sola ruta para hoy no hay nada que elegir: se entra directamente.
  useEffect(() => {
    if (loading || autoOpened.current) return;
    autoOpened.current = true;
    const today = routes.filter(
      (r) =>
        String(r.plannedDate || '').slice(0, 10) === todayStr() &&
        (r.status === 'planned' || r.status === 'active'),
    );
    if (today.length === 1) setSelectedId(today[0].id);
  }, [loading, routes]);

  const flush = useCallback(async () => {
    if (readOutbox().length === 0) return;
    const { sent, rejected, left } = await flushOutbox(sendQueued, isNetworkError);
    setPending(left);
    if (sent > 0) toast.success(t('logistics.driver.outbox.sent', { count: sent }));
    if (rejected > 0) toast.error(t('logistics.driver.outbox.rejected', { count: rejected }));
    if ((sent > 0 || rejected > 0) && selectedId) loadDetail(selectedId);
  }, [loadDetail, selectedId, t, toast]);

  useEffect(() => {
    flush();
    window.addEventListener('online', flush);
    const timer = setInterval(flush, FLUSH_EVERY_MS);
    return () => {
      window.removeEventListener('online', flush);
      clearInterval(timer);
    };
  }, [flush]);

  const shipmentsById = useMemo(
    () => new Map<string, Shipment>((detail?.shipments || []).map((s) => [s.id, s])),
    [detail],
  );

  const packagesByShipment = useMemo(() => {
    const byShipment = new Map<string, RoutePackage[]>();
    for (const pkg of detail?.packages || []) {
      byShipment.set(pkg.shipmentId, [...(byShipment.get(pkg.shipmentId) || []), pkg]);
    }
    return byShipment;
  }, [detail]);
  const packagesOf = useCallback(
    (shipmentId: string | null | undefined) =>
      (shipmentId && packagesByShipment.get(shipmentId)) || [],
    [packagesByShipment],
  );

  /** La parada que enseña la app: la que ha elegido el conductor o, si no, la que toca. */
  const currentStop = useMemo(() => {
    if (!detail) return null;
    const focused = detail.stops.find((stop) => stop.id === focusedStopId);
    return focused && isOpenStop(focused) ? focused : nextOpenStop(detail.stops);
  }, [detail, focusedStopId]);

  const mapPoints = useMemo(() => {
    if (!detail) return [] as Array<{ stop: RouteStop; coords: Coords }>;
    return detail.stops
      .map((stop) => {
        const coords = stopCoords(
          stop,
          stop.shipmentId ? shipmentsById.get(stop.shipmentId) : undefined,
        );
        return coords ? { stop, coords } : null;
      })
      .filter((point): point is { stop: RouteStop; coords: Coords } => !!point);
  }, [detail, shipmentsById]);

  // ── GPS ──
  const stopGps = useCallback(() => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setTracking(false);
  }, []);

  const startGps = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error(t('logistics.driver.noGeolocation'));
      return;
    }
    if (!detail || watchId.current != null) return;
    const open = detail.shipments.filter(
      (s) => !['delivered', 'cancelled', 'returned'].includes(s.status),
    );
    setTracking(true);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed, heading, accuracy } = position.coords;
        setLastFix({ lat: latitude, lng: longitude });
        for (const shipment of open) {
          shipmentsApi
            .reportPosition(shipment.trackerToken, {
              lat: latitude,
              lng: longitude,
              speedKmh: speed != null ? speed * 3.6 : null,
              heading,
              accuracyMeters: accuracy,
            })
            .catch(() => null);
        }
      },
      // El mensaje del navegador viene en su idioma y habla de permisos, no de qué hacer.
      (err) =>
        toast.error(
          t(
            err.code === err.PERMISSION_DENIED
              ? 'logistics.driver.gpsDenied'
              : 'logistics.driver.gpsUnavailable',
          ),
        ),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );
  }, [detail, t, toast]);

  useEffect(() => stopGps, [stopGps]);

  // Con la ruta en marcha el GPS se enciende solo, también al reabrir la app a mitad.
  useEffect(() => {
    if (detail?.route.status === 'active' && !tracking) startGps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.route.id, detail?.route.status]);

  // ── Ruta ──
  const runOnRoute = useCallback(
    async (work: () => Promise<unknown>, success: string, fallback: string) => {
      if (busy) return false;
      setBusy(true);
      try {
        await work();
        toast.success(success);
        return true;
      } catch (err) {
        const message = err instanceof ApiError ? (err.body as any)?.error : undefined;
        toast.error(message || fallback);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, toast],
  );

  const startRoute = async () => {
    if (!selectedId) return;
    const ok = await runOnRoute(
      () => driverApi.start(selectedId),
      t('logistics.driver.routeStarted'),
      t('logistics.driver.routeStartError'),
    );
    if (ok) await loadDetail(selectedId);
  };

  const finishRoute = async () => {
    if (!selectedId) return false;
    const ok = await runOnRoute(
      () => driverApi.finish(selectedId),
      t('logistics.driver.routeFinished'),
      t('logistics.driver.routeFinishError'),
    );
    if (ok) {
      stopGps();
      setSelectedId(null);
      loadRoutes();
    }
    return ok;
  };

  /**
   * Una acción sobre una parada. Sin señal no se pierde: se guarda, la pantalla la da
   * por hecha y se envía cuando vuelva la cobertura.
   */
  const stopAction = async (action: QueuedStopAction, success: string): Promise<boolean> => {
    try {
      await sendQueued(action);
      toast.success(success);
      await loadDetail(action.routeId);
      return true;
    } catch (err) {
      if (!isNetworkError(err)) {
        const message = err instanceof ApiError ? (err.body as any)?.error : undefined;
        toast.error(message || t('logistics.common.error'));
        return false;
      }
      if (!enqueue(action)) {
        toast.error(t('logistics.driver.outbox.full'));
        return false;
      }
      setPending(readOutbox().length);
      setDetail((current) =>
        current
          ? {
              ...current,
              stops: current.stops.map((stop) =>
                stop.id === action.stopId ? { ...stop, status: STATUS_AFTER[action.kind] } : stop,
              ),
            }
          : current,
      );
      toast.info(t('logistics.driver.outbox.saved'));
      return true;
    }
  };

  const route = selectedId as string;
  const arrive = (stopId: string) =>
    stopAction(
      { kind: 'arrive', routeId: route, stopId },
      t('logistics.driver.markedArrived', { count: 1 }),
    );
  const deliver = (stopId: string, proof: DeliveryProofInput) =>
    stopAction({ kind: 'deliver', routeId: route, stopId, proof }, t('logistics.driver.delivered'));
  const postpone = (stopId: string, reason: string | null) =>
    stopAction(
      { kind: 'postpone', routeId: route, stopId, reason },
      t('logistics.driver.postponed'),
    );
  const reportIncident = (stopId: string, reason: string) =>
    stopAction(
      { kind: 'incident', routeId: route, stopId, reason },
      t('logistics.driver.exceptionReported'),
    );
  const arriveAll = async (stops: RouteStop[]) => {
    for (const stop of stops) {
      await stopAction(
        { kind: 'arrive', routeId: route, stopId: stop.id },
        t('logistics.driver.markedArrived', { count: 1 }),
      );
    }
  };

  /** Cargar o descargar un bulto: se ve al momento, y si falla vuelve como estaba. */
  const setPackageLoaded = async (packageId: string, loaded: boolean) => {
    if (!selectedId) return;
    const mark = (at: string | null) =>
      setDetail((current) =>
        current
          ? {
              ...current,
              packages: current.packages?.map((pkg) =>
                pkg.id === packageId ? { ...pkg, loadedAt: at } : pkg,
              ),
            }
          : current,
      );
    mark(loaded ? new Date().toISOString() : null);
    try {
      await driverApi.loadPackage(selectedId, packageId, loaded);
    } catch (err) {
      mark(loaded ? null : new Date().toISOString());
      const message = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(message || t('logistics.common.error'));
    }
  };

  const dropAtStaging = async (stagingAreaId: string, shipmentIds: string[]) => {
    if (!selectedId) return false;
    try {
      await driverApi.drop(selectedId, stagingAreaId, shipmentIds);
      toast.success(t('logistics.driver.drop.done'));
      await loadDetail(selectedId);
      return true;
    } catch (err) {
      const message = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(message || t('logistics.common.error'));
      return false;
    }
  };

  const visibleRoutes = dateFilter
    ? routes.filter((r) => String(r.plannedDate || '').slice(0, 10) === dateFilter)
    : routes;

  return {
    routes,
    visibleRoutes,
    loading,
    selectedId,
    setSelectedId,
    detail,
    dateFilter,
    setDateFilter,
    busy,
    tracking,
    lastFix,
    startGps,
    stopGps,
    pending,
    flow: detail?.flow ?? DEFAULT_DELIVERY_FLOW,
    setPackageLoaded,
    dropAtStaging,
    shipmentsById,
    packagesOf,
    currentStop,
    focusStop: setFocusedStopId,
    mapPoints,
    startRoute,
    finishRoute,
    arrive,
    arriveAll,
    deliver,
    postpone,
    reportIncident,
  };
}
