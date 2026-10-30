import { internalOrdersApi, type InternalOrder } from '@/modules/analytics/api';
import React, { useEffect, useMemo, useState } from 'react';
import { Select, type TableColumn } from '@openfactu/ui';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';

/**
 * Devuelve la definición de una columna "Proyecto" para integrar en la
 * tabla de líneas de los formularios de documento. El valor se persiste
 * en `line.internalOrderId`. Vacío = hereda el de cabecera al guardar.
 *
 * Se carga el catálogo `/api/internal-orders` una sola vez por sesión
 * (cache estático en módulo).
 */
const cache: { orders: InternalOrder[] | null } = { orders: null };

export function useInternalOrderLineColumn(
  updateLine: (idx: number, key: string, value: any) => void,
) {
  const { token, user } = useAuth();
  const [orders, setOrders] = useState<InternalOrder[]>(cache.orders || []);
  const { t } = useI18n();

  useEffect(() => {
    if (cache.orders) return;
    if (!token || !user?.tenantId) return;
    internalOrdersApi
      .list()
      .catch(() => [])
      .then((d) => {
        const arr = Array.isArray(d) ? d : [];
        cache.orders = arr;
        setOrders(arr);
      })
      .catch(() => setOrders([]));
  }, [token, user?.tenantId]);

  return useMemo<TableColumn<any>>(
    () => ({
      header: t('app.lines.project'),
      width: '220px',
      cell: (line: any, idx: number) => (
        <Select
          options={[
            { value: '', label: t('app.lines.inheritHeader') },
            ...orders
              .filter((o) => o.status !== 'closed')
              .map((o) => ({ value: String(o.id), label: `${o.code} — ${o.name}` })),
          ]}
          value={line.internalOrderId || ''}
          onChange={(v) => updateLine(idx, 'internalOrderId', v || null)}
          className="min-w-[200px]"
          ariaLabel={t('app.lines.project')}
        />
      ),
    }),
    [orders, updateLine, t],
  );
}
