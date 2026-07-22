import { shipmentsApi } from '../api';
import { warehousesApi } from '@/modules/inventory/api';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Button, Badge, Loader, Modal, Input, useToast } from '@openfactu/ui';
import type { BadgeProps } from '@openfactu/ui';
import {
  ArrowLeft,
  Copy,
  RefreshCw,
  PackageCheck,
  Warehouse,
  TruckIcon,
  MoreVertical,
} from 'lucide-react';
import { Marker, Source, Layer, type MapLayerMouseEvent } from 'react-map-gl/maplibre';
import { BaseMap, type BaseMapHandle } from '@/components/maps/BaseMap';
import { MapSearchBox } from '@/components/maps/MapSearchBox';
import { useAuth } from '@/context/AuthContext';
import { useTabs } from '@/context/TabsContext';
import { useFormat } from '@/hooks/useFormat';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import { ApiError } from '@/shared/http';
import type { Shipment, ShipmentEvent, ShipmentPosition } from '../domain/shipment';
import type { Warehouse as WarehouseType } from '@/modules/inventory/domain/warehouse';

export const ShipmentDetail: React.FC = () => {
  const { id } = useParams();
  const { token, user } = useAuth();
  const { openTab } = useTabs();
  const fmt = useFormat();
  const toast = useToast();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [positions, setPositions] = useState<ShipmentPosition[]>([]);
  const [events, setEvents] = useState<ShipmentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [cancelModal, setCancelModal] = useState<{ reason: string; cancelDn: boolean } | null>(
    null,
  );
  const [returnModal, setReturnModal] = useState<{ reason: string; cancelDn: boolean } | null>(
    null,
  );
  /** Programar recogida del paquete en casa del cliente (pickup_return). */
  const [pickupModal, setPickupModal] = useState<{ reason: string; warehouseId: string } | null>(
    null,
  );
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [s, p, e] = await Promise.all([
        shipmentsApi.get(id),
        shipmentsApi.listPositions(id),
        shipmentsApi.listEvents(id),
      ]);
      // Un endpoint puede devolver `{error:...}` con 200 — si no hay `id`, no es válido.
      setShipment(s && typeof s === 'object' && (s as Shipment).id ? s : null);
      setPositions(Array.isArray(p) ? p : []);
      setEvents(Array.isArray(e) ? e : []);
    } catch {
      setShipment(null);
      setPositions([]);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Realtime: cuando llega una posición nueva del websocket, pushearla.
  useRealtimeEvents({
    'shipment.position': (payload: any) => {
      if (payload?.shipmentId !== id) return;
      setPositions((prev) => [
        {
          id: crypto.randomUUID(),
          shipmentId: id,
          lat: payload.lat,
          lng: payload.lng,
          reportedAt: new Date(payload.at).toISOString(),
        },
        ...prev,
      ]);
      setShipment((prev) =>
        prev
          ? {
              ...prev,
              lastLat: payload.lat,
              lastLng: payload.lng,
              lastLocationAt: new Date(payload.at).toISOString(),
            }
          : prev,
      );
    },
    'shipment.updated': (payload: any) => {
      if (payload?.id === id) load();
    },
  });

  /** Recorrido histórico — GeoJSON LineString ordenado cronológicamente. */
  const polylineGeoJSON = useMemo(() => {
    const sorted = [...positions].sort(
      (a, b) => new Date(a.reportedAt).getTime() - new Date(b.reportedAt).getTime(),
    );
    if (sorted.length < 2) return null;
    return {
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: sorted.map((p) => [p.lng, p.lat] as [number, number]),
      },
      properties: {},
    };
  }, [positions]);

  const mapRef = useRef<BaseMapHandle | null>(null);

  // flyTo cuando cambia la última posición (antes era FollowMarker).
  useEffect(() => {
    if (shipment?.lastLat != null && shipment?.lastLng != null) {
      mapRef.current?.flyTo({
        longitude: shipment.lastLng,
        latitude: shipment.lastLat,
        zoom: Math.max(13, mapRef.current.getMap()?.getMap().getZoom() ?? 13),
      });
    }
  }, [shipment?.lastLat, shipment?.lastLng]);

  const copyToken = () => {
    navigator.clipboard.writeText(shipment?.reportToken || '');
    toast.success('Token copiado — pégalo en la app del conductor');
  };

  /** Ejecuta la cancelación con los datos del modal. */
  const submitCancel = async () => {
    if (!id || !cancelModal) return;
    const { reason, cancelDn } = cancelModal;
    try {
      await shipmentsApi.cancel(id, {
        reason: reason.trim() || null,
        cancelDeliveryNote: cancelDn,
      });
      setCancelModal(null);
      toast.success('Envío cancelado');
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || 'No se pudo cancelar');
    }
  };

  /** Abre el modal de recogida cargando los almacenes para el selector. */
  const openPickupModal = async () => {
    setPickupModal({ reason: '', warehouseId: '' });
    try {
      const d = await warehousesApi.list();
      setWarehouses(Array.isArray(d) ? d : []);
    } catch {
      setWarehouses([]);
    }
  };

  /** Crea el envío pickup_return desde este envío. */
  const submitPickup = async () => {
    if (!id || !pickupModal) return;
    try {
      const d = await shipmentsApi.schedulePickup(id, {
        reason: pickupModal.reason.trim() || null,
        warehouseId: pickupModal.warehouseId || null,
      });
      toast.success(
        `Recogida ${d.code || ''} programada — añádela a una ruta desde el planificador`,
      );
      setPickupModal(null);
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || 'No se pudo programar la recogida');
    }
  };

  /** Ejecuta la devolución con los datos del modal. */
  const submitReturn = async () => {
    if (!id || !returnModal) return;
    const { reason, cancelDn } = returnModal;
    try {
      const d = await shipmentsApi.return(id, {
        reason: reason.trim() || null,
        cancelDeliveryNote: cancelDn,
      });
      setReturnModal(null);
      toast.success(
        d.deliveryNoteCancelled
          ? 'Devolución registrada. Albarán anulado y entrada de stock creada.'
          : d.receiptId
            ? 'Devolución registrada. GoodsReceipt en borrador. Albarán sigue abierto para reintentar.'
            : 'Devolución registrada. Crea la entrada de stock a mano.',
      );
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || 'No se pudo marcar como devuelto');
    }
  };

  /** Fuerza el envío del email de notificación al destinatario (debug/manual). */
  const sendTestNotification = async () => {
    if (!id) return;
    const stage = shipment?.status || 'in_transit';
    try {
      await shipmentsApi.notify(id, { stage });
      toast.success(`Email enfilado (${stage}). Mira los logs del server.`);
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      const status = err instanceof ApiError ? err.status : undefined;
      toast.error(`Error: ${msg || status}`);
    }
  };

  /** Actualiza las coordenadas de destino del envío tras arrastrar el pin. */
  const saveDestination = async (lat: number, lng: number) => {
    if (!id) return;
    try {
      await shipmentsApi.update(id, { destinationLat: lat, destinationLng: lng });
      setShipment((prev) => (prev ? { ...prev, destinationLat: lat, destinationLng: lng } : prev));
      toast.success('Destino actualizado');
    } catch {
      toast.error('No se pudo guardar el destino');
    }
  };

  const trackUrl = shipment
    ? `${window.location.origin}/api/logistics/track/${shipment.reportToken}/position`
    : '';

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader />
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="p-4">
        <p className="text-slate-500">Envío no encontrado.</p>
      </div>
    );
  }

  const isInbound = shipment.sourceDocType === 'PDN';
  /** Recogida en casa del cliente — todo el vocabulario cambia. */
  const isPickup = shipment.kind === 'pickup_return';

  // [lng, lat] — maplibre usa este orden (GeoJSON).
  const centerLng = shipment.lastLng ?? shipment.destinationLng ?? -3.7038;
  const centerLat = shipment.lastLat ?? shipment.destinationLat ?? 40.4168;

  const prepBadge = ((): { label: string; variant: BadgeProps['variant'] } => {
    // Una recogida invierte el sentido: "entregado" significa que RECOGIMOS
    // el paquete, "en camino" que vamos hacia el cliente a por él.
    const pickupLabels: Record<string, string> = {
      pending: 'Recogida pendiente',
      dispatched: 'Asignada a ruta',
      in_transit: 'De camino a recoger',
      out_for_delivery: 'Recogiendo hoy',
      delivered: 'Recogido',
      postponed: 'Recogida aplazada',
    };
    const label =
      (isPickup ? pickupLabels[shipment.preparationStatus as string] : undefined) ||
      {
        draft: 'Borrador',
        pending: 'Pendiente',
        picking: 'Preparando',
        packed: 'Empaquetado',
        ready: 'Listo',
        dispatched: 'Despachado',
        in_transit: 'En tránsito',
        out_for_delivery: 'En reparto',
        postponed: 'Aplazado',
        delivered: 'Entregado',
        receiving: 'Recepcionando',
        received: 'Recibido',
        returned: 'Devuelto',
        cancelled: 'Cancelado',
        exception: 'Incidencia',
      }[shipment.preparationStatus as string] ||
      shipment.preparationStatus;
    const variant =
      shipment.preparationStatus === 'delivered' || shipment.preparationStatus === 'received'
        ? 'success'
        : shipment.preparationStatus === 'cancelled' || shipment.preparationStatus === 'exception'
          ? 'error'
          : 'info';
    return { label, variant };
  })();

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <header className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => openTab('/logistics')}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            <ArrowLeft size={14} />
          </button>
          <div className="flex items-center gap-2">
            {isInbound ? (
              <PackageCheck className="text-emerald-600 dark:text-emerald-300" size={22} />
            ) : (
              <TruckIcon className="text-blue-600 dark:text-blue-300" size={22} />
            )}
            <div>
              <h1 className="text-lg font-black text-slate-900 dark:text-slate-100">
                {isInbound ? 'Recepción' : isPickup ? 'Recogida' : 'Envío propio'} ·{' '}
                {shipment.trackingNumber || (shipment.id || '').slice(0, 8)}
              </h1>
              <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                <Badge variant={prepBadge.variant}>{prepBadge.label}</Badge>
                {!isInbound && shipment.driverName && <span>Conductor: {shipment.driverName}</span>}
                {!isInbound && shipment.vehiclePlate && <span>· {shipment.vehiclePlate}</span>}
                {isInbound && shipment.carrier && shipment.carrier !== 'propio' && (
                  <span>Transportista: {shipment.carrier}</span>
                )}
                {isInbound && shipment.trackingNumber && (
                  <span className="font-mono">Tracking: {shipment.trackingNumber}</span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Desktop: acciones en línea */}
          <div className="hidden md:flex items-center gap-2 flex-wrap justify-end">
            {shipment.status !== 'cancelled' &&
              shipment.status !== 'delivered' &&
              shipment.status !== 'returned' && (
                <Button
                  variant="secondary"
                  onClick={() => setCancelModal({ reason: '', cancelDn: false })}
                  className="flex items-center gap-2 !text-rose-600"
                >
                  ✕ Cancelar
                </Button>
              )}
            {shipment.status !== 'cancelled' && shipment.status !== 'returned' && (
              <Button
                variant="secondary"
                onClick={() => setReturnModal({ reason: '', cancelDn: false })}
                className="flex items-center gap-2 !text-amber-700"
              >
                ↩ Devolver
              </Button>
            )}
            {!isInbound &&
              shipment.kind !== 'pickup_return' &&
              ['delivered', 'exception'].includes(shipment.status) && (
                <Button
                  variant="secondary"
                  onClick={openPickupModal}
                  className="flex items-center gap-2 !text-purple-700"
                >
                  📦 Programar recogida
                </Button>
              )}
            <Button variant="secondary" onClick={load} className="flex items-center gap-2">
              <RefreshCw size={14} /> Refrescar
            </Button>
          </div>
          {/* Móvil: kebab con las mismas acciones */}
          <div className="md:hidden relative">
            <button
              onClick={() => setActionsOpen((v) => !v)}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              aria-label="Más acciones"
            >
              <MoreVertical size={16} />
            </button>
            {actionsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setActionsOpen(false)} />
                <div className="absolute right-0 mt-1 z-50 min-w-[220px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1">
                  <button
                    onClick={() => {
                      setActionsOpen(false);
                      load();
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                  >
                    <RefreshCw size={14} /> Refrescar
                  </button>
                  {shipment.status !== 'cancelled' && shipment.status !== 'returned' && (
                    <button
                      onClick={() => {
                        setActionsOpen(false);
                        setReturnModal({ reason: '', cancelDn: false });
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-amber-700 dark:text-amber-300 flex items-center gap-2"
                    >
                      ↩ Devolver
                    </button>
                  )}
                  {!isInbound &&
                    shipment.kind !== 'pickup_return' &&
                    ['delivered', 'exception'].includes(shipment.status) && (
                      <button
                        onClick={() => {
                          setActionsOpen(false);
                          openPickupModal();
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-purple-700 dark:text-purple-300 flex items-center gap-2"
                      >
                        📦 Programar recogida
                      </button>
                    )}
                  {shipment.status !== 'cancelled' &&
                    shipment.status !== 'delivered' &&
                    shipment.status !== 'returned' && (
                      <button
                        onClick={() => {
                          setActionsOpen(false);
                          setCancelModal({ reason: '', cancelDn: false });
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-rose-600 dark:text-rose-300 flex items-center gap-2"
                      >
                        ✕ Cancelar
                      </button>
                    )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Mapa (solo outbound — en recepciones no hay tracking GPS propio) */}
        {!isInbound ? (
          <Card bodyClassName="p-0 md:col-span-2 h-[520px] overflow-hidden relative">
            {/* Buscador de dirección — siempre visible en la esquina sup-izq. */}
            <MapSearchBox
              authHeader={token ? `Bearer ${token}` : undefined}
              tenantId={user?.tenantId || undefined}
              onSelect={(s) => {
                mapRef.current?.flyTo({ longitude: s.lng, latitude: s.lat, zoom: 18 });
                saveDestination(s.lat, s.lng);
              }}
            />

            {/* Aviso si no hay pin — se muestra JUNTO al buscador, nunca
                 tapándolo. Ahora también invita a usarlo. */}
            {shipment.destinationAddress &&
              (shipment.destinationLat == null || shipment.destinationLng == null) && (
                <div
                  className="absolute z-[9] bg-amber-50 border border-amber-300 text-amber-900 rounded-lg px-3 py-2 text-xs shadow-md"
                  style={{ top: 66, left: 10, right: 10, maxWidth: 380 }}
                >
                  <b>Sin pin de destino.</b> Usa el buscador arriba o toca en el mapa para colocarlo
                  sobre la puerta del cliente.
                </div>
              )}
            <BaseMap
              ref={mapRef}
              latitude={centerLat}
              longitude={centerLng}
              zoom={13}
              onClick={(e: MapLayerMouseEvent) => {
                // Tap-to-place cuando no hay pin de destino aún.
                if (
                  shipment.destinationAddress &&
                  (shipment.destinationLat == null || shipment.destinationLng == null)
                ) {
                  saveDestination(e.lngLat.lat, e.lngLat.lng);
                }
              }}
            >
              {shipment.lastLat != null && shipment.lastLng != null && (
                <Marker longitude={shipment.lastLng} latitude={shipment.lastLat} anchor="center">
                  <div
                    title={`Conductor — ${fmt.date(shipment.lastLocationAt)}`}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      background: '#0284c7',
                      border: '3px solid white',
                      boxShadow: '0 0 0 4px rgba(2,132,199,0.25)',
                    }}
                  />
                </Marker>
              )}
              {shipment.destinationLat != null && shipment.destinationLng != null && (
                <Marker
                  longitude={shipment.destinationLng}
                  latitude={shipment.destinationLat}
                  anchor="bottom"
                  draggable
                  onDragEnd={(e) => saveDestination(e.lngLat.lat, e.lngLat.lng)}
                >
                  <div
                    title="Arrastra el pin para corregirlo"
                    style={{
                      fontSize: 26,
                      lineHeight: 1,
                      filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))',
                      cursor: 'grab',
                    }}
                  >
                    📍
                  </div>
                </Marker>
              )}
              {polylineGeoJSON && (
                <Source id="track-line" type="geojson" data={polylineGeoJSON}>
                  <Layer
                    id="track-line-layer"
                    type="line"
                    paint={{
                      'line-color': '#0D9488',
                      'line-width': 3,
                      'line-opacity': 0.9,
                    }}
                  />
                </Source>
              )}
            </BaseMap>
          </Card>
        ) : (
          <Card className="md:col-span-2" bodyClassName="p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                <PackageCheck size={24} className="text-emerald-600 dark:text-emerald-300" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                  Recepción de mercancía
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  El proveedor entrega en tus instalaciones. Verifica cantidades en{' '}
                  <b>Preparación</b> y pulsa <b>Recibir</b> cuando esté todo conforme.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  <Warehouse className="inline mr-1" size={11} /> Punto de recepción
                </div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {shipment.destinationAddress || 'Tu almacén'}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  <TruckIcon className="inline mr-1" size={11} /> Transportista del proveedor
                </div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {shipment.carrier && shipment.carrier !== 'propio' ? shipment.carrier : '—'}
                </div>
                {shipment.trackingNumber && (
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                    {shipment.trackingNumber}
                  </div>
                )}
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Albarán origen
                </div>
                <div className="text-xs font-mono text-slate-600 dark:text-slate-300">
                  {shipment.sourceDocId ? String(shipment.sourceDocId).slice(0, 8) + '…' : '—'}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  Recepción
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  {shipment.receivedAt ? fmt.date(shipment.receivedAt) : 'Pendiente de verificar'}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Panel derecho */}
        <div className="space-y-3">
          {/* Dirección destacada — outbound muestra "Envío a", inbound "Recepción en" */}
          <Card bodyClassName="p-4 space-y-2">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
              {isInbound ? (
                <>
                  <Warehouse size={11} /> Recepción en
                </>
              ) : (
                <>📍 {isPickup ? 'Dirección de recogida' : 'Dirección de envío'}</>
              )}
            </div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-pre-line">
              {shipment.destinationAddress || (
                <span className="text-slate-400 italic font-normal">Sin dirección asignada</span>
              )}
            </div>
            {shipment.destinationLat != null && shipment.destinationLng != null && (
              <a
                href={`https://www.openstreetmap.org/?mlat=${shipment.destinationLat}&mlon=${shipment.destinationLng}#map=16/${shipment.destinationLat}/${shipment.destinationLng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-accent hover:underline font-mono"
              >
                {shipment.destinationLat.toFixed(5)}, {shipment.destinationLng.toFixed(5)} ↗
              </a>
            )}
          </Card>

          {/* Reporte de posición solo en outbound — carece de sentido en recepciones */}
          {!isInbound && (
            <Card bodyClassName="p-4 space-y-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Reporte de posición
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                La app del conductor (u otro tracker) debe hacer <code>POST</code> con lat/lng a:
              </div>
              <div className="font-mono text-[10px] bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded p-2 break-all text-slate-700 dark:text-slate-200">
                {trackUrl}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={copyToken}
                className="flex items-center gap-2 w-full"
              >
                <Copy size={12} /> Copiar token
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={sendTestNotification}
                className="flex items-center gap-2 w-full mt-2"
              >
                ✉ Enviar notificación al destinatario
              </Button>
            </Card>
          )}

          <Card bodyClassName="p-0">
            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-500">
              Eventos ({events.length})
            </div>
            <ul className="max-h-[300px] overflow-auto">
              {events.length === 0 ? (
                <li className="px-4 py-3 text-xs text-slate-400">Sin eventos.</li>
              ) : (
                events.map((e) => (
                  <li
                    key={e.id}
                    className="px-4 py-2 border-b border-slate-50 dark:border-slate-800/50 last:border-0 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">{e.kind}</Badge>
                      {e.status && (
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {e.status}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 ml-auto">
                        {fmt.date(e.createdAt)}
                      </span>
                    </div>
                    {e.description && (
                      <div className="mt-0.5 text-slate-600 dark:text-slate-300">
                        {e.description}
                      </div>
                    )}
                  </li>
                ))
              )}
            </ul>
          </Card>
        </div>
      </div>

      {/* Modal Cancelar envío */}
      <Modal
        isOpen={!!cancelModal}
        onClose={() => setCancelModal(null)}
        title="Cancelar envío"
        subtitle="Se incluye el motivo en el email al destinatario y en los webhooks."
      >
        {cancelModal && (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Motivo (opcional)
              </label>
              <Input
                placeholder="Ej: cliente pidió cancelar, error en la preparación…"
                value={cancelModal.reason}
                onChange={(e) => setCancelModal({ ...cancelModal, reason: e.target.value })}
              />
            </div>
            {shipment.deliveryNoteId && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cancelModal.cancelDn}
                  onChange={(e) => setCancelModal({ ...cancelModal, cancelDn: e.target.checked })}
                  className="mt-1"
                />
                <span className="text-xs text-slate-700 dark:text-slate-200">
                  También anular el albarán asociado.
                  <span className="block text-[11px] text-slate-500 mt-0.5">
                    Desmarcado = se mantiene el albarán para trazabilidad y poder re-preparar.
                  </span>
                </span>
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setCancelModal(null)}>
                Volver
              </Button>
              <Button onClick={submitCancel} className="!bg-rose-600 hover:!bg-rose-700">
                ✕ Cancelar envío
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Devolver envío */}
      <Modal
        isOpen={!!returnModal}
        onClose={() => setReturnModal(null)}
        title="Registrar devolución"
        subtitle="Crea una entrada de stock (GoodsReceipt en borrador) con la mercancía devuelta."
      >
        {returnModal && (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Motivo
              </label>
              <Input
                placeholder="Rechazo del cliente, dañado, dirección errónea…"
                value={returnModal.reason}
                onChange={(e) => setReturnModal({ ...returnModal, reason: e.target.value })}
              />
            </div>
            {shipment.deliveryNoteId && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={returnModal.cancelDn}
                  onChange={(e) => setReturnModal({ ...returnModal, cancelDn: e.target.checked })}
                  className="mt-1"
                />
                <span className="text-xs text-slate-700 dark:text-slate-200">
                  Devolución definitiva — anular también el albarán.
                  <span className="block text-[11px] text-slate-500 mt-0.5">
                    Desmarcado = albarán sigue abierto para poder reintentar el reparto más
                    adelante.
                  </span>
                </span>
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setReturnModal(null)}>
                Volver
              </Button>
              <Button onClick={submitReturn} className="!bg-amber-600 hover:!bg-amber-700">
                ↩ Registrar devolución
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Programar recogida — crea un envío pickup_return con el mismo
          destino: el conductor va a casa del cliente a RECOGER el paquete. */}
      <Modal
        isOpen={!!pickupModal}
        onClose={() => setPickupModal(null)}
        title="Programar recogida"
        subtitle="Se crea un envío de recogida al mismo destino. El conductor verá «Recoger de» en su app y, al recogerlo, se generará la entrada de stock en borrador."
      >
        {pickupModal && (
          <div className="space-y-4">
            <div className="text-xs text-slate-600 dark:text-slate-300 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2">
              Recoger en: <b>{shipment.destinationAddress || '—'}</b>
              {shipment.recipientName ? ` · ${shipment.recipientName}` : ''}
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Motivo
              </label>
              <Input
                placeholder="Contenido incorrecto, producto dañado…"
                value={pickupModal.reason}
                onChange={(e) => setPickupModal({ ...pickupModal, reason: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Almacén de retorno
              </label>
              <select
                value={pickupModal.warehouseId}
                onChange={(e) => setPickupModal({ ...pickupModal, warehouseId: e.target.value })}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 py-2 text-slate-800 dark:text-slate-100"
              >
                <option value="">
                  {shipment.deliveryNoteId
                    ? 'Automático (almacén del albarán origen)'
                    : '— elige almacén —'}
                </option>
                {warehouses.map((w: any) => (
                  <option key={w.id} value={w.id}>
                    {w.name || w.code || w.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setPickupModal(null)}>
                Volver
              </Button>
              <Button onClick={submitPickup} className="!bg-purple-600 hover:!bg-purple-700">
                📦 Programar recogida
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ShipmentDetail;
