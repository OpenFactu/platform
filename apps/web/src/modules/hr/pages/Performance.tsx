import { hrReportsApi, employeesApi, departmentsApi } from '../api';
import type { ProductivityRow as Row } from '../api/hrReportsApi';
import type { Employee } from '../domain/employee';
import type { Department } from '../domain/department';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, KpiCard, useToast, DatePicker, SearchableSelect } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { TrendingUp, Download } from 'lucide-react';
import { exportToXlsx } from '@/utils/exportXlsx';

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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  const fetchAll = async () => {
    setLoading(true);
    const [r, e, d] = await Promise.all([
      hrReportsApi.productivity({
        from: filters.from,
        to: filters.to,
        employeeId: filters.employeeId || undefined,
        departmentId: filters.departmentId || undefined,
      }),
      employeesApi.list(),
      departmentsApi.list(),
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

  // Opciones de los desplegables de maestros (vienen del servidor).
  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: d.id, label: d.name, secondaryLabel: d.code })),
    [departments],
  );
  const employeeOptions = useMemo(
    () =>
      employees.map((e) => ({
        value: e.id,
        label: `${e.firstName} ${e.lastName}`,
        secondaryLabel: e.code,
      })),
    [employees],
  );

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

  const exportExcel = () =>
    exportToXlsx({
      filename: `rendimiento_${filters.from}_${filters.to}`,
      sheetName: 'Rendimiento',
      title: `Rendimiento · ${filters.from} a ${filters.to}`,
      columns: [
        { key: 'code', label: 'Código', width: 10 },
        { key: 'name', label: 'Nombre', width: 28 },
        { key: 'hoursContracted', label: 'h. Contratadas', type: 'number' },
        { key: 'hoursPlanned', label: 'h. Planificadas', type: 'number' },
        { key: 'hoursClocked', label: 'h. Fichadas', type: 'number' },
        { key: 'hoursOvertime', label: 'h. Extra', type: 'number' },
        { key: 'compliancePct', label: '% Cumplimiento', type: 'percent' },
        { key: 'absenceDays', label: 'Días absentismo', type: 'integer' },
      ],
      rows,
      totals: {
        code: 'TOTAL',
        hoursContracted: totals.contracted,
        hoursPlanned: totals.planned,
        hoursClocked: totals.clocked,
        hoursOvertime: totals.overtime,
        compliancePct: avgCompliance,
        absenceDays: totals.absence,
      },
    });

  return (
    <div className="p-4 w-full space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <TrendingUp className="text-success" size={32} /> Rendimiento
          </h1>
          <p className="text-fg-muted text-sm">
            Productividad por empleado: contratadas vs planificadas vs fichadas, % cumplimiento,
            horas extra, mapa de incidencias.
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
          <div>
            {/* SearchableSelect no tiene prop `label` → se conserva el <label>
                suelto. El vacío es válido («Todos») → clearable. */}
            <label className="block text-xs font-bold uppercase tracking-wider text-fg-muted mb-1.5">
              Departamento
            </label>
            <SearchableSelect
              options={departmentOptions}
              value={filters.departmentId}
              onChange={(v) => setFilters({ ...filters, departmentId: v })}
              placeholder="Todos"
              clearable
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-fg-muted mb-1.5">
              Empleado
            </label>
            <SearchableSelect
              options={employeeOptions}
              value={filters.employeeId}
              onChange={(v) => setFilters({ ...filters, employeeId: v })}
              placeholder="Todos"
              clearable
            />
          </div>
        </div>
      </Card>

      {/* KpiCard del paquete en lugar del `Kpi` local que lo duplicaba. Los
          tonos pasan de la paleta fija de Tailwind a los semanticos, que si
          siguen al tema: info para lo planificado, success para lo fichado,
          warning para las extras y danger para el absentismo. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Contratadas" value={`${totals.contracted.toFixed(1)} h`} />
        <KpiCard
          label="Planificadas"
          value={`${totals.planned.toFixed(1)} h`}
          className="border-info"
        />
        <KpiCard
          label="Fichadas"
          value={`${totals.clocked.toFixed(1)} h`}
          className="border-success"
        />
        <KpiCard
          label="Extras"
          value={`${totals.overtime.toFixed(1)} h`}
          className="border-warning"
        />
        <KpiCard label="Absentismo" value={`${totals.absence} días`} className="border-danger" />
      </div>

      <Card noPadding>
        <div className="p-3 text-xs text-fg-muted border-b">
          % cumplimiento medio:{' '}
          <span className="font-black text-fg-default tabular-nums">
            {avgCompliance.toFixed(1)}%
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-fg-muted border-b">
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
                <td colSpan={8} className="p-6 text-center text-fg-subtle">
                  Calculando…
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.employeeId} className="border-b">
                <td className="p-3">
                  <div className="font-bold">{r.name}</div>
                  <div className="text-[10px] text-fg-subtle">{r.code}</div>
                </td>
                <td className="p-3 text-right tabular-nums">{r.hoursContracted.toFixed(1)}</td>
                <td className="p-3 text-right tabular-nums">{r.hoursPlanned.toFixed(1)}</td>
                <td className="p-3 text-right tabular-nums font-bold">
                  {r.hoursClocked.toFixed(1)}
                </td>
                <td className="p-3 text-right tabular-nums text-warning-fg">
                  {r.hoursOvertime.toFixed(1)}
                </td>
                <td className="p-3 text-right tabular-nums">
                  <span
                    className={
                      r.compliancePct >= 95
                        ? 'text-success-fg font-bold'
                        : r.compliancePct >= 80
                          ? 'text-warning-fg font-bold'
                          : 'text-danger-fg font-bold'
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
                      className="inline-block px-2 py-0.5 mr-1 rounded bg-bg-muted text-[10px] font-bold"
                    >
                      {k}: {v}
                    </span>
                  ))}
                  {Object.keys(r.incidentsByType).length === 0 && (
                    <span className="text-fg-subtle italic">sin incidencias</span>
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

export default Performance;
