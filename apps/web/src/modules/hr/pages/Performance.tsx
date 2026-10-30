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
import { useI18n } from '@/i18n/I18nContext';

export const Performance: React.FC = () => {
  const { t } = useI18n();
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
      sheetName: t('hrTalent.performance.title'),
      title: t('hrTalent.performance.exportTitle', { from: filters.from, to: filters.to }),
      columns: [
        { key: 'code', label: t('hr.common.code'), width: 10 },
        { key: 'name', label: t('hr.common.name'), width: 28 },
        { key: 'hoursContracted', label: t('hrTalent.performance.x.contracted'), type: 'number' },
        { key: 'hoursPlanned', label: t('hrTalent.performance.x.planned'), type: 'number' },
        { key: 'hoursClocked', label: t('hrTalent.performance.x.clocked'), type: 'number' },
        { key: 'hoursOvertime', label: t('hrTalent.performance.x.overtime'), type: 'number' },
        { key: 'compliancePct', label: t('hrTalent.performance.x.compliance'), type: 'percent' },
        { key: 'absenceDays', label: t('hrTalent.performance.x.absence'), type: 'integer' },
      ],
      rows,
      totals: {
        code: t('hr.common.total').toUpperCase(),
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
      header: t('hr.common.employee'),
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
      header: t('hrTalent.performance.contracted'),
      align: 'right',
      sortable: true,
      sortAccessor: (r) => r.hoursContracted,
      cell: (r) => hours(r.hoursContracted),
    },
    {
      header: t('hrTalent.performance.planned'),
      align: 'right',
      sortable: true,
      sortAccessor: (r) => r.hoursPlanned,
      cell: (r) => hours(r.hoursPlanned),
    },
    {
      header: t('hrTalent.performance.clocked'),
      align: 'right',
      sortable: true,
      sortAccessor: (r) => r.hoursClocked,
      cell: (r) => <span className="tabular-nums font-bold">{r.hoursClocked.toFixed(1)}</span>,
    },
    {
      header: t('hrTalent.performance.overtime'),
      align: 'right',
      sortable: true,
      sortAccessor: (r) => r.hoursOvertime,
      cell: (r) => (
        <span className="tabular-nums text-warning-fg">{r.hoursOvertime.toFixed(1)}</span>
      ),
    },
    {
      header: t('hrTalent.performance.complianceShort'),
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
      header: t('hrTalent.performance.absence'),
      align: 'right',
      sortable: true,
      sortAccessor: (r) => r.absenceDays,
      cell: (r) => <span className="tabular-nums">{r.absenceDays}</span>,
    },
    {
      header: t('hrTalent.performance.incidents'),
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
            <span className="text-fg-subtle italic">{t('hrTalent.performance.noIncidents')}</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 w-full space-y-5">
      <PageHeader
        title={t('hrTalent.performance.title')}
        subtitle={t('hrTalent.performance.subtitle')}
        icon={<TrendingUp size={18} />}
        size="lg"
        actions={
          <Button type="button" size="sm" variant="secondary" onClick={exportExcel}>
            <Download size={14} /> {t('hrTime.timeclock.exportExcel')}
          </Button>
        }
      />

      <Card noPadding>
        <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          {/* El rango se guarda como '' cuando se vacía, igual que hacía el
              <input type="date">. */}
          <DatePicker
            label={t('hr.common.from')}
            value={filters.from || null}
            onChange={(v) => setFilters({ ...filters, from: v ?? '' })}
          />
          <DatePicker
            label={t('hr.common.to')}
            value={filters.to || null}
            onChange={(v) => setFilters({ ...filters, to: v ?? '' })}
          />
          <div>
            {/* SearchableSelect no tiene prop `label` → se conserva el <label>
                suelto. El vacío es válido («Todos») → clearable. */}
            <label className="block text-xs font-bold uppercase tracking-wider text-fg-muted mb-1.5">
              {t('hr.common.department')}
            </label>
            <SearchableSelect
              options={departmentOptions}
              value={filters.departmentId}
              onChange={(v) => setFilters({ ...filters, departmentId: v })}
              placeholder={t('hr.common.all')}
              clearable
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-fg-muted mb-1.5">
              {t('hr.common.employee')}
            </label>
            <SearchableSelect
              options={employeeOptions}
              value={filters.employeeId}
              onChange={(v) => setFilters({ ...filters, employeeId: v })}
              placeholder={t('hr.common.all')}
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
        <KpiCard
          label={t('hrTalent.performance.contracted')}
          value={`${totals.contracted.toFixed(1)} h`}
        />
        <KpiCard
          label={t('hrTalent.performance.planned')}
          value={`${totals.planned.toFixed(1)} h`}
          className="border-info"
        />
        <KpiCard
          label={t('hrTalent.performance.clocked')}
          value={`${totals.clocked.toFixed(1)} h`}
          className="border-success"
        />
        <KpiCard
          label={t('hrTalent.performance.overtime')}
          value={`${totals.overtime.toFixed(1)} h`}
          className="border-warning"
        />
        <KpiCard
          label={t('hrTalent.performance.absence')}
          value={t('hrTalent.performance.days', { count: totals.absence })}
          className="border-danger"
        />
      </div>

      <Card className="overflow-hidden" noPadding>
        <div className="p-3 text-xs text-fg-muted border-b border-border-default">
          {t('hrTalent.performance.avgCompliance')}{' '}
          <span className="font-black text-fg-default tabular-nums">
            {avgCompliance.toFixed(1)}%
          </span>
        </div>
        <Table
          className="max-md:p-3"
          columns={columns}
          data={rows}
          isLoading={loading}
          rowKey={(r) => r.employeeId}
          emptyMessage={t('hrTalent.performance.empty')}
        />
      </Card>
    </div>
  );
};

export default Performance;
