import { hrReportsApi, employeesApi, departmentsApi } from '../api';
import type { ProductivityRow as Row } from '../api/hrReportsApi';
import type { Employee } from '../domain/employee';
import type { Department } from '../domain/department';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Button,
  KpiCard,
  PageHeader,
  useToast,
  DatePicker,
  SearchableSelect,
  Table,
} from '@openfactu/ui';
import type { TableColumn } from '@openfactu/ui';
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

  const hours = (n: number) => <span className="tabular-nums">{n.toFixed(1)}</span>;

  const columns: TableColumn<Row>[] = [
    {
      header: 'Empleado',
      sortable: true,
      sortAccessor: (r) => r.name,
      cell: (r) => (
        <div>
          <div className="font-bold">{r.name}</div>
          <div className="text-[10px] text-fg-subtle">{r.code}</div>
        </div>
      ),
    },
    {
      header: 'Contratadas',
      align: 'right',
      sortable: true,
      sortAccessor: (r) => r.hoursContracted,
      cell: (r) => hours(r.hoursContracted),
    },
    {
      header: 'Planificadas',
      align: 'right',
      sortable: true,
      sortAccessor: (r) => r.hoursPlanned,
      cell: (r) => hours(r.hoursPlanned),
    },
    {
      header: 'Fichadas',
      align: 'right',
      sortable: true,
      sortAccessor: (r) => r.hoursClocked,
      cell: (r) => <span className="tabular-nums font-bold">{r.hoursClocked.toFixed(1)}</span>,
    },
    {
      header: 'Extras',
      align: 'right',
      sortable: true,
      sortAccessor: (r) => r.hoursOvertime,
      cell: (r) => (
        <span className="tabular-nums text-warning-fg">{r.hoursOvertime.toFixed(1)}</span>
      ),
    },
    {
      header: '% Cumplim.',
      align: 'right',
      sortable: true,
      sortAccessor: (r) => r.compliancePct,
      cell: (r) => (
        <span
          className={
            r.compliancePct >= 95
              ? 'tabular-nums text-success-fg font-bold'
              : r.compliancePct >= 80
                ? 'tabular-nums text-warning-fg font-bold'
                : 'tabular-nums text-danger-fg font-bold'
          }
        >
          {r.compliancePct.toFixed(1)}%
        </span>
      ),
    },
    {
      header: 'Absentismo',
      align: 'right',
      sortable: true,
      sortAccessor: (r) => r.absenceDays,
      cell: (r) => <span className="tabular-nums">{r.absenceDays}</span>,
    },
    {
      header: 'Incidencias',
      cell: (r) => (
        <div className="text-xs">
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
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 w-full space-y-5">
      <PageHeader
        title="Rendimiento"
        subtitle="Productividad por empleado: contratadas vs planificadas vs fichadas, % cumplimiento, horas extra, mapa de incidencias."
        icon={<TrendingUp size={18} />}
        size="lg"
        actions={
          <Button type="button" size="sm" variant="secondary" onClick={exportExcel}>
            <Download size={14} /> Exportar Excel
          </Button>
        }
      />

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

      <Card className="overflow-hidden" noPadding>
        <div className="p-3 text-xs text-fg-muted border-b border-border-default">
          % cumplimiento medio:{' '}
          <span className="font-black text-fg-default tabular-nums">
            {avgCompliance.toFixed(1)}%
          </span>
        </div>
        <Table
          columns={columns}
          data={rows}
          isLoading={loading}
          rowKey={(r) => r.employeeId}
          emptyMessage="No hay datos de productividad para los filtros actuales."
        />
      </Card>
    </div>
  );
};

export default Performance;
