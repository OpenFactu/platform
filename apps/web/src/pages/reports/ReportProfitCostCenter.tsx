import React, { useEffect, useMemo, useState } from 'react';
import { ReportPage } from '../../components/reports/ReportPage';
import { useAuth } from '../../context/AuthContext';
import { useFormat } from '../../hooks/useFormat';

export const ReportProfitCostCenter: React.FC = () => {
  const { token, user } = useAuth();
  const fmt = useFormat();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' };

  const load = () => {
    setLoading(true);
    fetch('/api/reports/profit-cost-center', { headers })
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
