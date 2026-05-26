import React, { useEffect, useMemo, useState } from 'react';
import { ReportPage } from '../../components/reports/ReportPage';
import { useAuth } from '../../context/AuthContext';
import { useFormat } from '../../hooks/useFormat';

export const ReportStockMovements: React.FC = () => {
  const { token, user } = useAuth();
  const fmt = useFormat();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' };

  const load = () => {
    const qs = new URLSearchParams();
    if (from) qs.append('from', from);
    if (to) qs.append('to', to);
    setLoading(true);
    fetch(`/api/reports/stock-movements?${qs}`, { headers })
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.tenantId]);

  const columns = useMemo(
    () => [
      { key: 'date', label: 'Fecha', format: (v: any) => fmt.date(v) },
      { key: 'type', label: 'Tipo' },
      { key: 'itemCode', label: 'Código' },
      { key: 'itemName', label: 'Artículo' },
      { key: 'qty', label: 'Cantidad', format: (v: any) => String(v) },
      { key: 'partnerName', label: 'Partner' },
    ],
    [fmt],
  );

  return (
    <ReportPage
      title="Movimientos de stock"
      subtitle="Entradas (compra) y salidas (venta) por albarán."
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename="movimientos-stock"
      filters={
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Desde
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
        </div>
      }
    />
  );
};

export default ReportStockMovements;
