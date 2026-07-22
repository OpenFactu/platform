import React, { useEffect, useMemo, useState } from 'react';
import { ReportPage } from '@/components/reports/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportProfitCostCenter: React.FC = () => {
  const { user } = useAuth();
  const fmt = useFormat();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    reportsApi.get<any>('/api/reports/profit-cost-center')
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.tenantId]);

  const columns = useMemo(
    () => [
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Centro' },
      { key: 'income', label: 'Ingresos', format: (v: any) => fmt.money(v) },
      { key: 'expense', label: 'Gastos', format: (v: any) => fmt.money(v) },
      { key: 'margin', label: 'Margen', format: (v: any) => fmt.money(v) },
    ],
    [fmt],
  );

  return (
    <ReportPage
      title="Rentabilidad por centro de coste"
      subtitle="Ingresos vs gastos imputados a cada unidad de responsabilidad."
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename="rent-centro-coste"
    />
  );
};

export default ReportProfitCostCenter;
