import React, { useEffect, useMemo, useState } from 'react';
import { ReportPage } from '@/components/reports/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportStockValuation: React.FC = () => {
  const { user } = useAuth();
  const fmt = useFormat();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    reportsApi.get<any>('/api/reports/stock-valuation')
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.tenantId]);

  const totalValue = rows.reduce((s, r) => s + Number(r.value || 0), 0);

  const columns = useMemo(
    () => [
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Artículo' },
      { key: 'stock', label: 'Stock', format: (v: any) => String(v) },
      { key: 'unitPrice', label: 'Precio ud', format: (v: any) => fmt.money(v) },
      { key: 'value', label: 'Valor', format: (v: any) => fmt.money(v) },
    ],
    [fmt],
  );

  return (
    <ReportPage
      title="Valoración de inventario"
      subtitle={`Stock × precio medio. Valor total: ${fmt.money(totalValue)}`}
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename="valoracion-inventario"
    />
  );
};

export default ReportStockValuation;
