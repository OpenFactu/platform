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
} from '@openfactu/ui';
import type { BadgeProps } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
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
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setEditing(emptyRule())}>
              <Plus size={14} /> Nueva regla
            </Button>
          </div>
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
                  <Button type="submit">Guardar</Button>
                </div>
              </form>
            </Card>
          )}
          <Card noPadding>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b">
                  <th className="p-3">Nombre</th>
                  <th className="p-3">Alcance</th>
                  <th className="p-3">Base</th>
                  <th className="p-3 text-right">%</th>
                  <th className="p-3">Activa</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="p-3 font-bold">{r.name}</td>
                    <td className="p-3 text-xs">
                      {r.scope === 'employee' && employees.find((e) => e.id === r.employeeId) ? (
                        <span>
                          {employees.find((e) => e.id === r.employeeId)?.firstName}{' '}
                          {employees.find((e) => e.id === r.employeeId)?.lastName}
                        </span>
                      ) : r.scope === 'department' &&
                        departments.find((d) => d.id === r.departmentId) ? (
                        <span>Dpto: {departments.find((d) => d.id === r.departmentId)?.name}</span>
                      ) : (
                        'Toda la empresa'
                      )}
                    </td>
                    <td className="p-3 text-xs">{r.basis}</td>
                    <td className="p-3 text-right tabular-nums">{Number(r.pct).toFixed(2)}%</td>
                    <td className="p-3">{r.isActive ? 'Sí' : 'No'}</td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        {/* `pct` llega del servidor como string decimal; el
                            formulario lo maneja en number. */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing({ ...r, pct: Number(r.pct ?? 0) })}
                          title="Editar"
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRule(r)}
                          title="Borrar"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              <Button size="sm" variant="secondary" onClick={recalculate}>
                <RefreshCw size={14} /> Recalcular periodo
              </Button>
            </div>
          </Card>
          <Card noPadding>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b">
                  <th className="p-3">Empleado</th>
                  <th className="p-3">Periodo</th>
                  <th className="p-3">Documento</th>
                  <th className="p-3 text-right">Base</th>
                  <th className="p-3 text-right">Comisión</th>
                  <th className="p-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {accruals.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400 italic">
                      Sin acumulados. Pulsa "Recalcular periodo".
                    </td>
                  </tr>
                )}
                {accruals.map((a) => {
                  const emp = employees.find((e) => e.id === a.employeeId);
                  return (
                    <tr key={a.id} className="border-b">
                      <td className="p-3 font-medium">
                        {emp ? `${emp.firstName} ${emp.lastName}` : a.employeeId}
                      </td>
                      <td className="p-3 text-xs tabular-nums">
                        {a.periodMonth}/{a.periodYear}
                      </td>
                      <td className="p-3 text-xs font-mono">
                        {a.sourceDocType} · {a.sourceDocId.slice(0, 8)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {Number(a.base).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                      </td>
                      <td className="p-3 text-right tabular-nums font-bold">
                        {Number(a.amount).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                      </td>
                      <td className="p-3">
                        <Badge variant={STATUS_VARIANT[a.status]}>
                          {STATUS_LABELS[a.status] ?? a.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
