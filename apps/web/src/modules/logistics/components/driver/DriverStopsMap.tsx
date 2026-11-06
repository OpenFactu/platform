import React, { useMemo, useRef, useState } from 'react';
import { Button, MapButton, MapPath, Marker, mapGeo, type TileMapHandle } from '@openfactu/ui';
import { Navigation } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import type { NavigationApp } from '../../domain/deliveryFlow';
import { stopAddress, stopMapsUrl, type Coords } from '../../domain/driverRoute';
import type { RouteStop } from '../../domain/route';
import type { Shipment } from '../../domain/shipment';
import { LogisticsMap } from '../maps/LogisticsMap';
import { NumberedPin, PositionDot } from '../maps/MapPins';

interface Props {
  points: Array<{ stop: RouteStop; coords: Coords }>;
  shipments: Map<string, Shipment>;
  lastFix: { lat: number; lng: number } | null;
  currentId: string | null;
  navigationApp: NavigationApp;
  onPick: (stopId: string) => void;
}

/** Las paradas en el mapa, a toda la pantalla: la que toca resalta sobre las demás. */
export const DriverStopsMap: React.FC<Props> = ({
  points,
  shipments,
  lastFix,
  currentId,
  navigationApp,
  onPick,
}) => {
  const { t } = useI18n();
  const mapRef = useRef<TileMapHandle>(null);
  const [open, setOpen] = useState<string | null>(null);

  const bounds = useMemo(
    () => mapGeo.boundsOf(points.map((p) => ({ lat: p.coords[0], lng: p.coords[1] }))),
    [points],
  );

  const center = () => {
    if (lastFix) mapRef.current?.flyTo({ ...lastFix, zoom: 15 });
    else if (points[0]) {
      mapRef.current?.flyTo({ lat: points[0].coords[0], lng: points[0].coords[1], zoom: 14 });
    }
  };

  return (
    <LogisticsMap
      ref={mapRef}
      className="h-full"
      bounds={bounds}
      actions={
        <MapButton
          onClick={center}
          title={lastFix ? t('logistics.driver.centerGps') : t('logistics.driver.centerFirstStop')}
        >
          <Navigation size={12} /> {t('logistics.driver.center')}
        </MapButton>
      }
    >
      {points.length >= 2 && (
        <MapPath points={points.map((p) => ({ lat: p.coords[0], lng: p.coords[1] }))} dashed />
      )}
      {lastFix && (
        <Marker lat={lastFix.lat} lng={lastFix.lng} label={t('logistics.driver.yourLocation')}>
          <PositionDot />
        </Marker>
      )}
      {points.map(({ stop, coords }) => {
        const shipment = stop.shipmentId ? shipments.get(stop.shipmentId) : undefined;
        const href = stopMapsUrl(stop, shipment, navigationApp);
        const isOpen = ['pending', 'en_route', 'arrived'].includes(stop.status);
        return (
          <Marker
            key={stop.id}
            lat={coords[0]}
            lng={coords[1]}
            label={t('logistics.driver.stopN', { n: stop.sequence })}
            open={open === stop.id}
            onOpenChange={(value) => setOpen(value ? stop.id : null)}
            popup={
              <div className="space-y-2 text-xs">
                <div className="font-bold">{t('logistics.driver.stopN', { n: stop.sequence })}</div>
                <div>{shipment?.recipientName}</div>
                <div>{stopAddress(stop, shipment) || '—'}</div>
                {isOpen && (
                  <Button size="sm" className="w-full" onClick={() => onPick(stop.id)}>
                    {t('logistics.driver.goToStop')}
                  </Button>
                )}
                {href && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={() => window.open(href, '_blank', 'noreferrer')}
                  >
                    {t('logistics.driver.howToGet')}
                  </Button>
                )}
              </div>
            }
          >
            <NumberedPin
              label={stop.sequence}
              tone={
                stop.status === 'delivered' ? 'success' : stop.id === currentId ? 'accent' : 'muted'
              }
            />
          </Marker>
        );
      })}
    </LogisticsMap>
  );
};
