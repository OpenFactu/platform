import React, { useEffect, useMemo, useState } from 'react';
import { ReportPage } from '../../components/reports/ReportPage';
import { useAuth } from '../../context/AuthContext';
import { useFormat } from '../../hooks/useFormat';

export const ReportProfitItem: React.FC = () => {
  const { token, user } = useAuth();
  const fmt = useFormat();
  const [periods, setPeriods] = useState<any[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' };

  useEffect(() => {
    fetch('/api/periods', { headers })
      .then((r) => r.json())
      .then((d) => {
        setPeriods(Array.isArray(d) ? d : []);
        const open = d.find?.((p: any) => p.status === 'O');
        setPeriodId(open?.id || d[0]?.id || '');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const load = () => {
    setLoading(true);
    fetch(`/api/reports/profit-item${periodId ? `?periodId=${periodId}` : ''}`, { headers })
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (periodId) load(); /* eslint-disable-next-line */
  }, [periodId]);

  const columns = useMemo(
    () => [
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Artículo' },
      { key: 'qty', label: 'Ud vendidas', format: (v: any) => String(v) },
      { key: 'revenue', label: 'Facturación', format: (v: any) => fmt.money(v) },
    ],
    [fmt],
  );

  return (
    <ReportPage
      title="Rentabilidad por producto"
      subtitle="Top artículos por facturación."
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename={`rent-producto-${periodId}`}
      pdfEndpoint="/api/reports/profit-item/pdf"
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

export default ReportProfitItem;
