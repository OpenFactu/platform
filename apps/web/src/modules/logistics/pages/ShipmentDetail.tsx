import { shipmentsApi } from '../api';
import { warehousesApi } from '@/modules/inventory/api';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  Button,
  Badge,
  Loader,
  Modal,
  Input,
  Checkbox,
  DropdownMenu,
  PageHeader,
  SearchableSelect,
  useToast,
  CopyButton,
} from '@openfactu/ui';
import type { BadgeProps } from '@openfactu/ui';
import {
  ArrowLeft,
  RefreshCw,
  PackageCheck,
  Warehouse,
  TruckIcon,
  MoreVertical,
} from 'lucide-react';
import { Marker, Source, Layer, type MapLayerMouseEvent } from 'react-map-gl/maplibre';
import { BaseMap, type BaseMapHandle } from '../components/maps/BaseMap';
import { MapSearchBox } from '../components/maps/MapSearchBox';
import { useAuth } from '@/context/AuthContext';
import { useTabs } from '@/context/TabsContext';
import { useFormat } from '@/hooks/useFormat';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import type { Shipment, ShipmentEvent, ShipmentPosition } from '../domain/shipment';
import type { Warehouse as WarehouseType } from '@/modules/inventory/domain/warehouse';

export const ShipmentDetail: React.FC = () => {
  const { id } = useParams();
  const { token, user } = useAuth();
  const { openTab } = useTabs();
  const fmt = useFormat();
  const toast = useToast();
  const { t } = useI18n();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [positions, setPositions] = useState<ShipmentPosition[]>([]);
  const [events, setEvents] = useState<ShipmentEvent[]>([]);
  const [loading, setLoading] = useState(true);
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
      toast.success(t('logistics.shipmentDetail.cancelled'));
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.shipmentDetail.cancelError'));
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
      toast.success(t('logistics.shipmentDetail.pickupScheduled', { code: d.code || '' }));
      setPickupModal(null);
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.shipmentDetail.pickupError'));
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
          ? t('logistics.shipmentDetail.returnDnCancelled')
          : d.receiptId
            ? t('logistics.shipmentDetail.returnDraftReceipt')
            : t('logistics.shipmentDetail.returnManual'),
      );
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.shipmentDetail.returnError'));
    }
  };

  /** Fuerza el envío del email de notificación al destinatario (debug/manual). */
  const sendTestNotification = async () => {
    if (!id) return;
    const stage = shipment?.status || 'in_transit';
    try {
      await shipmentsApi.notify(id, { stage });
      toast.success(t('logistics.shipmentDetail.emailQueued', { stage }));
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      const status = err instanceof ApiError ? err.status : undefined;
      toast.error(t('logistics.shipmentDetail.errorDetail', { detail: String(msg || status) }));
    }
  };

  /** Actualiza las coordenadas de destino del envío tras arrastrar el pin. */
  const saveDestination = async (lat: number, lng: number) => {
    if (!id) return;
    try {
      await shipmentsApi.update(id, { destinationLat: lat, destinationLng: lng });
      setShipment((prev) => (prev ? { ...prev, destinationLat: lat, destinationLng: lng } : prev));
      toast.success(t('logistics.shipmentDetail.destinationUpdated'));
    } catch {
      toast.error(t('logistics.shipmentDetail.destinationError'));
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
        <p className="text-slate-500">{t('logistics.shipmentDetail.notFound')}</p>
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
      pending: t('logistics.shipmentDetail.pickupStatus.pending'),
      dispatched: t('logistics.shipmentDetail.pickupStatus.dispatched'),
      in_transit: t('logistics.shipmentDetail.pickupStatus.in_transit'),
      out_for_delivery: t('logistics.shipmentDetail.pickupStatus.out_for_delivery'),
      delivered: t('logistics.shipmentDetail.pickupStatus.delivered'),
      postponed: t('logistics.shipmentDetail.pickupStatus.postponed'),
    };
    const label =
      (isPickup ? pickupLabels[shipment.preparationStatus as string] : undefined) ||
      {
        draft: t('logistics.shipmentDetail.status.draft'),
        pending: t('logistics.shipmentDetail.status.pending'),
        picking: t('logistics.shipmentDetail.status.picking'),
        packed: t('logistics.shipmentDetail.status.packed'),
        ready: t('logistics.shipmentDetail.status.ready'),
        dispatched: t('logistics.shipmentDetail.status.dispatched'),
        in_transit: t('logistics.shipmentDetail.status.in_transit'),
        out_for_delivery: t('logistics.shipmentDetail.status.out_for_delivery'),
        postponed: t('logistics.shipmentDetail.status.postponed'),
        delivered: t('logistics.shipmentDetail.status.delivered'),
        receiving: t('logistics.shipmentDetail.status.receiving'),
        received: t('logistics.shipmentDetail.status.received'),
        returned: t('logistics.shipmentDetail.status.returned'),
        cancelled: t('logistics.shipmentDetail.status.cancelled'),
        exception: t('logistics.shipmentDetail.status.exception'),
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

  // Mismas acciones que la barra de escritorio, en forma de items para el
  // DropdownMenu del móvil (mismas condiciones de visibilidad).
  const actionItems = [
    { label: t('logistics.shipmentDetail.refresh'), icon: <RefreshCw size={14} />, onClick: load },
    ...(shipment.status !== 'cancelled' && shipment.status !== 'returned'
      ? [
          {
            label: `↩ ${t('logistics.shipmentDetail.return')}`,
            onClick: () => setReturnModal({ reason: '', cancelDn: false }),
          },
        ]
      : []),
    ...(!isInbound &&
    shipment.kind !== 'pickup_return' &&
    ['delivered', 'exception'].includes(shipment.status)
      ? [{ label: `📦 ${t('logistics.shipmentDetail.schedulePickup')}`, onClick: openPickupModal }]
      : []),
    ...(shipment.status !== 'cancelled' &&
    shipment.status !== 'delivered' &&
    shipment.status !== 'returned'
      ? [
          {
            label: `✕ ${t('logistics.shipmentDetail.cancel')}`,
            destructive: true,
            onClick: () => setCancelModal({ reason: '', cancelDn: false }),
          },
        ]
      : []),
  ];

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <PageHeader
        size="sm"
        divider
        title={
          <>
            {isInbound
              ? t('logistics.shipmentDetail.kind.inbound')
              : isPickup
                ? t('logistics.shipmentDetail.kind.pickup')
                : t('logistics.shipmentDetail.kind.own')}{' '}
            · {shipment.trackingNumber || (shipment.id || '').slice(0, 8)}
            {/* El Badge de estado va con el título y no en `subtitle`: PageHeader
                pinta el subtítulo dentro de un <p> y Badge es un <div>, que el
                navegador cerraría en falso rompiendo la línea. */}
            <Badge variant={prepBadge.variant}>{prepBadge.label}</Badge>
          </>
        }
        icon={isInbound ? <PackageCheck size={22} /> : <TruckIcon size={22} />}
        breadcrumbs={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openTab('/logistics')}
            title={t('logistics.shipmentDetail.backToHub')}
          >
            <ArrowLeft size={14} />
          </Button>
        }
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            {!isInbound && shipment.driverName && (
              <span>
                {t('logistics.shipmentDetail.driverLabel', { name: shipment.driverName })}
              </span>
            )}
            {!isInbound && shipment.vehiclePlate && <span>· {shipment.vehiclePlate}</span>}
            {isInbound && shipment.carrier && shipment.carrier !== 'propio' && (
              <span>{t('logistics.shipmentDetail.carrierLabel', { name: shipment.carrier })}</span>
            )}
            {isInbound && shipment.trackingNumber && (
              <span className="font-mono">
                {t('logistics.shipmentDetail.trackingLabel', { code: shipment.trackingNumber })}
              </span>
            )}
          </span>
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Desktop: acciones en línea */}
            <div className="hidden md:flex items-center gap-2 flex-wrap justify-end">
              {shipment.status !== 'cancelled' &&
                shipment.status !== 'delivered' &&
                shipment.status !== 'returned' && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setCancelModal({ reason: '', cancelDn: false })}
                    className="flex items-center gap-2 !text-rose-600"
                  >
                    ✕ {t('logistics.shipmentDetail.cancel')}
                  </Button>
                )}
              {shipment.status !== 'cancelled' && shipment.status !== 'returned' && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setReturnModal({ reason: '', cancelDn: false })}
                  className="flex items-center gap-2 !text-amber-700"
                >
                  ↩ {t('logistics.shipmentDetail.return')}
                </Button>
              )}
              {!isInbound &&
                shipment.kind !== 'pickup_return' &&
                ['delivered', 'exception'].includes(shipment.status) && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={openPickupModal}
                    className="flex items-center gap-2 !text-purple-700"
                  >
                    📦 {t('logistics.shipmentDetail.schedulePickup')}
                  </Button>
                )}
              <Button
                type="button"
                variant="secondary"
                onClick={load}
                className="flex items-center gap-2"
              >
                <RefreshCw size={14} /> {t('logistics.shipmentDetail.refresh')}
              </Button>
            </div>
            {/* Móvil: kebab con las mismas acciones. DropdownMenu ya gestiona
                apertura, cierre al elegir y click fuera. */}
            <div className="md:hidden">
              <DropdownMenu align="end" items={actionItems}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={t('logistics.shipmentDetail.moreActions')}
                >
                  <MoreVertical size={16} />
                </Button>
              </DropdownMenu>
            </div>
          </div>
        }
      />

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
                  <b>{t('logistics.shipmentDetail.noPinTitle')}</b>{' '}
                  {t('logistics.shipmentDetail.noPinHint')}
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
                    title={t('logistics.shipmentDetail.driverMarker', {
                      date: fmt.date(shipment.lastLocationAt),
                    })}
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
                    title={t('logistics.shipmentDetail.dragPin')}
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
              <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                <PackageCheck size={24} className="text-emerald-600 dark:text-emerald-300" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-fg-default">
                  {t('logistics.shipmentDetail.inbound.title')}
                </h3>
                <p className="text-xs text-fg-muted mt-0.5">
                  {t('logistics.shipmentDetail.inbound.hint1')}{' '}
                  <b>{t('logistics.shipmentDetail.inbound.preparation')}</b>{' '}
                  {t('logistics.shipmentDetail.inbound.hint2')}{' '}
                  <b>{t('logistics.shipmentDetail.inbound.receive')}</b>{' '}
                  {t('logistics.shipmentDetail.inbound.hint3')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border-subtle">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  <Warehouse className="inline mr-1" size={11} />{' '}
                  {t('logistics.shipmentDetail.inbound.receivingPoint')}
                </div>
                <div className="text-sm font-semibold text-fg-default">
                  {shipment.destinationAddress ||
                    t('logistics.shipmentDetail.inbound.yourWarehouse')}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  <TruckIcon className="inline mr-1" size={11} />{' '}
                  {t('logistics.shipmentDetail.inbound.supplierCarrier')}
                </div>
                <div className="text-sm font-semibold text-fg-default">
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
                  {t('logistics.shipmentDetail.inbound.sourceNote')}
                </div>
                <div className="text-xs font-mono text-fg-body">
                  {shipment.sourceDocId ? String(shipment.sourceDocId).slice(0, 8) + '…' : '—'}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  {t('logistics.shipmentDetail.inbound.reception')}
                </div>
                <div className="text-xs text-fg-body">
                  {shipment.receivedAt
                    ? fmt.date(shipment.receivedAt)
                    : t('logistics.shipmentDetail.inbound.pendingVerification')}
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
                  <Warehouse size={11} /> {t('logistics.shipmentDetail.receivingAt')}
                </>
              ) : (
                <>
                  📍{' '}
                  {isPickup
                    ? t('logistics.shipmentDetail.pickupAddress')
                    : t('logistics.shipmentDetail.shippingAddress')}
                </>
              )}
            </div>
            <div className="text-sm font-semibold text-fg-default whitespace-pre-line">
              {shipment.destinationAddress || (
                <span className="text-slate-400 italic font-normal">
                  {t('logistics.shipmentDetail.noAddress')}
                </span>
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
                {t('logistics.shipmentDetail.positionReport')}
              </div>
              <div className="text-[11px] text-fg-body">
                {t('logistics.shipmentDetail.positionHintBefore')} <code>POST</code>{' '}
                {t('logistics.shipmentDetail.positionHintAfter')}
              </div>
              <div className="font-mono text-[10px] bg-bg-muted border border-border-default rounded p-2 break-all text-fg-body">
                {trackUrl}
              </div>
              <CopyButton
                value={shipment?.reportToken || ''}
                variant="secondary"
                label={t('logistics.shipmentDetail.copyToken')}
                className="w-full"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={sendTestNotification}
                className="flex items-center gap-2 w-full mt-2"
              >
                ✉ {t('logistics.shipmentDetail.sendNotification')}
              </Button>
            </Card>
          )}

          <Card bodyClassName="p-0">
            <div className="px-4 py-2 border-b border-border-subtle text-[10px] font-black uppercase tracking-wider text-slate-500">
              {t('logistics.shipmentDetail.events', { count: events.length })}
            </div>
            <ul className="max-h-[300px] overflow-auto">
              {events.length === 0 ? (
                <li className="px-4 py-3 text-xs text-slate-400">
                  {t('logistics.shipmentDetail.noEvents')}
                </li>
              ) : (
                events.map((e) => (
                  <li
                    key={e.id}
                    className="px-4 py-2 border-b border-border-subtle last:border-0 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">{e.kind}</Badge>
                      {e.status && <span className="font-semibold text-fg-body">{e.status}</span>}
                      <span className="text-[10px] text-slate-400 ml-auto">
                        {fmt.date(e.createdAt)}
                      </span>
                    </div>
                    {e.description && <div className="mt-0.5 text-fg-body">{e.description}</div>}
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
        title={t('logistics.shipmentDetail.cancelModal.title')}
        subtitle={t('logistics.shipmentDetail.cancelModal.subtitle')}
      >
        {cancelModal && (
          <div className="space-y-4">
            <Input
              label={t('logistics.shipmentDetail.cancelModal.reason')}
              placeholder={t('logistics.shipmentDetail.cancelModal.reasonPlaceholder')}
              value={cancelModal.reason}
              onChange={(e) => setCancelModal({ ...cancelModal, reason: e.target.value })}
            />
            {shipment.deliveryNoteId && (
              // Campo del formulario del modal → Checkbox (no tiene prop
              // `label`, se conserva el <label> que lo envuelve).
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={cancelModal.cancelDn}
                  onChange={(v) => setCancelModal({ ...cancelModal, cancelDn: v })}
                  className="mt-1"
                />
                <span className="text-xs text-fg-body">
                  {t('logistics.shipmentDetail.cancelModal.cancelDn')}
                  <span className="block text-[11px] text-slate-500 mt-0.5">
                    {t('logistics.shipmentDetail.cancelModal.cancelDnHint')}
                  </span>
                </span>
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setCancelModal(null)}>
                {t('logistics.shipmentDetail.back')}
              </Button>
              <Button variant="danger" onClick={submitCancel}>
                ✕ {t('logistics.shipmentDetail.cancelModal.title')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Devolver envío */}
      <Modal
        isOpen={!!returnModal}
        onClose={() => setReturnModal(null)}
        title={t('logistics.shipmentDetail.returnModal.title')}
        subtitle={t('logistics.shipmentDetail.returnModal.subtitle')}
      >
        {returnModal && (
          <div className="space-y-4">
            <Input
              label={t('logistics.shipmentDetail.reason')}
              placeholder={t('logistics.shipmentDetail.returnModal.reasonPlaceholder')}
              value={returnModal.reason}
              onChange={(e) => setReturnModal({ ...returnModal, reason: e.target.value })}
            />
            {shipment.deliveryNoteId && (
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={returnModal.cancelDn}
                  onChange={(v) => setReturnModal({ ...returnModal, cancelDn: v })}
                  className="mt-1"
                />
                <span className="text-xs text-fg-body">
                  {t('logistics.shipmentDetail.returnModal.cancelDn')}
                  <span className="block text-[11px] text-slate-500 mt-0.5">
                    {t('logistics.shipmentDetail.returnModal.cancelDnHint')}
                  </span>
                </span>
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setReturnModal(null)}>
                {t('logistics.shipmentDetail.back')}
              </Button>
              <Button variant="accent" onClick={submitReturn}>
                ↩ {t('logistics.shipmentDetail.returnModal.title')}
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
        title={t('logistics.shipmentDetail.schedulePickup')}
        subtitle={t('logistics.shipmentDetail.pickupModal.subtitle')}
      >
        {pickupModal && (
          <div className="space-y-4">
            <div className="text-xs text-fg-body rounded-lg bg-bg-muted border border-border-default px-3 py-2">
              {t('logistics.shipmentDetail.pickupModal.collectAt')}{' '}
              <b>{shipment.destinationAddress || '—'}</b>
              {shipment.recipientName ? ` · ${shipment.recipientName}` : ''}
            </div>
            <Input
              label={t('logistics.shipmentDetail.reason')}
              placeholder={t('logistics.shipmentDetail.pickupModal.reasonPlaceholder')}
              value={pickupModal.reason}
              onChange={(e) => setPickupModal({ ...pickupModal, reason: e.target.value })}
            />
            <div>
              {/* Almacenes del servidor → SearchableSelect (sin prop `label`).
                  El vacío es válido (lo deduce el backend del albarán origen),
                  así que va `clearable`. */}
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                {t('logistics.shipmentDetail.pickupModal.returnWarehouse')}
              </label>
              <SearchableSelect
                options={warehouses.map((w: any) => ({
                  value: w.id,
                  label: w.name || w.code || w.id,
                  secondaryLabel: w.name && w.code ? w.code : undefined,
                }))}
                value={pickupModal.warehouseId}
                onChange={(v) => setPickupModal({ ...pickupModal, warehouseId: v })}
                placeholder={
                  shipment.deliveryNoteId
                    ? t('logistics.shipmentDetail.pickupModal.autoWarehouse')
                    : t('logistics.shipmentDetail.pickupModal.chooseWarehouse')
                }
                clearable
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setPickupModal(null)}>
                {t('logistics.shipmentDetail.back')}
              </Button>
              <Button onClick={submitPickup} className="!bg-purple-600 hover:!bg-purple-700">
                📦 {t('logistics.shipmentDetail.schedulePickup')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ShipmentDetail;
