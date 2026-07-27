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
} from '@openfactu/ui';
import type { BadgeProps, TableColumn, RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { Percent, Plus, Pencil, Trash2, RefreshCw, ArrowRightCircle } from 'lucide-react';
import { ApiError } from '@/shared/http';

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  pending: 'warning',
  paid: 'success',
  cancelled: 'neutral',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  cancelled: 'Cancelado',
};

// Configuración de los desplegables estáticos, en un solo sitio: las
// `options` se derivan de aquí en lugar de repetir los valores en el JSX.
const SCOPE_OPTIONS = [
  { value: 'employee', label: 'Empleado concreto' },
  { value: 'department', label: 'Departamento' },
  { value: 'all', label: 'Toda la empresa' },
];
const BASIS_OPTIONS = [
  { value: 'net_amount', label: 'Importe neto (subtotal)' },
  { value: 'gross_amount', label: 'Importe bruto (total con IVA)' },
  { value: 'margin', label: 'Margen (futuro)' },
];
const KIND_OPTIONS = [
  { value: 'flat_pct', label: 'Porcentaje fijo' },
  { value: 'tiered', label: 'Por tramos' },
];
const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Todos' },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
];
const TABS = [
  { key: 'rules', label: 'Reglas' },
  { key: 'accruals', label: 'Acumulados' },
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
      toast.error('Nombre obligatorio');
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
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
    }
  };

  const removeRule = async (rule: Rule) => {
    const ok = await popup.confirm({
      title: 'Borrar regla',
      message: `¿Seguro que quieres borrar la regla "${rule.name}"?`,
      tone: 'danger',
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    await commissionsApi.removeRule(rule.id);
    fetchAll();
  };

  const recalculate = async () => {
    const ok = await popup.confirm({
      title: 'Recalcular periodo',
      message: 'Se recalculan las comisiones del periodo. Sobrescribe los acumulados "pendiente".',
      confirmLabel: 'Recalcular',
    });
    if (!ok) return;
    const start = `${filter.year}-${String(filter.month).padStart(2, '0')}-01`;
    const lastDay = new Date(filter.year, filter.month, 0).getDate();
    const end = `${filter.year}-${String(filter.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    try {
      const d = await commissionsApi.recalculate(start, end);
      toast.success(`Procesados ${d.processed} documentos`);
      fetchAccruals();
    } catch {
      toast.error('Error al recalcular');
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
      return `Dpto: ${departmentById[r.departmentId].name}`;
    }
    return 'Toda la empresa';
  };

  const money = (v: unknown) =>
    `${Number(v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`;

  const ruleColumns: TableColumn<Rule>[] = [
    { header: 'Nombre', accessor: 'name', sortable: true, primary: true },
    {
      header: 'Alcance',
      sortable: true,
      sortAccessor: scopeLabel,
      cell: (r) => <span className="text-xs">{scopeLabel(r)}</span>,
    },
    {
      header: 'Base',
      sortable: true,
      sortAccessor: (r) => r.basis,
      cell: (r) => <span className="text-xs">{r.basis}</span>,
    },
    {
      header: '%',
      align: 'right',
      sortable: true,
      sortAccessor: (r) => Number(r.pct ?? 0),
      cell: (r) => <span className="tabular-nums">{Number(r.pct).toFixed(2)}%</span>,
    },
    {
      header: 'Activa',
      sortable: true,
      sortAccessor: (r) => (r.isActive ? 1 : 0),
      cell: (r) => (r.isActive ? 'Sí' : 'No'),
    },
  ];

  // `pct` llega del servidor como string decimal; el formulario lo maneja en
  // number, de ahí la conversión al abrir la regla.
  const ruleRowActions = (r: Rule): RowAction[] => [
    {
      label: 'Editar',
      icon: <Pencil size={14} />,
      disabled: !canWrite,
      onClick: () => setEditing({ ...r, pct: Number(r.pct ?? 0) }),
    },
    {
      label: 'Borrar',
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => removeRule(r),
    },
  ];

  const accrualColumns: TableColumn<Accrual>[] = [
    {
      header: 'Empleado',
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
      header: 'Periodo',
      sortable: true,
      sortAccessor: (a) => a.periodYear * 100 + a.periodMonth,
      cell: (a) => (
        <span className="text-xs tabular-nums">
          {a.periodMonth}/{a.periodYear}
        </span>
      ),
    },
    {
      header: 'Documento',
      cell: (a) => (
        <span className="text-xs font-mono">
          {a.sourceDocType} · {a.sourceDocId.slice(0, 8)}
        </span>
      ),
    },
    {
      header: 'Base',
      align: 'right',
      sortable: true,
      sortAccessor: (a) => Number(a.base || 0),
      cell: (a) => <span className="tabular-nums">{money(a.base)}</span>,
    },
    {
      header: 'Comisión',
      align: 'right',
      sortable: true,
      sortAccessor: (a) => Number(a.amount || 0),
      cell: (a) => <span className="tabular-nums font-bold">{money(a.amount)}</span>,
    },
    {
      header: 'Estado',
      sortable: true,
      sortAccessor: (a) => a.status,
      cell: (a) => (
        <Badge variant={STATUS_VARIANT[a.status]}>{STATUS_LABELS[a.status] ?? a.status}</Badge>
      ),
    },
  ];

  return (
    <div className="p-4 w-full space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <Percent className="text-amber-600" size={32} /> Comisiones
          </h1>
          <p className="text-slate-500 text-sm">
            Reglas de comisión sobre ventas atribuidas a comerciales. Volcado a nómina con un click.
          </p>
        </div>
        {/* Lo que cambia es la vista completa, no un filtro → Tabs. */}
        <Tabs
          items={TABS}
          value={tab}
          onChange={(k) => setTab(k as 'rules' | 'accruals')}
          variant="segmented"
        />
      </div>

      {tab === 'rules' && (
        <>
          {canWrite && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setEditing(emptyRule())}>
                <Plus size={14} /> Nueva regla
              </Button>
            </div>
          )}
          {editing && (
            <Card noPadding>
              <form onSubmit={saveRule} className="p-6 grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <Input
                    label="Nombre"
                    value={editing.name || ''}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    required
                  />
                </div>
                <Select
                  label="Alcance"
                  options={SCOPE_OPTIONS}
                  value={editing.scope || 'employee'}
                  onChange={(v) => setEditing({ ...editing, scope: v as Rule['scope'] })}
                />
                {editing.scope === 'employee' && (
                  <div>
                    {/* SearchableSelect no tiene prop `label` → se conserva el
                        <label> suelto. */}
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Empleado
                    </label>
                    <SearchableSelect
                      options={employeeOptions}
                      value={editing.employeeId || ''}
                      onChange={(v) => setEditing({ ...editing, employeeId: v })}
                      placeholder="— elegir —"
                      clearable
                    />
                  </div>
                )}
                {editing.scope === 'department' && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Departamento
                    </label>
                    <SearchableSelect
                      options={departmentOptions}
                      value={editing.departmentId || ''}
                      onChange={(v) => setEditing({ ...editing, departmentId: v })}
                      placeholder="— elegir —"
                      clearable
                    />
                  </div>
                )}
                <Select
                  label="Base"
                  options={BASIS_OPTIONS}
                  value={editing.basis || 'net_amount'}
                  onChange={(v) => setEditing({ ...editing, basis: v as Rule['basis'] })}
                />
                <Select
                  label="Tipo"
                  options={KIND_OPTIONS}
                  value={editing.kind || 'flat_pct'}
                  onChange={(v) => setEditing({ ...editing, kind: v as Rule['kind'] })}
                />
                <PercentInput
                  label="% comisión"
                  value={editing.pct}
                  onChange={(v) => setEditing({ ...editing, pct: v })}
                  emptyValue="zero"
                />
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Concepto destino
                  </label>
                  <SearchableSelect
                    options={conceptOptions}
                    value={editing.payrollConceptId || ''}
                    onChange={(v) => setEditing({ ...editing, payrollConceptId: v || null })}
                    placeholder='— auto (busca "Comisiones") —'
                    clearable
                  />
                </div>
                {/* El vacío es válido (vigencia abierta) → clearable. */}
                <DatePicker
                  label="Vigencia desde"
                  value={(editing.validFrom || '').slice(0, 10) || null}
                  onChange={(v) => setEditing({ ...editing, validFrom: v })}
                  clearable
                />
                <DatePicker
                  label="Vigencia hasta"
                  value={(editing.validTo || '').slice(0, 10) || null}
                  onChange={(v) => setEditing({ ...editing, validTo: v })}
                  clearable
                />
                <div className="md:col-span-4 flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={!canWrite}>
                    Guardar
                  </Button>
                </div>
              </form>
            </Card>
          )}
          <Card className="overflow-hidden" noPadding>
            <Table
              columns={ruleColumns}
              data={rules}
              rowActions={ruleRowActions}
              onRowClick={(r) => setEditing({ ...r, pct: Number(r.pct ?? 0) })}
              emptyMessage="Todavía no hay reglas de comisión."
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
                  Empleado
                </label>
                <SearchableSelect
                  options={employeeOptions}
                  value={filter.employeeId}
                  onChange={(v) => setFilter({ ...filter, employeeId: v })}
                  placeholder="Todos"
                  clearable
                />
              </div>
              {/* Año y mes son parte de la consulta: si se vacía el campo no se
                  toca el filtro (una query con año 0 no devuelve nada). */}
              <NumberInput
                label="Año"
                value={filter.year}
                onChange={(v) => v != null && setFilter({ ...filter, year: v })}
                min={2000}
                max={2100}
                thousandSeparator={false}
              />
              <NumberInput
                label="Mes"
                value={filter.month}
                onChange={(v) => v != null && setFilter({ ...filter, month: v })}
                min={1}
                max={12}
              />
              <Select
                label="Estado"
                options={STATUS_FILTER_OPTIONS}
                value={filter.status}
                onChange={(v) => setFilter({ ...filter, status: v })}
              />
              <Button size="sm" variant="secondary" onClick={recalculate} disabled={!canWrite}>
                <RefreshCw size={14} /> Recalcular periodo
              </Button>
            </div>
          </Card>
          <Card className="overflow-hidden" noPadding>
            <Table
              columns={accrualColumns}
              data={accruals}
              emptyMessage={'Sin acumulados. Pulsa "Recalcular periodo".'}
            />
          </Card>
          <p className="text-xs text-slate-400 italic flex items-center gap-2">
            <ArrowRightCircle size={12} /> Los acumulados pendientes se vuelcan a la nómina del
            empleado/mes desde la página de Nóminas, opción "Importar comisiones".
          </p>
        </>
      )}
    </div>
  );
};

export default Commissions;
