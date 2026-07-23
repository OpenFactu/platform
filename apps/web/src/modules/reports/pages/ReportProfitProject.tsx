import React, { useEffect, useMemo, useState } from 'react';
import { ReportPage } from '../components/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportProfitProject: React.FC = () => {
  const { user } = useAuth();
  const fmt = useFormat();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    reportsApi.get<any>('/api/reports/profit-project')
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.tenantId]);

  const columns = useMemo(
    () => [
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Proyecto' },
      { key: 'budget', label: 'Presupuesto', format: (v: any) => fmt.money(v) },
      { key: 'income', label: 'Ingresos', format: (v: any) => fmt.money(v) },
      { key: 'expense', label: 'Gastos', format: (v: any) => fmt.money(v) },
      { key: 'margin', label: 'Margen', format: (v: any) => fmt.money(v) },
      {
        key: 'deviation',
        label: 'Desv. %',
        format: (v: any) => (Number(v) === 0 ? '—' : `${Number(v).toFixed(1)} %`),
      },
    ],
    [fmt],
  );

  return (
    <ReportPage
      title="Rentabilidad por proyecto"
      subtitle="Ingresos, gastos y desviación sobre presupuesto por orden interna."
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename="rent-proyecto"
    />
  );
};

export default ReportProfitProject;
