import { useEffect, useState } from 'react';
import { driverApi } from '../api';
import { DEFAULT_MAP_SETTINGS, type MapSettings } from '../domain/deliveryFlow';

let cached: Promise<MapSettings> | null = null;

/** Tras guardar la configuración, los mapas siguientes ya salen con la nueva. */
export function invalidateMapSettings() {
  cached = null;
}

/**
 * El mapa que usa la empresa. La página pública no tiene sesión y lo recibe con su
 * seguimiento; el resto lo piden una vez. Si no se puede saber, el de serie.
 */
export function useMapSettings(given?: Partial<MapSettings> | null): MapSettings | null {
  const [loaded, setLoaded] = useState<MapSettings | null>(null);

  useEffect(() => {
    if (given) return;
    let alive = true;
    cached ??= driverApi.mapConfig().catch(() => DEFAULT_MAP_SETTINGS);
    cached.then((settings) => {
      if (alive) setLoaded(settings);
    });
    return () => {
      alive = false;
    };
  }, [given]);

  return given ? { ...DEFAULT_MAP_SETTINGS, ...given } : loaded;
}
