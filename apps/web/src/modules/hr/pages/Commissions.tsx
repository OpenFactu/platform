import { hrApi } from '../api';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, Badge, useToast } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { Percent, Plus, Pencil, Trash2, RefreshCw, ArrowRightCircle } from 'lucide-react';

interface Rule {
  id: string;
  name: string;
  scope: 'employee' | 'department' | 'all';
  employeeId: string | null;
  departmentId: string | null;
  basis: 'net_amount' | 'gross_amount' | 'margin';
  kind: 'flat_pct' | 'tiered';
  pct: string;
  tiers: any;
  payrollConceptId: string | null;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
}

interface Accrual {
  id: string;
  employeeId: string;
  ruleId: string | null;
  periodYear: number;
  periodMonth: number;
  sourceDocType: string;
  sourceDocId: string;
  base: string;
  amount: string;
  status: 'pending' | 'paid' | 'cancelled';
  payrollLineId: string | null;
}

const STATUS_VARIANT: Record<string, any> = {
  pending: 'warning',
  paid: 'success',
  cancelled: 'neutral',
};

const emptyRule = (): Partial<Rule> => ({
  name: '',
  scope: 'employee',
  basis: 'net_amount',
  kind: 'flat_pct',
  pct: '5',
  isActive: true,
});

export const Commissions: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'rules' | 'accruals'>('rules');
  const [rules, setRules] = useState<Rule[]>([]);
  const [accruals, setAccruals] = useState<Accrual[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [concepts, setConcepts] = useState<any[]>([]);
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);
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

  const fetchAll = async () => {
    const [r, e, d, c] = await Promise.all([
      hrApi.get('/api/hr/commissions/rules'),
      hrApi.get('/api/hr/employees'),
      hrApi.get('/api/hr/departments'),
      hrApi.get('/api/hr/payroll-concepts?activeOnly=true'),
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
    const params = new URLSearchParams();
    if (filter.employeeId) params.set('employeeId', filter.employeeId);
    if (filter.status) params.set('status', filter.status);
    params.set('year', String(filter.year));
    params.set('month', String(filter.month));
    const r = await hrApi.raw('GET', `/api/hr/commissions/accruals?${params}`);
    setAccruals(r.data);
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
    const r = await hrApi.raw(isNew ? 'POST' : 'PATCH', isNew ? '/api/hr/commissions/rules' : `/api/hr/commissions/rules/${editing.id}`, editing);
    if (!r.ok) {
      const d = r.data;
      toast.error(d.error || 'Error');
      return;
    }
    setEditing(null);
    fetchAll();
  };

  const removeRule = async (rule: Rule) => {
    if (!confirm(`¿Borrar regla "${rule.name}"?`)) return;
    await hrApi.raw('DELETE', `/api/hr/commissions/rules/${rule.id}`);
    fetchAll();
  };

  const recalculate = async () => {
    if (!confirm('¿Recalcular comisiones del periodo? Sobrescribe accruals "pending".')) return;
    const start = `${filter.year}-${String(filter.month).padStart(2, '0')}-01`;
    const lastDay = new Date(filter.year, filter.month, 0).getDate();
    const end = `${filter.year}-${String(filter.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const r = await hrApi.raw('POST', `/api/hr/commissions/recalculate?from=${start}&to=${end}`);
    if (!r.ok) {
      toast.error('Error al recalcular');
      return;
    }
    const d = r.data;
    toast.success(`Procesados ${d.processed} documentos`);
    fetchAccruals();
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
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button
            onClick={() => setTab('rules')}
            className={
              'px-3 py-1.5 text-sm font-bold ' +
              (tab === 'rules' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900')
            }
          >
            Reglas
          </button>
          <button
            onClick={() => setTab('accruals')}
            className={
              'px-3 py-1.5 text-sm font-bold ' +
              (tab === 'accruals' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900')
            }
          >
            Acumulados
          </button>
        </div>
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
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Alcance
                  </label>
                  <select
                    value={editing.scope || 'employee'}
                    onChange={(e) => setEditing({ ...editing, scope: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  >
                    <option value="employee">Empleado concreto</option>
                    <option value="department">Departamento</option>
                    <option value="all">Toda la empresa</option>
                  </select>
                </div>
                {editing.scope === 'employee' && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Empleado
                    </label>
                    <select
                      value={editing.employeeId || ''}
                      onChange={(e) => setEditing({ ...editing, employeeId: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    >
                      <option value="">— elegir —</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.code} — {e.firstName} {e.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {editing.scope === 'department' && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Departamento
                    </label>
                    <select
                      value={editing.departmentId || ''}
                      onChange={(e) => setEditing({ ...editing, departmentId: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    >
                      <option value="">— elegir —</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code} — {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Base
                  </label>
                  <select
                    value={editing.basis || 'net_amount'}
                    onChange={(e) => setEditing({ ...editing, basis: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  >
                    <option value="net_amount">Importe neto (subtotal)</option>
                    <option value="gross_amount">Importe bruto (total con IVA)</option>
                    <option value="margin">Margen (futuro)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Tipo
                  </label>
                  <select
                    value={editing.kind || 'flat_pct'}
                    onChange={(e) => setEditing({ ...editing, kind: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  >
                    <option value="flat_pct">Porcentaje fijo</option>
                    <option value="tiered">Por tramos</option>
                  </select>
                </div>
                <Input
                  label="% comisión"
                  type="number"
                  step="0.01"
                  value={String(editing.pct ?? '0')}
                  onChange={(e) => setEditing({ ...editing, pct: e.target.value })}
                />
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Concepto destino
                  </label>
                  <select
                    value={editing.payrollConceptId || ''}
                    onChange={(e) =>
                      setEditing({ ...editing, payrollConceptId: e.target.value || null })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  >
                    <option value="">— auto (busca "Comisiones") —</option>
                    {concepts
                      .filter((c) => c.kind === 'devengo')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                  </select>
                </div>
                <Input
                  label="Vigencia desde"
                  type="date"
                  value={(editing.validFrom || '').slice(0, 10)}
                  onChange={(e) => setEditing({ ...editing, validFrom: e.target.value })}
                />
                <Input
                  label="Vigencia hasta"
                  type="date"
                  value={(editing.validTo || '').slice(0, 10)}
                  onChange={(e) => setEditing({ ...editing, validTo: e.target.value })}
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
                        <button
                          onClick={() => setEditing(r)}
                          className="text-slate-500 hover:text-indigo-600"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => removeRule(r)}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <Trash2 size={16} />
                        </button>
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
                <select
                  value={filter.employeeId}
                  onChange={(e) => setFilter({ ...filter, employeeId: e.target.value })}
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
              <Input
                label="Año"
                type="number"
                value={String(filter.year)}
                onChange={(e) => setFilter({ ...filter, year: Number(e.target.value) })}
              />
              <Input
                label="Mes"
                type="number"
                min={1}
                max={12}
                value={String(filter.month)}
                onChange={(e) => setFilter({ ...filter, month: Number(e.target.value) })}
              />
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Estado
                </label>
                <select
                  value={filter.status}
                  onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  <option value="">Todos</option>
                  <option value="pending">Pendiente</option>
                  <option value="paid">Pagado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>
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
                        <Badge variant={STATUS_VARIANT[a.status]}>{a.status}</Badge>
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
