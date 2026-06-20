import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import Map, { NavigationControl, type MapRef, type MapLayerMouseEvent } from 'react-map-gl/maplibre';

/**
 * Wrapper común sobre <Map> de react-map-gl/maplibre.
 *
 * - Estilo "Mapa": Carto Voyager (vectorial, gratis, sin API key). Pinta
 *   edificios + calles secundarias, útil para localizar casas.
 * - Estilo "Satélite": ESRI World Imagery (raster, gratis). Permite
 *   ubicar el portal mirando literalmente desde el cielo.
 *
 * Un botón flotante permite alternar entre los dos sin perder el
 * centro / zoom actual.
 */

/**
 * OpenFreeMap "liberty": vector tiles de OSM gratuitas sin API key con buen
 * nivel de detalle — muestra edificios, calles secundarias y **números de
 * portal** a partir de zoom ≈17. Sustituye al Carto Voyager que era
 * demasiado esquemático para localizar casas concretas.
 */
const MAP_STYLE_VOYAGER = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Estilo satélite declarado inline (raster source + layer). MapLibre no
 * ofrece un style URL remoto de ESRI, así que lo montamos aquí. Attribution
 * incluido en el tile — ESRI permite uso gratuito.
 */
const MAP_STYLE_SATELLITE: any = {
  version: 8,
  sources: {
    'esri-imagery': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution:
        'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    },
  },
  layers: [
    {
      id: 'esri-imagery',
      type: 'raster',
      source: 'esri-imagery',
    },
  ],
};

export interface BaseMapProps {
  longitude: number;
  latitude: number;
  zoom?: number;
  style?: React.CSSProperties;
  /** Si se pasa, sobreescribe el estilo (y deshabilita el toggle satélite). */
  mapStyle?: string;
  interactive?: boolean;
  showNavControl?: boolean;
  /** Permite ocultar el toggle cuando el mapa es un thumbnail (p. ej. vista pública). */
  showSatelliteToggle?: boolean;
  onClick?: (e: MapLayerMouseEvent) => void;
  children?: React.ReactNode;
  className?: string;
}

export interface BaseMapHandle {
  flyTo: (opts: { longitude: number; latitude: number; zoom?: number }) => void;
  getMap: () => MapRef | null;
}

export const BaseMap = forwardRef<BaseMapHandle, BaseMapProps>(function BaseMap(
  {
    longitude,
    latitude,
    zoom = 13,
    style = { height: '100%', width: '100%' },
    mapStyle,
    interactive = true,
    showNavControl = true,
    showSatelliteToggle = true,
    onClick,
    children,
    className,
  },
  ref,
) {
  const mapRef = useRef<MapRef | null>(null);
  // Satélite por defecto: en zonas rurales OSM suele carecer de edificios,
  // y para colocar un pin en la puerta del cliente la vista aérea es
  // incomparablemente más útil. El usuario puede volver a "Mapa" con el
  // toggle de la esquina inferior izquierda.
  const [mode, setMode] = useState<'map' | 'satellite'>('satellite');

  // Si el caller fuerza un `mapStyle`, respeta eso y oculta el toggle.
  const resolvedStyle = useMemo<any>(() => {
    if (mapStyle) return mapStyle;
    return mode === 'satellite' ? MAP_STYLE_SATELLITE : MAP_STYLE_VOYAGER;
  }, [mapStyle, mode]);

  useImperativeHandle(ref, () => ({
    flyTo: ({ longitude: lng, latitude: lat, zoom: z }) => {
      const m = mapRef.current?.getMap();
      if (!m) return;
      m.flyTo({ center: [lng, lat], zoom: z ?? m.getZoom(), duration: 800 });
    },
    getMap: () => mapRef.current,
  }));

  const canToggle = showSatelliteToggle && !mapStyle && interactive;

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <Map
        ref={mapRef}
        initialViewState={{ longitude, latitude, zoom }}
        style={style}
        mapStyle={resolvedStyle}
        interactive={interactive}
        onClick={onClick}
        attributionControl={false}
      >
        {showNavControl && interactive && (
          <NavigationControl position="top-right" showCompass={false} />
        )}
        {children}
      </Map>

      {canToggle && (
        <div
          style={{
            position: 'absolute',
            left: 10,
            bottom: 10,
            zIndex: 5,
            display: 'flex',
            gap: 2,
            background: 'rgba(255,255,255,0.95)',
            borderRadius: 8,
            padding: 2,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          <button
            type="button"
            onClick={() => setMode('map')}
            className={
              'px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md transition-colors ' +
              (mode === 'map'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100')
            }
            title="Mapa"
          >
            Mapa
          </button>
          <button
            type="button"
            onClick={() => setMode('satellite')}
            className={
              'px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md transition-colors ' +
              (mode === 'satellite'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100')
            }
            title="Satélite"
          >
            Satélite
          </button>
        </div>
      )}
    </div>
  );
});
