import React, { useEffect, useMemo, useState } from 'react';
import { ReportPage } from '../../components/reports/ReportPage';
import { useAuth } from '../../context/AuthContext';
import { useFormat } from '../../hooks/useFormat';

export const ReportStockRotation: React.FC = () => {
  const { token, user } = useAuth();
  const fmt = useFormat();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' };

  const load = () => {
    setLoading(true);
    fetch('/api/reports/stock-rotation', { headers })
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.tenantId]);

  const columns = useMemo(
    () => [
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Artículo' },
      { key: 'stock', label: 'Stock', format: (v: any) => String(v) },
      { key: 'sold', label: 'Vendido (período)', format: (v: any) => String(v) },
      {
        key: 'daysOfStock',
        label: 'Días de stock',
        format: (v: any) => (v == null ? 'Sin ventas' : String(v)),
      },
    ],
    [fmt],
  );

  return (
    <ReportPage
      title="Rotación de stock"
      subtitle="Días que durará el stock al ritmo de ventas actual."
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename="rotacion-stock"
    />
  );
};

export default ReportStockRotation;
