import React, { useRef, useState } from 'react';
import { Alert, Card, MapButton, MapPath, Marker, type TileMapHandle } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { useFormat } from '@/hooks/useFormat';
import type { Shipment } from '../../domain/shipment';
import { LogisticsMap } from '../maps/LogisticsMap';
import { PositionDot } from '../maps/MapPins';
import { logisticsGeocoder } from '../maps/AddressAutocomplete';

interface Props {
  shipment: Shipment;
  track: Array<{ lat: number; lng: number }>;
  onDestinationChange: (lat: number, lng: number) => void;
}

/**
 * Dónde va y por dónde ha ido. El destino se coloca buscando la dirección o tocando
 * en el mapa: si ya hay uno, con el botón de mover, para no cambiarlo sin querer.
 */
export const ShipmentMapCard: React.FC<Props> = ({ shipment, track, onDestinationChange }) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const mapRef = useRef<TileMapHandle>(null);
  const [moving, setMoving] = useState(false);

  const hasDestination = shipment.destinationLat != null && shipment.destinationLng != null;
  const hasPosition = shipment.lastLat != null && shipment.lastLng != null;
  const center = hasPosition
    ? { lat: shipment.lastLat as number, lng: shipment.lastLng as number }
    : hasDestination
      ? { lat: shipment.destinationLat as number, lng: shipment.destinationLng as number }
      : null;

  const place = (lat: number, lng: number) => {
    setMoving(false);
    onDestinationChange(lat, lng);
  };

  return (
    <Card noPadding className="overflow-hidden">
      {(moving || (shipment.destinationAddress && !hasDestination)) && (
        <Alert tone="warning" className="rounded-none">
          {moving ? t('logistics.shipmentDetail.moveHint') : t('logistics.shipmentDetail.noPinHint')}
        </Alert>
      )}
      <LogisticsMap
        ref={mapRef}
        className="h-[440px]"
        view={center ? { ...center, zoom: 14 } : null}
        geocoder={logisticsGeocoder}
        searchPlaceholder={t('logistics.mapSearch.placeholder')}
        onSearchSelect={(result) => place(result.lat, result.lng)}
        onMapClick={
          moving || !hasDestination ? (point) => place(point.lat, point.lng) : undefined
        }
        actions={
          hasDestination ? (
            <MapButton active={moving} onClick={() => setMoving((v) => !v)}>
              {t('logistics.shipmentDetail.movePin')}
            </MapButton>
          ) : undefined
        }
      >
        {track.length >= 2 && <MapPath points={track} />}
        {hasPosition && (
          <Marker
            lat={shipment.lastLat as number}
            lng={shipment.lastLng as number}
            label={t('logistics.shipmentDetail.driverMarker', {
              date: fmt.date(shipment.lastLocationAt),
            })}
          >
            <PositionDot />
          </Marker>
        )}
        {hasDestination && (
          <Marker
            lat={shipment.destinationLat as number}
            lng={shipment.destinationLng as number}
            label={shipment.destinationAddress || undefined}
          />
        )}
      </LogisticsMap>
    </Card>
  );
};
