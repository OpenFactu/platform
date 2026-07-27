import { internalOrdersApi, type InternalOrder } from '@/modules/analytics/api';
import React, { useEffect, useState } from 'react';
import { SearchableSelect } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';

interface Props {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  label?: string;
  /** Si está activo, las líneas heredan automáticamente este proyecto. */
  inheritsHint?: boolean;
}

/**
 * Selector de Proyecto / Orden Interna para la cabecera de pedidos,
 * albaranes y facturas. Comparte el catálogo `InternalOrder` (3ª dimensión
 * analítica del ERP). Las líneas pueden sobrescribir este valor.
 */
export const InternalOrderHeaderField: React.FC<Props> = ({
  value,
  onChange,
  label = 'Proyecto',
  inheritsHint = true,
}) => {
  const { token, user } = useAuth();
  const [orders, setOrders] = useState<InternalOrder[]>([]);

  useEffect(() => {
    if (!user?.tenantId) return;
    internalOrdersApi
      .list()
      .catch(() => [])
      .then((d) => setOrders(Array.isArray(d) ? d : []))
      .catch(() => setOrders([]));
  }, [token, user?.tenantId]);

  const options = [
    { label: '— Sin proyecto —', value: '' },
    ...orders
      .filter((o) => o.status !== 'closed')
      .map((o) => ({ label: `${o.code} — ${o.name}`, value: o.id })),
  ];

  return (
    <div className="space-y-2">
      <label className="text-xs font-black text-fg-subtle uppercase tracking-widest">{label}</label>
      <SearchableSelect
        value={value || ''}
        onChange={(v) => onChange(v || null)}
        options={options}
        placeholder="Sin proyecto"
      />
    </div>
  );
};

export default InternalOrderHeaderField;
