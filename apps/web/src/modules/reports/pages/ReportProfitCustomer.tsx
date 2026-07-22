import React, { useEffect, useMemo, useState } from 'react';
import { ReportPage } from '@/components/reports/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportProfitCustomer: React.FC = () => {
  const { user } = useAuth();
  const fmt = useFormat();
  const [periods, setPeriods] = useState<any[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    reportsApi.get<any>('/api/periods')
      .then((d) => {
        setPeriods(Array.isArray(d) ? d : []);
        const open = d.find?.((p: any) => p.status === 'O');
        setPeriodId(open?.id || d[0]?.id || '');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const load = () => {
    setLoading(true);
    reportsApi.get<any>(`/api/reports/profit-customer${periodId ? `?periodId=${periodId}` : ''}`)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (periodId) load(); /* eslint-disable-next-line */
  }, [periodId]);

  const columns = useMemo(
    () => [
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Cliente' },
      { key: 'count', label: 'Facturas', format: (v: any) => String(v) },
      { key: 'total', label: 'Facturación', format: (v: any) => fmt.money(v) },
    ],
    [fmt],
  );

  return (
    <ReportPage
      title="Rentabilidad por cliente"
      subtitle="Ranking de clientes por facturación del período."
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename={`rent-cliente-${periodId}`}
      pdfEndpoint="/api/reports/profit-customer/pdf"
      pdfQuery={{ periodId }}
      filters={
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Período</label>
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>
      }
    />
  );
};

export default ReportProfitCustomer;
