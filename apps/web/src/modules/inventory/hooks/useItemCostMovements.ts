import { useEffect, useState } from 'react';
import { itemsApi } from '../api';
import type { ItemCostMovement } from '../domain/itemCost';

/** Por qué cambió el coste de un artículo, lo último primero. */
export function useItemCostMovements(itemId: string) {
  const [movements, setMovements] = useState<ItemCostMovement[]>([]);

  useEffect(() => {
    let cancelled = false;
    itemsApi
      .costMovements(itemId)
      .then((rows) => {
        if (!cancelled) setMovements(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setMovements([]);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  return movements;
}
