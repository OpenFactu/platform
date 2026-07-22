import { coreApi } from '@/shared/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export interface ZoneStock {
  zoneId: string;
  stock: number;
}

// Caché global a nivel de módulo: compartida entre todos los componentes y tabs.
const cache: Record<string, ZoneStock[]> = {};
const inflight: Set<string> = new Set();
const listeners: Set<() => void> = new Set();

function notifyAll() {
  listeners.forEach((fn) => fn());
}

/**
 * Zonas con stock > 0 de un artículo en un almacén — para restringir el
 * selector de Ubicación a zonas donde el artículo realmente tiene
 * existencias (evita listar todas las zonas del almacén, la mayoría vacías
 * para ese artículo). `undefined` = aún sin pedir o cargando (el consumidor
 * debe hacer fallback al comportamiento sin filtrar); `[]` = confirmado que
 * no hay stock en ninguna zona.
 */
export function useZonesWithStock() {
  const { token, user } = useAuth();
  const pendingRef = useRef<Set<string>>(new Set());
  const [, bump] = useState(0);

  useEffect(() => {
    const onResolve = () => {
      let hit = false;
      for (const key of pendingRef.current) {
        if (cache[key]) {
          pendingRef.current.delete(key);
          hit = true;
        }
      }
      if (hit) bump((x) => x + 1);
    };
    listeners.add(onResolve);
    return () => {
      listeners.delete(onResolve);
    };
  }, []);

  const get = useCallback(
    (itemId?: string, warehouseId?: string): ZoneStock[] | undefined => {
      if (!itemId || !warehouseId) return undefined;
      const key = `${itemId}::${warehouseId}`;
      if (cache[key]) return cache[key];
      if (inflight.has(key)) {
        pendingRef.current.add(key);
        return undefined;
      }

      inflight.add(key);
      pendingRef.current.add(key);

      coreApi.get<any>(`/api/stock/items/${itemId}/zones-with-stock?warehouseId=${warehouseId}`)
        .catch(() => ([]))
        .then((data) => {
          cache[key] = Array.isArray(data) ? data : [];
          inflight.delete(key);
          notifyAll();
        })
        .catch(() => {
          cache[key] = [];
          inflight.delete(key);
          notifyAll();
        });

      return undefined;
    },
    [token, user?.tenantId],
  );

  return { get };
}
