import type { MapSettings } from './deliveryFlow';

/** Proveedores conocidos, para no tener que buscar su dirección. Solo rellenan el formulario. */
export interface MapPreset {
  id: string;
  name: string;
  tileUrl: string;
  satelliteUrl: string;
  attribution: string;
}

export const MAP_PRESETS: MapPreset[] = [
  {
    id: 'maptiler',
    name: 'MapTiler',
    tileUrl: 'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key={key}',
    satelliteUrl: 'https://api.maptiler.com/maps/satellite/256/{z}/{x}/{y}.jpg?key={key}',
    attribution: '© MapTiler © OpenStreetMap',
  },
  {
    id: 'mapbox',
    name: 'Mapbox',
    tileUrl:
      'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token={key}',
    satelliteUrl:
      'https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/256/{z}/{x}/{y}?access_token={key}',
    attribution: '© Mapbox © OpenStreetMap',
  },
  {
    id: 'stadia',
    name: 'Stadia Maps',
    tileUrl: 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}.png?api_key={key}',
    satelliteUrl:
      'https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.jpg?api_key={key}',
    attribution: '© Stadia Maps © OpenMapTiles © OpenStreetMap',
  },
  {
    id: 'thunderforest',
    name: 'Thunderforest',
    tileUrl: 'https://tile.thunderforest.com/atlas/{z}/{x}/{y}.png?apikey={key}',
    satelliteUrl: '',
    attribution: '© Thunderforest © OpenStreetMap',
  },
];

export const OWN_SERVER = 'own';

/** Qué proveedor es la dirección escrita; si se retoca, deja de serlo. */
export const presetOf = (map: MapSettings) =>
  MAP_PRESETS.find((preset) => preset.tileUrl === map.tileUrl.trim())?.id ?? OWN_SERVER;

/** Los campos que cambian al elegir un proveedor. La clave se deja: es de la empresa. */
export function presetFields(
  id: string,
): Pick<MapSettings, 'tileUrl' | 'satelliteUrl' | 'attribution' | 'maxZoom'> {
  const preset = MAP_PRESETS.find((candidate) => candidate.id === id);
  return {
    tileUrl: preset?.tileUrl ?? '',
    satelliteUrl: preset?.satelliteUrl ?? '',
    attribution: preset?.attribution ?? '',
    maxZoom: null,
  };
}

export type MapProblem = 'tileUrl' | 'satelliteUrl' | 'apiKey' | 'keyHole';

const isTileTemplate = (url: string) =>
  url.startsWith('https://') && ['{z}', '{x}', '{y}'].every((hole) => url.includes(hole));

/**
 * Lo mismo que comprueba el servidor (`normalizeMap`, que deja el mapa de serie si no
 * vale); aquí, para avisar antes de guardar. Si cambia una, cambia la otra.
 */
export function mapProblem(map: MapSettings): MapProblem | null {
  if (map.provider !== 'custom') return null;
  const tileUrl = map.tileUrl.trim();
  const satelliteUrl = map.satelliteUrl.trim();
  if (!isTileTemplate(tileUrl)) return 'tileUrl';
  if (satelliteUrl && !isTileTemplate(satelliteUrl)) return 'satelliteUrl';
  const asksForKey = (tileUrl + satelliteUrl).includes('{key}');
  const hasKey = !!map.apiKey.trim();
  if (asksForKey && !hasKey) return 'apiKey';
  if (hasKey && !asksForKey) return 'keyHole';
  return null;
}
