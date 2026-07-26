import React, { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from '@openfactu/ui';
import { ReportPage } from '../components/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportTrialBalance: React.FC = () => {
  const { user } = useAuth();
  const fmt = useFormat();
  const [periods, setPeriods] = useState<any[]>([]);
  const [periodId, setPeriodId] = useState<string>('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    reportsApi.get<any>('/api/periods').then((d) => {
      if (Array.isArray(d)) {
        setPeriods(d);
        const open = d.find((p) => p.status === 'O');
        setPeriodId(open?.id || d[0]?.id || '');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const load = () => {
    if (!periodId) return;
    setLoading(true);
    reportsApi
      .get<any>(`/api/reports/trial-balance?periodId=${periodId}`)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (periodId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId]);

  const columns = useMemo(
    () => [
      { key: 'code', label: 'Cuenta' },
      { key: 'name', label: 'Denominación' },
      { key: 'debit', label: 'Debe', format: (v: any) => fmt.money(v) },
      { key: 'credit', label: 'Haber', format: (v: any) => fmt.money(v) },
      { key: 'balance', label: 'Saldo', format: (v: any) => fmt.money(v) },
    ],
    [fmt],
  );

  return (
    <ReportPage
      title="Balance de sumas y saldos"
      subtitle="Totales debe/haber por cuenta del período."
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename={`sumas-saldos-${periodId}`}
      pdfEndpoint="/api/reports/trial-balance/pdf"
      pdfQuery={{ periodId }}
      filters={
        <div className="max-w-sm">
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
            Período
          </label>
          <SearchableSelect
            options={periods.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
            value={periodId}
            onChange={setPeriodId}
            placeholder="— seleccionar período —"
          />
        </div>
      }
    />
  );
};

export default ReportTrialBalance;
