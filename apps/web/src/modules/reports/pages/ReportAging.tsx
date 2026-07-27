import React, { useEffect, useMemo, useState } from 'react';
import { ReportPage } from '../components/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

interface Props {
  kind: 'receivables' | 'payables';
}

export const ReportAging: React.FC<Props> = ({ kind }) => {
  const { user } = useAuth();
  const fmt = useFormat();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const endpoint =
    kind === 'receivables' ? '/api/reports/aging-receivables' : '/api/reports/aging-payables';

  const load = () => {
    setLoading(true);
    reportsApi
      .get<any>(endpoint)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.tenantId]);

  const columns = useMemo(
    () => [
      { key: 'code', label: 'Factura' },
      { key: 'partnerName', label: kind === 'receivables' ? 'Cliente' : 'Proveedor' },
      { key: 'date', label: 'Fecha', format: (v: any) => fmt.date(v) },
      { key: 'dueDate', label: 'Vencimiento', format: (v: any) => (v ? fmt.date(v) : '—') },
      { key: 'days', label: 'Días vencido', format: (v: any) => (Number(v) > 0 ? String(v) : '—') },
      { key: 'bucket', label: 'Tramo' },
      { key: 'pending', label: 'Pendiente', format: (v: any) => fmt.money(v) },
    ],
    [fmt, kind],
  );

  const title = kind === 'receivables' ? 'Aging de cobros' : 'Aging de pagos';
  const subtitle =
    kind === 'receivables'
      ? 'Facturas de venta pendientes de cobro por tramo de vencimiento.'
      : 'Facturas de compra pendientes de pago por tramo.';

  return (
    <ReportPage
      title={title}
      subtitle={subtitle}
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename={`aging-${kind}`}
    />
  );
};

export default ReportAging;
