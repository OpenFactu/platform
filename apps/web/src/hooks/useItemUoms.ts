import { itemsApi } from '@/modules/inventory/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export interface AvailableUom {
  uomId: string;
  code: string;
  name: string;
  factor: string;
  isBase: boolean;
  id?: string;
}

// Caché global a nivel de módulo: compartida entre todos los componentes y tabs.
const cache: Record<string, AvailableUom[]> = {};
const inflight: Set<string> = new Set();
const listeners: Set<() => void> = new Set();

function notifyAll() {
  listeners.forEach((fn) => fn());
}

/**
 * Hook eficiente: caché global (no per-component), sólo re-renderiza el componente
 * que pidió un itemId pendiente cuando su fetch se resuelve.
 */
export function useItemUoms() {
  const { token, user } = useAuth();
  const pendingRef = useRef<Set<string>>(new Set());
  const [, bump] = useState(0);

  useEffect(() => {
    const onResolve = () => {
      let hit = false;
      for (const id of pendingRef.current) {
        if (cache[id]) {
          pendingRef.current.delete(id);
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
    (itemId: string): AvailableUom[] => {
      if (!itemId) return [];
      if (cache[itemId]) return cache[itemId];
      if (inflight.has(itemId)) {
        pendingRef.current.add(itemId);
        return [];
      }

      inflight.add(itemId);
      pendingRef.current.add(itemId);

      itemsApi
        .listUoms(itemId)
        // El endpoint devuelve más campos (name/isBase) que el tipo
        // compartido ItemUomAlternative — este hook los necesita todos.
        .then((data) => {
          const list = data as unknown as AvailableUom[];
          cache[itemId] = Array.isArray(list) ? list : [];
          inflight.delete(itemId);
          notifyAll();
        })
        .catch(() => {
          cache[itemId] = [];
          inflight.delete(itemId);
          notifyAll();
        });

      return [];
    },
    [token, user?.tenantId],
  );

  return { get };
}
