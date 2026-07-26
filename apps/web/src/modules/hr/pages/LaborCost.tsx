import { hrReportsApi } from '../api';
import type { LaborCostRow as Row } from '../api/hrReportsApi';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, DatePicker, Select } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { PiggyBank, Download } from 'lucide-react';
import { exportToXlsx } from '@/utils/exportXlsx';

// Dimensiones de agrupación, en un solo sitio: las `options` del desplegable se
// derivan de aquí.
const GROUP_BY_OPTIONS = [
  { value: 'employee', label: 'Empleado' },
  { value: 'department', label: 'Departamento' },
  { value: 'costCenter', label: 'Centro de coste' },
  { value: 'project', label: 'Proyecto' },
];

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
    const d = await hrReportsApi.laborCost({
      from: filters.from,
      to: filters.to,
      groupBy: filters.groupBy,
    });
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
          {/* El rango se guarda como '' cuando se vacía, igual que hacía el
              <input type="date">. */}
          <DatePicker
            label="Desde"
            value={filters.from || null}
            onChange={(v) => setFilters({ ...filters, from: v ?? '' })}
          />
          <DatePicker
            label="Hasta"
            value={filters.to || null}
            onChange={(v) => setFilters({ ...filters, to: v ?? '' })}
          />
          <Select
            label="Agrupar por"
            options={GROUP_BY_OPTIONS}
            value={filters.groupBy}
            onChange={(v) => setFilters({ ...filters, groupBy: v as typeof filters.groupBy })}
          />
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
