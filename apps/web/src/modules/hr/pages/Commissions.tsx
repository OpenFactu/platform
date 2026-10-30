import { commissionsApi, employeesApi, departmentsApi, payrollConceptsApi } from '../api';
import type { CommissionRule as Rule, CommissionAccrual as Accrual } from '../domain/commission';
import type { Employee } from '../domain/employee';
import type { Department } from '../domain/department';
import type { PayrollConcept } from '../domain/payroll';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Badge,
  useToast,
  usePopup,
  Select,
  SearchableSelect,
  NumberInput,
  PercentInput,
  DatePicker,
  Tabs,
  Table,
  PageHeader,
} from '@openfactu/ui';
import type { BadgeProps, TableColumn, RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { Percent, Plus, Pencil, Trash2, RefreshCw, ArrowRightCircle } from 'lucide-react';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import { formatNumber } from '@/i18n/format';

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  pending: 'warning',
  paid: 'success',
  cancelled: 'neutral',
};
// Etiquetas como claves de i18n; se traducen al pintar.
const STATUS_LABELS: Record<string, string> = {
  pending: 'hrPayroll.commissions.status.pending',
  paid: 'hrPayroll.commissions.status.paid',
  cancelled: 'hrPayroll.commissions.status.cancelled',
};

// Configuración de los desplegables estáticos, en un solo sitio: las
// `options` se derivan de aquí en lugar de repetir los valores en el JSX.
const SCOPE_OPTIONS = [
  { value: 'employee', label: 'hrPayroll.commissions.scope.employee' },
  { value: 'department', label: 'hr.common.department' },
  { value: 'all', label: 'hrPayroll.commissions.scope.all' },
];
const BASIS_OPTIONS = [
  { value: 'net_amount', label: 'hrPayroll.commissions.basis.net' },
  { value: 'gross_amount', label: 'hrPayroll.commissions.basis.gross' },
  { value: 'margin', label: 'hrPayroll.commissions.basis.margin' },
];
const KIND_OPTIONS = [
  { value: 'flat_pct', label: 'hrPayroll.commissions.kind.flat' },
  { value: 'tiered', label: 'hrPayroll.commissions.kind.tiered' },
];
const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'hr.common.all' },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
];
const TABS = [
  { key: 'rules', label: 'hrPayroll.commissions.tabRules' },
  { key: 'accruals', label: 'hrPayroll.commissions.tabAccruals' },
];

/**
 * El formulario mantiene `pct` como number (lo que emite PercentInput); el
 * servidor lo recibe como string, así que se convierte al guardar y al abrir
 * una regla existente.
 *
 * Los campos se enumeran a mano en lugar de derivarlos con
 * `Omit<Partial<Rule>, 'pct'>`: `CommissionRule` tiene un índice
 * `[key: string]: unknown`, y `Omit` sobre un tipo con índice descarta todas
 * las propiedades con nombre, dejándolas en `unknown`.
 */
type RuleForm = {
  id?: string;
  name?: string;
  scope?: Rule['scope'];
  employeeId?: string | null;
  departmentId?: string | null;
  basis?: Rule['basis'];
  kind?: Rule['kind'];
  pct: number | null;
  payrollConceptId?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  isActive?: boolean;
};

const emptyRule = (): RuleForm => ({
  name: '',
  scope: 'employee',
  basis: 'net_amount',
  kind: 'flat_pct',
  pct: 5,
  isActive: true,
});

export const Commissions: React.FC = () => {
  const { t } = useI18n();
  const { token, user } = useAuth();
  const { canWrite, canDelete } = usePagePermissions();
  const toast = useToast();
  const popup = usePopup();
  const [tab, setTab] = useState<'rules' | 'accruals'>('rules');
  const [rules, setRules] = useState<Rule[]>([]);
  const [accruals, setAccruals] = useState<Accrual[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [concepts, setConcepts] = useState<PayrollConcept[]>([]);
  const [editing, setEditing] = useState<RuleForm | null>(null);
  const today = new Date();
  const [filter, setFilter] = useState({
    employeeId: '',
    status: '',
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  });

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  // Opciones de los desplegables de maestros: una vez por render.
  const employeeOptions = useMemo(
    () =>
      employees.map((e) => ({
        value: e.id,
        label: `${e.firstName} ${e.lastName}`,
        secondaryLabel: e.code,
      })),
    [employees],
  );
  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: d.id, label: d.name, secondaryLabel: d.code })),
    [departments],
  );
  const conceptOptions = useMemo(
    () =>
      concepts
        .filter((c) => c.kind === 'devengo')
        .map((c) => ({ value: c.id, label: c.name, secondaryLabel: c.code })),
    [concepts],
  );

  const fetchAll = async () => {
    const [r, e, d, c] = await Promise.all([
      commissionsApi.listRules(),
      employeesApi.list(),
      departmentsApi.list(),
      payrollConceptsApi.list(true),
    ]);
    setRules(Array.isArray(r) ? r : []);
    setEmployees(Array.isArray(e) ? e : []);
    setDepartments(Array.isArray(d) ? d : []);
    setConcepts(Array.isArray(c) ? c : []);
  };
  useEffect(() => {
    if (user?.tenantId) fetchAll();
  }, [user?.tenantId]);

  const fetchAccruals = async () => {
    const params: Record<string, string> = {
      year: String(filter.year),
      month: String(filter.month),
    };
    if (filter.employeeId) params.employeeId = filter.employeeId;
    if (filter.status) params.status = filter.status;
    const d = await commissionsApi.listAccruals(params);
    setAccruals(Array.isArray(d) ? d : []);
  };
  useEffect(() => {
    if (tab === 'accruals' && user?.tenantId) fetchAccruals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filter.employeeId, filter.status, filter.year, filter.month, user?.tenantId]);

  const saveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.name) {
      toast.error(t('hrPayroll.commissions.nameRequired'));
      return;
    }
    const isNew = !editing.id;
    // El servidor guarda el porcentaje como decimal en texto; el formulario lo
    // mantiene numérico porque es lo que emite PercentInput.
    const payload = { ...editing, pct: String(editing.pct ?? 0) };
    try {
      if (isNew) {
        await commissionsApi.createRule(payload);
      } else {
        await commissionsApi.updateRule(editing.id!, payload);
      }
      setEditing(null);
      fetchAll();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : t('hr.common.error'),
      );
    }
  };

  const removeRule = async (rule: Rule) => {
    const ok = await popup.confirm({
      title: t('hrPayroll.commissions.deleteTitle'),
      message: t('hrPayroll.commissions.deleteMessage', { name: rule.name }),
      tone: 'danger',
      confirmLabel: t('hr.common.delete'),
    });
    if (!ok) return;
    await commissionsApi.removeRule(rule.id);
    fetchAll();
  };

  const recalculate = async () => {
    const ok = await popup.confirm({
      title: t('hrPayroll.commissions.recalcTitle'),
      message: t('hrPayroll.commissions.recalcMessage'),
      confirmLabel: t('hrPayroll.commissions.recalc'),
    });
    if (!ok) return;
    const start = `${filter.year}-${String(filter.month).padStart(2, '0')}-01`;
    const lastDay = new Date(filter.year, filter.month, 0).getDate();
    const end = `${filter.year}-${String(filter.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    try {
      const d = await commissionsApi.recalculate(start, end);
      toast.success(t('hrPayroll.commissions.processed', { count: d.processed }));
      fetchAccruals();
    } catch {
      toast.error(t('hrPayroll.commissions.recalcError'));
    }
  };

  // Índices de maestros: evitan el `find` por fila que hacían las tablas.
  const employeeById = useMemo(
    () => Object.fromEntries(employees.map((e) => [e.id, e])),
    [employees],
  );
  const departmentById = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d])),
    [departments],
  );

  const scopeLabel = (r: Rule) => {
    if (r.scope === 'employee' && r.employeeId && employeeById[r.employeeId]) {
      const e = employeeById[r.employeeId];
      return `${e.firstName} ${e.lastName}`;
    }
    if (r.scope === 'department' && r.departmentId && departmentById[r.departmentId]) {
      return t('hrPayroll.commissions.deptPrefix', { name: departmentById[r.departmentId].name });
    }
    return t('hrPayroll.commissions.scope.all');
  };

  const money = (v: unknown) => `${formatNumber(Number(v || 0), { minimumFractionDigits: 2 })} €`;

  const ruleColumns: TableColumn<Rule>[] = [
    { header: t('hr.common.name'), accessor: 'name', sortable: true, primary: true },
    {
      header: t('hrPayroll.commissions.scopeLabel'),
      sortable: true,
      sortAccessor: scopeLabel,
      cell: (r) => <span className="text-xs">{scopeLabel(r)}</span>,
    },
    {
      header: t('hrPayroll.payrolls.col.base'),
      sortable: true,
      sortAccessor: (r) => r.basis,
      cell: (r) => (
        <span className="text-xs">
          {t(BASIS_OPTIONS.find((o) => o.value === r.basis)?.label ?? r.basis)}
        </span>
      ),
    },
    {
      header: '%',
      align: 'right',
      sortable: true,
      sortAccessor: (r) => Number(r.pct ?? 0),
      cell: (r) => <span className="tabular-nums">{Number(r.pct).toFixed(2)}%</span>,
    },
    {
      header: t('hrPayroll.commissions.activeCol'),
      sortable: true,
      sortAccessor: (r) => (r.isActive ? 1 : 0),
      cell: (r) => (r.isActive ? t('hr.common.yes') : t('hr.common.no')),
    },
  ];

  // `pct` llega del servidor como string decimal; el formulario lo maneja en
  // number, de ahí la conversión al abrir la regla.
  const ruleRowActions = (r: Rule): RowAction[] => [
    {
      label: t('hr.common.edit'),
      icon: <Pencil size={14} />,
      disabled: !canWrite,
      onClick: () => setEditing({ ...r, pct: Number(r.pct ?? 0) }),
    },
    {
      label: t('hr.common.delete'),
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => removeRule(r),
    },
  ];

  const accrualColumns: TableColumn<Accrual>[] = [
    {
      header: t('hr.common.employee'),
      sortable: true,
      sortAccessor: (a) => {
        const emp = employeeById[a.employeeId];
        return emp ? `${emp.firstName} ${emp.lastName}` : a.employeeId;
      },
      cell: (a) => {
        const emp = employeeById[a.employeeId];
        return (
          <span className="font-medium">
            {emp ? `${emp.firstName} ${emp.lastName}` : a.employeeId}
          </span>
        );
      },
      primary: true,
    },
    {
      header: t('hrPayroll.payrolls.periodLabel'),
      sortable: true,
      sortAccessor: (a) => a.periodYear * 100 + a.periodMonth,
      cell: (a) => (
        <span className="text-xs tabular-nums">
          {a.periodMonth}/{a.periodYear}
        </span>
      ),
    },
    {
      header: t('hrPayroll.commissions.document'),
      cell: (a) => (
        <span className="text-xs font-mono">
          {a.sourceDocType} · {a.sourceDocId.slice(0, 8)}
        </span>
      ),
    },
    {
      header: t('hrPayroll.payrolls.col.base'),
      align: 'right',
      sortable: true,
      sortAccessor: (a) => Number(a.base || 0),
      cell: (a) => <span className="tabular-nums">{money(a.base)}</span>,
    },
    {
      header: t('hrPayroll.commissions.commission'),
      align: 'right',
      sortable: true,
      sortAccessor: (a) => Number(a.amount || 0),
      cell: (a) => <span className="tabular-nums font-bold">{money(a.amount)}</span>,
    },
    {
      header: t('hr.common.status'),
      sortable: true,
      sortAccessor: (a) => a.status,
      cell: (a) => (
        <Badge variant={STATUS_VARIANT[a.status]}>
          {STATUS_LABELS[a.status] ? t(STATUS_LABELS[a.status]) : a.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="p-4 w-full space-y-5">
      <PageHeader
        title={t('hrPayroll.commissions.title')}
        subtitle={t('hrPayroll.commissions.subtitle')}
        icon={<Percent size={18} />}
        size="lg"
        actions={
          // Lo que cambia es la vista completa, no un filtro → Tabs. Van en
          // `actions` (a la derecha del título) porque la variante segmented ya
          // se pintaba así, no pegadas al borde inferior.
          <Tabs
            items={TABS.map((x) => ({ ...x, label: t(x.label) }))}
            value={tab}
            onChange={(k) => setTab(k as 'rules' | 'accruals')}
            variant="segmented"
          />
        }
      />

      {tab === 'rules' && (
        <>
          {canWrite && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setEditing(emptyRule())}>
                <Plus size={14} /> {t('hrPayroll.commissions.newRule')}
              </Button>
            </div>
          )}
          {editing && (
            <Card noPadding>
              <form onSubmit={saveRule} className="p-6 grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <Input
                    label={t('hr.common.name')}
                    value={editing.name || ''}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    required
                  />
                </div>
                <Select
                  label={t('hrPayroll.commissions.scopeLabel')}
                  options={SCOPE_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                  value={editing.scope || 'employee'}
                  onChange={(v) => setEditing({ ...editing, scope: v as Rule['scope'] })}
                />
                {editing.scope === 'employee' && (
                  <div>
                    {/* SearchableSelect no tiene prop `label` → se conserva el
                        <label> suelto. */}
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      {t('hr.common.employee')}
                    </label>
                    <SearchableSelect
                      options={employeeOptions}
                      value={editing.employeeId || ''}
                      onChange={(v) => setEditing({ ...editing, employeeId: v })}
                      placeholder={t('hrTalent.objectives.choose')}
                      clearable
                    />
                  </div>
                )}
                {editing.scope === 'department' && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      {t('hr.common.department')}
                    </label>
                    <SearchableSelect
                      options={departmentOptions}
                      value={editing.departmentId || ''}
                      onChange={(v) => setEditing({ ...editing, departmentId: v })}
                      placeholder={t('hrTalent.objectives.choose')}
                      clearable
                    />
                  </div>
                )}
                <Select
                  label={t('hrPayroll.payrolls.col.base')}
                  options={BASIS_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                  value={editing.basis || 'net_amount'}
                  onChange={(v) => setEditing({ ...editing, basis: v as Rule['basis'] })}
                />
                <Select
                  label={t('hr.incidents.type')}
                  options={KIND_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                  value={editing.kind || 'flat_pct'}
                  onChange={(v) => setEditing({ ...editing, kind: v as Rule['kind'] })}
                />
                <PercentInput
                  label={t('hrPayroll.commissions.pct')}
                  value={editing.pct}
                  onChange={(v) => setEditing({ ...editing, pct: v })}
                  emptyValue="zero"
                />
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    {t('hrPayroll.commissions.targetConcept')}
                  </label>
                  <SearchableSelect
                    options={conceptOptions}
                    value={editing.payrollConceptId || ''}
                    onChange={(v) => setEditing({ ...editing, payrollConceptId: v || null })}
                    placeholder={t('hrPayroll.commissions.autoConcept')}
                    clearable
                  />
                </div>
                {/* El vacío es válido (vigencia abierta) → clearable. */}
                <DatePicker
                  label={t('hrPayroll.agreements.validFrom')}
                  value={(editing.validFrom || '').slice(0, 10) || null}
                  onChange={(v) => setEditing({ ...editing, validFrom: v })}
                  clearable
                />
                <DatePicker
                  label={t('hrPayroll.agreements.validTo')}
                  value={(editing.validTo || '').slice(0, 10) || null}
                  onChange={(v) => setEditing({ ...editing, validTo: v })}
                  clearable
                />
                <div className="md:col-span-4 flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                    {t('hr.common.cancel')}
                  </Button>
                  <Button type="submit" disabled={!canWrite}>
                    {t('hr.common.save')}
                  </Button>
                </div>
              </form>
            </Card>
          )}
          <Card className="overflow-hidden" noPadding>
            <Table
              className="max-md:p-3"
              columns={ruleColumns}
              data={rules}
              rowActions={ruleRowActions}
              onRowClick={(r) => setEditing({ ...r, pct: Number(r.pct ?? 0) })}
              emptyMessage={t('hrPayroll.commissions.emptyRules')}
            />
          </Card>
        </>
      )}

      {tab === 'accruals' && (
        <>
          <Card noPadding>
            <div className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  {t('hr.common.employee')}
                </label>
                <SearchableSelect
                  options={employeeOptions}
                  value={filter.employeeId}
                  onChange={(v) => setFilter({ ...filter, employeeId: v })}
                  placeholder={t('hr.common.all')}
                  clearable
                />
              </div>
              {/* Año y mes son parte de la consulta: si se vacía el campo no se
                  toca el filtro (una query con año 0 no devuelve nada). */}
              <NumberInput
                label={t('hr.common.year')}
                value={filter.year}
                onChange={(v) => v != null && setFilter({ ...filter, year: v })}
                min={2000}
                max={2100}
                thousandSeparator={false}
              />
              <NumberInput
                label={t('hr.common.month')}
                value={filter.month}
                onChange={(v) => v != null && setFilter({ ...filter, month: v })}
                min={1}
                max={12}
              />
              <Select
                label={t('hr.common.status')}
                options={STATUS_FILTER_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                value={filter.status}
                onChange={(v) => setFilter({ ...filter, status: v })}
              />
              <Button size="sm" variant="secondary" onClick={recalculate} disabled={!canWrite}>
                <RefreshCw size={14} /> {t('hrPayroll.commissions.recalcTitle')}
              </Button>
            </div>
          </Card>
          <Card className="overflow-hidden" noPadding>
            <Table
              className="max-md:p-3"
              columns={accrualColumns}
              data={accruals}
              emptyMessage={t('hrPayroll.commissions.emptyAccruals')}
            />
          </Card>
          <p className="text-xs text-slate-400 italic flex items-center gap-2">
            <ArrowRightCircle size={12} /> {t('hrPayroll.commissions.footerHint')}
          </p>
        </>
      )}
    </div>
  );
};

export default Commissions;
