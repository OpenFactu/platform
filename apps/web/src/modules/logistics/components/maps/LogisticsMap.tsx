import React, { forwardRef, useState } from 'react';
import {
  MapButton,
  MapControl,
  TileMap,
  registerMapStyle,
  type Geocoder,
  type LatLng,
  type MapBounds,
  type MapControlId,
  type MapView,
  type TileMapHandle,
} from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import type { MapSettings, MapView as MapViewName } from '../../domain/deliveryFlow';
import { useMapSettings } from '../../hooks/useMapSettings';

const SATELLITE_STYLE = 'logistics-satellite';
const CUSTOM_STYLE = 'logistics-custom';
const CUSTOM_SATELLITE_STYLE = 'logistics-custom-satellite';

/**
 * Vista aérea: en zonas rurales el mapa suele carecer de edificios, y para colocar
 * un destino en la puerta del cliente es mucho más útil.
 */
registerMapStyle({
  id: SATELLITE_STYLE,
  label: 'Satellite',
  tileUrl:
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Tiles © Esri',
  maxZoom: 19,
  tone: 'dark',
});

/**
 * El mapa normal sale del servidor público de OpenStreetMap, que pide un uso
 * moderado. Para producción se indica otro con `VITE_MAP_TILE_URL`, o cada empresa
 * el suyo en su configuración.
 */
const customTiles = import.meta.env.VITE_MAP_TILE_URL as string | undefined;
if (customTiles) {
  registerMapStyle({
    id: 'standard',
    label: 'Map',
    tileUrl: customTiles,
    attribution: (import.meta.env.VITE_MAP_TILE_ATTRIBUTION as string) || '© OpenStreetMap',
  });
}

const registered = new Map<string, string>();

/** Un estilo de la empresa, registrado solo si ha cambiado. */
function ownStyle(id: string, tileUrl: string, settings: MapSettings, tone?: 'dark'): string {
  const style = {
    id,
    label: 'Map',
    tileUrl,
    attribution: settings.attribution,
    maxZoom: settings.maxZoom ?? undefined,
    subdomains: tileUrl.includes('{s}') ? 'abc' : undefined,
    tone,
  };
  const fingerprint = JSON.stringify(style);
  if (registered.get(id) !== fingerprint) {
    registerMapStyle(style);
    registered.set(id, fingerprint);
  }
  return id;
}

/** El estilo del paquete que corresponde a lo que ha elegido la empresa. */
function baseStyleOf(settings: MapSettings): string {
  if (settings.provider !== 'custom' || !settings.tileUrl) {
    return settings.provider === 'custom' ? 'standard' : settings.provider;
  }
  return ownStyle(CUSTOM_STYLE, settings.tileUrl, settings);
}

/** La vista de satélite del proveedor de la empresa o, si no tiene, la de serie. */
function satelliteStyleOf(settings: MapSettings): string {
  if (settings.provider !== 'custom' || !settings.satelliteUrl) return SATELLITE_STYLE;
  return ownStyle(CUSTOM_SATELLITE_STYLE, settings.satelliteUrl, settings, 'dark');
}

/** Sin nada que enseñar, el mundo entero: el núcleo no da por hecho ningún país. */
const WORLD_VIEW: MapView = { lat: 30, lng: 0, zoom: 2 };

export interface LogisticsMapProps {
  /** Vista inicial. Sin ella, se encuadran `bounds`. */
  view?: MapView | null;
  bounds?: MapBounds | null;
  controls?: readonly MapControlId[] | false;
  interactive?: boolean;
  /** Oculta el conmutador de mapa y satélite. */
  fixedStyle?: boolean;
  /** El mapa de la empresa, en la página pública, que no puede pedirlo. */
  settings?: Partial<MapSettings> | null;
  geocoder?: Geocoder;
  searchPlaceholder?: string;
  onSearchSelect?: React.ComponentProps<typeof TileMap>['onSearchSelect'];
  onMapClick?: (point: LatLng) => void;
  /** Botones propios en la esquina inferior derecha. */
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/** `TileMap` del paquete con lo común de logística: el mapa de la empresa y su conmutador. */
export const LogisticsMap = forwardRef<TileMapHandle, LogisticsMapProps>(function LogisticsMap(
  {
    view,
    bounds,
    controls = ['zoom'],
    interactive = true,
    fixedStyle,
    settings: givenSettings,
    geocoder,
    searchPlaceholder,
    onSearchSelect,
    onMapClick,
    actions,
    className,
    children,
  },
  ref,
) {
  const { t } = useI18n();
  const settings = useMapSettings(givenSettings);
  const [chosen, setChosen] = useState<MapViewName | null>(null);

  // Hasta saber qué mapa usa la empresa no se pide ninguna tesela.
  if (!settings) return <div className={className} />;

  const current = settings.satellite ? (chosen ?? settings.defaultStyle) : 'standard';

  return (
    <TileMap
      ref={ref}
      className={className}
      mapStyle={current === 'satellite' ? satelliteStyleOf(settings) : baseStyleOf(settings)}
      defaultView={view ?? (bounds ? undefined : WORLD_VIEW)}
      bounds={view ? undefined : (bounds ?? undefined)}
      controls={controls}
      interactive={interactive}
      scrollZoom="ctrl"
      geocoder={geocoder}
      searchPlaceholder={searchPlaceholder}
      onSearchSelect={onSearchSelect}
      onMapClick={onMapClick ? (point) => onMapClick(point) : undefined}
      label={t('logistics.map.map')}
    >
      {!fixedStyle && interactive && settings.satellite && (
        <MapControl position="bottom-left">
          <MapButton active={current === 'standard'} onClick={() => setChosen('standard')}>
            {t('logistics.map.map')}
          </MapButton>
          <MapButton active={current === 'satellite'} onClick={() => setChosen('satellite')}>
            {t('logistics.map.satellite')}
          </MapButton>
        </MapControl>
      )}
      {actions && <MapControl position="bottom-right">{actions}</MapControl>}
      {children}
    </TileMap>
  );
});
