import React, { useEffect, useMemo, useState } from 'react';
import { NumberInput } from '@openfactu/ui';
import { ReportPage } from '../components/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const ReportLaborCost: React.FC = () => {
  const { user } = useAuth();
  const fmt = useFormat();
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    reportsApi
      .get<any>(`/api/reports/labor-cost?year=${year}`)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [year, user?.tenantId]);

  const columns = useMemo(
    () => [
      { key: 'month', label: 'Mes', format: (v: any) => MONTHS[v - 1] || v },
      { key: 'gross', label: 'Bruto', format: (v: any) => fmt.money(v) },
      { key: 'ssEmployer', label: 'SS empresa', format: (v: any) => fmt.money(v) },
      { key: 'irpf', label: 'IRPF', format: (v: any) => fmt.money(v) },
      { key: 'netPay', label: 'Neto', format: (v: any) => fmt.money(v) },
      { key: 'totalCost', label: 'Coste total', format: (v: any) => fmt.money(v) },
    ],
    [fmt],
  );

  return (
    <ReportPage
      title="Costes laborales"
      subtitle={`Año ${year} — Bruto + SS empresa + IRPF por mes.`}
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename={`costes-laborales-${year}`}
      filters={
        <NumberInput
          label="Año"
          value={year}
          onChange={(v) => setYear(v ?? new Date().getFullYear())}
          min={2000}
          max={2100}
          commitOn="blur"
          thousandSeparator={false}
          containerClassName="w-32"
        />
      }
    />
  );
};

export default ReportLaborCost;
