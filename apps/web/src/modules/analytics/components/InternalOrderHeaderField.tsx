import { internalOrdersApi, type InternalOrder } from '@/modules/analytics/api';
import React, { useEffect, useState } from 'react';
import { Field, SearchableSelect } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';

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
  label,
  inheritsHint = true,
}) => {
  const { token, user } = useAuth();
  const { t } = useI18n();
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
    { label: t('analytics.headerField.noProjectOption'), value: '' },
    ...orders
      .filter((o) => o.status !== 'closed')
      .map((o) => ({ label: `${o.code} — ${o.name}`, value: o.id })),
  ];

  return (
    <Field label={label ?? t('analytics.headerField.label')}>
      <SearchableSelect
        value={value || ''}
        onChange={(v) => onChange(v || null)}
        options={options}
        placeholder={t('analytics.headerField.noProject')}
      />
    </Field>
  );
};

export default InternalOrderHeaderField;
