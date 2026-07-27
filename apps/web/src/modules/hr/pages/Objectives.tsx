import { objectivesApi, employeesApi } from '../api';
import type { Objective } from '../domain/evaluation';
import type { Employee } from '../domain/employee';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Button,
  Input,
  DatePicker,
  Badge,
  useToast,
  usePopup,
  PageHeader,
  Select,
  SearchableSelect,
  Progress,
  Table,
} from '@openfactu/ui';
import type { BadgeProps, TableColumn, RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
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
  const { canWrite, canDelete } = usePagePermissions();
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

  // Índice de empleados para pintar el nombre en la tabla sin recorrer la
  // lista en cada fila.
  const employeeById = useMemo(
    () => Object.fromEntries(employees.map((e) => [e.id, e])),
    [employees],
  );

  const columns: TableColumn<Objective>[] = [
    {
      header: 'Empleado',
      sortable: true,
      sortAccessor: (r) => {
        const emp = employeeById[r.employeeId];
        return emp ? `${emp.firstName} ${emp.lastName}` : r.employeeId;
      },
      cell: (r) => {
        const emp = employeeById[r.employeeId];
        return emp ? (
          <span className="font-medium">
            {emp.firstName} {emp.lastName}
          </span>
        ) : (
          r.employeeId
        );
      },
    },
    { header: 'Título', accessor: 'title', sortable: true, primary: true },
    {
      header: 'Métrica',
      sortable: true,
      sortAccessor: (r) => r.targetMetric || '',
      cell: (r) => <span className="text-fg-muted">{r.targetMetric || '—'}</span>,
    },
    {
      header: 'Progreso',
      align: 'right',
      sortable: true,
      sortAccessor: (r) => {
        const target = Number(r.targetValue || 0);
        return target > 0 ? Number(r.achievedValue || 0) / target : 0;
      },
      cell: (r) => {
        const target = Number(r.targetValue || 0);
        const achieved = Number(r.achievedValue || 0);
        const pct = target > 0 ? Math.min(100, (achieved / target) * 100) : 0;
        return (
          <div className="min-w-[100px]">
            <div className="font-bold tabular-nums">
              {achieved} / {target}
            </div>
            <Progress value={pct} variant="success" size="sm" className="mt-1" />
          </div>
        );
      },
    },
    {
      header: 'Estado',
      sortable: true,
      sortAccessor: (r) => r.status,
      cell: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>,
    },
    {
      header: 'Vence',
      sortable: true,
      sortAccessor: (r) => r.dueDate || '',
      cell: (r) => <span className="text-xs text-fg-muted">{r.dueDate?.slice(0, 10) || '—'}</span>,
    },
  ];

  const rowActions = (r: Objective): RowAction[] => [
    {
      label: 'Editar',
      icon: <Pencil size={14} />,
      disabled: !canWrite,
      onClick: () => setEditing(r),
    },
    {
      label: 'Borrar',
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => remove(r),
    },
  ];

  return (
    <div className="p-4 w-full space-y-5">
      <PageHeader
        title="Objetivos SMART"
        subtitle="Objetivos por empleado con métrica medible y progreso."
        icon={<Target size={18} />}
        size="lg"
        actions={
          canWrite && (
            <Button type="button" size="sm" onClick={() => setEditing(empty())}>
              <Plus size={14} /> Nuevo objetivo
            </Button>
          )
        }
      />

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
            <DatePicker
              label="Fecha límite"
              value={(editing.dueDate || '').slice(0, 10) || null}
              onChange={(v) => setEditing({ ...editing, dueDate: v ?? '' })}
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
              <Button type="submit" disabled={!canWrite}>
                Guardar
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden" noPadding>
        <Table
          columns={columns}
          data={rows}
          rowActions={rowActions}
          onRowClick={(r) => setEditing(r)}
          emptyMessage="No hay objetivos que cumplan los filtros actuales."
        />
      </Card>
    </div>
  );
};

export default Objectives;
