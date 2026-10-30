import { useEffect, useState } from 'react';
import { crudApi } from '@/shared/api';
import { useAuth } from '@/context/AuthContext';

/**
 * Zonas de todos los almacenes, solo cuando el almacén va por línea
 * (`warehouseLocation === 'line'`): cada línea elige almacén y ubicación.
 */
export function useLineZones(warehouseLocation: string | undefined): any[] {
  const { token, user } = useAuth();
  const [zones, setZones] = useState<any[]>([]);
  useEffect(() => {
    if (warehouseLocation !== 'line' || !token || !user?.tenantId) return;
    crudApi
      .list<any>('/api/zones')
      .then((d) => setZones(Array.isArray(d) ? d : []))
      .catch(() => setZones([]));
  }, [warehouseLocation, token, user?.tenantId]);
  return zones;
}
