import React, { useEffect, useMemo, useState } from 'react';
import type { TableColumn } from '@openfactu/ui';
import { useAuth } from '../context/AuthContext';

interface InternalOrder {
  id: string;
  code: string;
  name: string;
  status: string;
}

/**
 * Devuelve la definición de una columna "Proyecto" para integrar en la
 * tabla de líneas de los formularios de documento. El valor se persiste
 * en `line.internalOrderId`. Vacío = hereda el de cabecera al guardar.
 *
 * Se carga el catálogo `/api/internal-orders` una sola vez por sesión
 * (cache estático en módulo).
 */
const cache: { orders: InternalOrder[] | null } = { orders: null };

export function useInternalOrderLineColumn(updateLine: (idx: number, key: string, value: any) => void) {
  const { token, user } = useAuth();
  const [orders, setOrders] = useState<InternalOrder[]>(cache.orders || []);

  useEffect(() => {
    if (cache.orders) return;
    if (!token || !user?.tenantId) return;
    fetch('/api/internal-orders', {
      headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': user.tenantId },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: InternalOrder[]) => {
        const arr = Array.isArray(d) ? d : [];
        cache.orders = arr;
        setOrders(arr);
      })
      .catch(() => setOrders([]));
  }, [token, user?.tenantId]);

  return useMemo<TableColumn<any>>(
    () => ({
      header: 'Proyecto',
      width: '220px',
      cell: (line: any, idx: number) => (
        <select
          value={line.internalOrderId || ''}
          onChange={(e) => updateLine(idx, 'internalOrderId', e.target.value || null)}
          className="min-w-[200px] text-sm px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
          title="Vacío = hereda el proyecto de cabecera"
        >
          <option value="">— Hereda cabecera —</option>
          {orders
            .filter((o) => o.status !== 'closed')
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} — {o.name}
              </option>
            ))}
        </select>
      ),
    }),
    [orders, updateLine],
  );
}
