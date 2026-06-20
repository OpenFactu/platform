import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, useToast } from '@openfactu/ui';
import { useAuth } from '../../context/AuthContext';
import { TrendingUp, Download } from 'lucide-react';

interface Row {
  employeeId: string;
  code: string;
  name: string;
  departmentId: string | null;
  hoursContracted: number;
  hoursPlanned: number;
  hoursClocked: number;
  hoursOvertime: number;
  compliancePct: number;
  incidentsByType: Record<string, number>;
  absenceDays: number;
}

export const Performance: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  const [filters, setFilters] = useState({
    from: monthStart,
    to: monthEnd,
    employeeId: '',
    departmentId: '',
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  const fetchAll = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('from', filters.from);
    params.set('to', filters.to);
    if (filters.employeeId) params.set('employeeId', filters.employeeId);
    if (filters.departmentId) params.set('departmentId', filters.departmentId);
    const [r, e, d] = await Promise.all([
      fetch(`/api/reports/hr/productivity?${params}`, { headers }).then((r) => r.json()),
      fetch('/api/hr/employees', { headers }).then((r) => r.json()),
      fetch('/api/hr/departments', { headers }).then((r) => r.json()),
    ]);
    setRows(Array.isArray(r) ? r : []);
    setEmployees(Array.isArray(e) ? e : []);
    setDepartments(Array.isArray(d) ? d : []);
    setLoading(false);
  };
  useEffect(() => {
    if (user?.tenantId) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, filters.from, filters.to, filters.employeeId, filters.departmentId]);

  const totals = rows.reduce(
    (s, r) => ({
      contracted: s.contracted + r.hoursContracted,
      planned: s.planned + r.hoursPlanned,
      clocked: s.clocked + r.hoursClocked,
      overtime: s.overtime + r.hoursOvertime,
      absence: s.absence + r.absenceDays,
    }),
    { contracted: 0, planned: 0, clocked: 0, overtime: 0, absence: 0 },
  );
  const avgCompliance =
    rows.length > 0 ? rows.reduce((s, r) => s + r.compliancePct, 0) / rows.length : 0;

  const exportCsv = () => {
    const header = [
      'Código',
      'Nombre',
      'h.Contratadas',
      'h.Planificadas',
      'h.Fichadas',
      'h.Extra',
      '% Cumplimiento',
      'Días absentismo',
    ].join(';');
    const lines = rows.map((r) =>
      [
        r.code,
        r.name,
        r.hoursContracted,
        r.hoursPlanned,
        r.hoursClocked,
        r.hoursOvertime,
        r.compliancePct,
        r.absenceDays,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(';'),
    );
    const csv = '﻿' + header + '\n' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rendimiento_${filters.from}_${filters.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 w-full space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <TrendingUp className="text-emerald-600" size={32} /> Rendimiento
          </h1>
          <p className="text-slate-500 text-sm">
            Productividad por empleado: contratadas vs planificadas vs fichadas, % cumplimiento,
            horas extra, mapa de incidencias.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={exportCsv}>
          <Download size={14} /> Exportar CSV
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
              Departamento
            </label>
            <select
              value={filters.departmentId}
              onChange={(e) => setFilters({ ...filters, departmentId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            >
              <option value="">Todos</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Empleado
            </label>
            <select
              value={filters.employeeId}
              onChange={(e) => setFilters({ ...filters, employeeId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            >
              <option value="">Todos</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.code} — {e.firstName} {e.lastName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Contratadas" value={`${totals.contracted.toFixed(1)} h`} tone="slate" />
        <Kpi label="Planificadas" value={`${totals.planned.toFixed(1)} h`} tone="indigo" />
        <Kpi label="Fichadas" value={`${totals.clocked.toFixed(1)} h`} tone="emerald" />
        <Kpi label="Extras" value={`${totals.overtime.toFixed(1)} h`} tone="amber" />
        <Kpi label="Absentismo" value={`${totals.absence} días`} tone="rose" />
      </div>

      <Card noPadding>
        <div className="p-3 text-xs text-slate-500 border-b">
          % cumplimiento medio:{' '}
          <span className="font-black text-slate-800 dark:text-slate-100 tabular-nums">
            {avgCompliance.toFixed(1)}%
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b">
              <th className="p-3">Empleado</th>
              <th className="p-3 text-right">Contratadas</th>
              <th className="p-3 text-right">Planificadas</th>
              <th className="p-3 text-right">Fichadas</th>
              <th className="p-3 text-right">Extras</th>
              <th className="p-3 text-right">% Cumplim.</th>
              <th className="p-3 text-right">Absentismo</th>
              <th className="p-3">Incidencias</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-400">
                  Calculando…
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.employeeId} className="border-b">
                <td className="p-3">
                  <div className="font-bold">{r.name}</div>
                  <div className="text-[10px] text-slate-400">{r.code}</div>
                </td>
                <td className="p-3 text-right tabular-nums">{r.hoursContracted.toFixed(1)}</td>
                <td className="p-3 text-right tabular-nums">{r.hoursPlanned.toFixed(1)}</td>
                <td className="p-3 text-right tabular-nums font-bold">
                  {r.hoursClocked.toFixed(1)}
                </td>
                <td className="p-3 text-right tabular-nums text-amber-600">
                  {r.hoursOvertime.toFixed(1)}
                </td>
                <td className="p-3 text-right tabular-nums">
                  <span
                    className={
                      r.compliancePct >= 95
                        ? 'text-emerald-600 font-bold'
                        : r.compliancePct >= 80
                          ? 'text-amber-600 font-bold'
                          : 'text-rose-600 font-bold'
                    }
                  >
                    {r.compliancePct.toFixed(1)}%
                  </span>
                </td>
                <td className="p-3 text-right tabular-nums">{r.absenceDays}</td>
                <td className="p-3 text-xs">
                  {Object.entries(r.incidentsByType).map(([k, v]) => (
                    <span
                      key={k}
                      className="inline-block px-2 py-0.5 mr-1 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold"
                    >
                      {k}: {v}
                    </span>
                  ))}
                  {Object.keys(r.incidentsByType).length === 0 && (
                    <span className="text-slate-400 italic">sin incidencias</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: string; tone: string }> = ({ label, value, tone }) => {
  const map: Record<string, string> = {
    slate: 'border-slate-200 text-slate-700 dark:text-slate-200',
    indigo: 'border-indigo-300 text-indigo-700 dark:text-indigo-300',
    emerald: 'border-emerald-300 text-emerald-700 dark:text-emerald-300',
    amber: 'border-amber-300 text-amber-700 dark:text-amber-300',
    rose: 'border-rose-300 text-rose-700 dark:text-rose-300',
  };
  return (
    <div className={`rounded-xl border-2 bg-white dark:bg-slate-900 p-4 ${map[tone]}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xl font-black tabular-nums mt-1">{value}</div>
    </div>
  );
};

export default Performance;
