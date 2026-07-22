import { hrApi } from '../api';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { PiggyBank, Download } from 'lucide-react';
import { exportToXlsx } from '@/utils/exportXlsx';

interface Row {
  key: string;
  label: string;
  gross: number;
  ssEr: number;
  total: number;
  count: number;
}

export const LaborCost: React.FC = () => {
  const { token, user } = useAuth();
  const today = new Date();
  const [filters, setFilters] = useState({
    from: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
    to: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10),
    groupBy: 'employee' as 'employee' | 'department' | 'project' | 'costCenter',
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState({ gross: 0, ssEr: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  const fetchAll = async () => {
    setLoading(true);
    const params = new URLSearchParams({
      from: filters.from,
      to: filters.to,
      groupBy: filters.groupBy,
    });
    const r = await hrApi.raw('GET', `/api/reports/hr/labor-cost?${params}`);
    const d = r.data;
    setRows(d.rows || []);
    setTotals(d.totals || { gross: 0, ssEr: 0, total: 0 });
    setLoading(false);
  };
  useEffect(() => {
    if (user?.tenantId) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, filters.from, filters.to, filters.groupBy]);

  const exportExcel = () =>
    exportToXlsx({
      filename: `coste_laboral_${filters.from}_${filters.to}`,
      sheetName: 'Coste laboral',
      title: `Coste laboral · ${filters.from} a ${filters.to}`,
      columns: [
        { key: 'label', label: 'Grupo', width: 32 },
        { key: 'gross', label: 'Bruto', type: 'currency' },
        { key: 'ssEr', label: 'SS Empresa', type: 'currency' },
        { key: 'total', label: 'Total', type: 'currency' },
        { key: 'count', label: 'Nº nóminas', type: 'integer' },
      ],
      rows,
      totals: {
        label: 'TOTAL',
        gross: totals.gross,
        ssEr: totals.ssEr,
        total: totals.total,
        count: rows.reduce((s, r) => s + r.count, 0),
      },
    });

  const fmt = (n: number) =>
    n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="p-4 w-full space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <PiggyBank className="text-indigo-600" size={32} /> Coste laboral
          </h1>
          <p className="text-slate-500 text-sm">
            Bruto + SS empresa, agrupado por dimensión. Datos provenientes de las nóminas aprobadas
            y sus líneas en el rango.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={exportExcel}>
          <Download size={14} /> Exportar Excel
        </Button>
      </div>

      <Card noPadding>
        <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Desde
            </label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Hasta
            </label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Agrupar por
            </label>
            <select
              value={filters.groupBy}
              onChange={(e) => setFilters({ ...filters, groupBy: e.target.value as any })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            >
              <option value="employee">Empleado</option>
              <option value="department">Departamento</option>
              <option value="costCenter">Centro de coste</option>
              <option value="project">Proyecto</option>
            </select>
          </div>
          <div className="text-xs text-slate-500">
            <span className="font-bold text-slate-700 dark:text-slate-300">{rows.length}</span>{' '}
            grupos
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border-2 border-emerald-300 bg-white dark:bg-slate-900 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">
            Bruto pagado
          </div>
          <div className="text-2xl font-black tabular-nums mt-1">{fmt(totals.gross)} €</div>
        </div>
        <div className="rounded-xl border-2 border-indigo-300 bg-white dark:bg-slate-900 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">
            SS a cargo empresa
          </div>
          <div className="text-2xl font-black tabular-nums mt-1">{fmt(totals.ssEr)} €</div>
        </div>
        <div className="rounded-xl border-2 border-rose-300 bg-white dark:bg-slate-900 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">
            Coste total
          </div>
          <div className="text-2xl font-black tabular-nums mt-1 text-rose-600">
            {fmt(totals.total)} €
          </div>
        </div>
      </div>

      <Card noPadding>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b">
              <th className="p-3">Grupo</th>
              <th className="p-3 text-right">Bruto</th>
              <th className="p-3 text-right">SS Empresa</th>
              <th className="p-3 text-right">Coste total</th>
              <th className="p-3 text-right">Nº nóminas</th>
              <th className="p-3 text-right">% del total</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-400">
                  Calculando…
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.key} className="border-b">
                <td className="p-3 font-bold">{r.label}</td>
                <td className="p-3 text-right tabular-nums">{fmt(r.gross)} €</td>
                <td className="p-3 text-right tabular-nums">{fmt(r.ssEr)} €</td>
                <td className="p-3 text-right tabular-nums font-bold">{fmt(r.total)} €</td>
                <td className="p-3 text-right tabular-nums">{r.count}</td>
                <td className="p-3 text-right tabular-nums">
                  {totals.total > 0 ? ((r.total / totals.total) * 100).toFixed(1) : '0.0'}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default LaborCost;
