import { objectivesApi, employeesApi } from '../api';
import type { Objective } from '../domain/evaluation';
import type { Employee } from '../domain/employee';
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
} from '@openfactu/ui';
import type { BadgeProps } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { Target, Plus, Pencil, Trash2 } from 'lucide-react';
import { ApiError } from '@/shared/http';

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  pending: 'neutral',
  in_progress: 'warning',
  achieved: 'success',
  missed: 'error',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  achieved: 'Conseguido',
  missed: 'No alcanzado',
};

// Las etiquetas del desplegable se reutilizan de STATUS_LABEL en lugar de
// repetirlas en el JSX.
const STATUS_OPTIONS = (['pending', 'in_progress', 'achieved', 'missed'] as const).map((value) => ({
  value,
  label: STATUS_LABEL[value],
}));
const STATUS_FILTER_OPTIONS = [{ value: '', label: 'Todos' }, ...STATUS_OPTIONS];

const empty = (): Partial<Objective> => ({
  title: '',
  description: '',
  targetMetric: '',
  targetValue: '0',
  achievedValue: '0',
  weight: '1',
  status: 'pending',
  dueDate: '',
});

export const Objectives: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const [rows, setRows] = useState<Objective[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editing, setEditing] = useState<Partial<Objective> | null>(null);
  const [filter, setFilter] = useState({ employeeId: '', status: '' });
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  const fetchAll = async () => {
    const [o, e] = await Promise.all([
      objectivesApi.list({
        employeeId: filter.employeeId || undefined,
        status: filter.status || undefined,
      }),
      employeesApi.list(),
    ]);
    setRows(Array.isArray(o) ? o : []);
    setEmployees(Array.isArray(e) ? e : []);
  };
  useEffect(() => {
    if (user?.tenantId) fetchAll();
  }, [user?.tenantId, filter.employeeId, filter.status]);

  // Opciones del desplegable de empleados (viene del servidor).
  const employeeOptions = useMemo(
    () =>
      employees.map((e) => ({
        value: e.id,
        label: `${e.firstName} ${e.lastName}`,
        secondaryLabel: e.code,
      })),
    [employees],
  );

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.title || !editing?.employeeId) {
      toast.error('Empleado y título obligatorios');
      return;
    }
    const isNew = !editing.id;
    try {
      if (isNew) {
        await objectivesApi.create(editing);
      } else {
        await objectivesApi.update(editing.id!, editing);
      }
      setEditing(null);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
    }
  };

  const remove = async (o: Objective) => {
    const ok = await popup.confirm({
      title: 'Borrar objetivo',
      message: `¿Borrar el objetivo "${o.title}"?`,
      tone: 'danger',
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    await objectivesApi.remove(o.id);
    fetchAll();
  };

  return (
    <div className="p-4 w-full space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <Target className="text-rose-500" size={32} /> Objetivos SMART
          </h1>
          <p className="text-slate-500 text-sm">
            Objetivos por empleado con métrica medible y progreso.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing(empty())}>
          <Plus size={14} /> Nuevo objetivo
        </Button>
      </div>

      <Card noPadding>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            {/* SearchableSelect no tiene prop `label` → se conserva el <label>
                suelto. El vacío es válido («Todos») → clearable. */}
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
          <Select
            label="Estado"
            options={STATUS_FILTER_OPTIONS}
            value={filter.status}
            onChange={(v) => setFilter({ ...filter, status: v })}
          />
          <div className="text-xs text-slate-500">
            <span className="font-bold text-fg-body">{rows.length}</span> objetivos
          </div>
        </div>
      </Card>

      {editing && (
        <Card noPadding>
          <form onSubmit={save} className="p-6 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              {/* El `required` del <select> nativo se pierde al pasar a
                  SearchableSelect, pero `save` ya avisa si falta el empleado. */}
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Empleado
              </label>
              <SearchableSelect
                options={employeeOptions}
                value={editing.employeeId || ''}
                onChange={(v) => setEditing({ ...editing, employeeId: v })}
                placeholder="— elegir —"
              />
            </div>
            <div className="md:col-span-3">
              <Input
                label="Título"
                value={editing.title || ''}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                required
              />
            </div>
            <div className="md:col-span-2">
              <Input
                label="Métrica (texto libre)"
                value={editing.targetMetric || ''}
                onChange={(e) => setEditing({ ...editing, targetMetric: e.target.value })}
              />
            </div>
            <Input
              label="Objetivo"
              type="number"
              step="0.01"
              value={String(editing.targetValue ?? '0')}
              onChange={(e) => setEditing({ ...editing, targetValue: e.target.value })}
            />
            <Input
              label="Conseguido"
              type="number"
              step="0.01"
              value={String(editing.achievedValue ?? '0')}
              onChange={(e) => setEditing({ ...editing, achievedValue: e.target.value })}
            />
            <Input
              label="Peso"
              type="number"
              step="0.01"
              value={String(editing.weight ?? '1')}
              onChange={(e) => setEditing({ ...editing, weight: e.target.value })}
            />
            <Input
              label="Fecha límite"
              type="date"
              value={(editing.dueDate || '').slice(0, 10)}
              onChange={(e) => setEditing({ ...editing, dueDate: e.target.value })}
            />
            <Select
              label="Estado"
              options={STATUS_OPTIONS}
              value={editing.status || 'pending'}
              onChange={(v) => setEditing({ ...editing, status: v as Objective['status'] })}
            />
            <div className="md:col-span-4">
              <Input
                label="Descripción"
                value={editing.description || ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </div>
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
              <th className="p-3">Empleado</th>
              <th className="p-3">Título</th>
              <th className="p-3">Métrica</th>
              <th className="p-3 text-right">Progreso</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Vence</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const emp = employees.find((e) => e.id === r.employeeId);
              const target = Number(r.targetValue || 0);
              const achieved = Number(r.achievedValue || 0);
              const pct = target > 0 ? Math.min(100, (achieved / target) * 100) : 0;
              return (
                <tr key={r.id} className="border-b">
                  <td className="p-3">
                    {emp ? (
                      <span className="font-medium">
                        {emp.firstName} {emp.lastName}
                      </span>
                    ) : (
                      r.employeeId
                    )}
                  </td>
                  <td className="p-3 font-bold">{r.title}</td>
                  <td className="p-3 text-slate-500">{r.targetMetric || '—'}</td>
                  <td className="p-3 text-right">
                    <div className="font-bold tabular-nums">
                      {achieved} / {target}
                    </div>
                    <div className="h-1 bg-slate-200 dark:bg-slate-700 rounded mt-1">
                      <div className="h-1 bg-emerald-500 rounded" style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </td>
                  <td className="p-3 text-xs text-slate-500">{r.dueDate?.slice(0, 10) || '—'}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(r)}
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(r)}
                        title="Borrar"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default Objectives;
