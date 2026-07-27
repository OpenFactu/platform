import { tasksApi, employeesApi } from '../api';
import type { Task } from '../domain/task';
import type { Employee } from '../domain/employee';
import { internalOrdersApi, type InternalOrder } from '@/modules/analytics/api/internalOrdersApi';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Button,
  Input,
  DatePicker,
  Badge,
  useToast,
  usePopup,
  cn,
  PageHeader,
  Select,
  SearchableSelect,
} from '@openfactu/ui';
import type { BadgeProps } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { ListTodo, Plus, Trash2, X, User, Calendar, Clock } from 'lucide-react';
import { ApiError } from '@/shared/http';

// Etiquetas de estado en un solo sitio: de aquí salen las columnas del kanban y
// las `options` de los dos desplegables de estado.
const STATUS_LABEL: Record<Task['status'], string> = {
  backlog: 'Backlog',
  todo: 'Por hacer',
  in_progress: 'En curso',
  blocked: 'Bloqueada',
  done: 'Hecha',
  cancelled: 'Cancelada',
};

const COLUMNS: Array<{ key: Task['status']; label: string; accent: string }> = [
  { key: 'todo', label: STATUS_LABEL.todo, accent: 'bg-slate-400' },
  { key: 'in_progress', label: STATUS_LABEL.in_progress, accent: 'bg-indigo-500' },
  { key: 'blocked', label: STATUS_LABEL.blocked, accent: 'bg-rose-500' },
  { key: 'done', label: STATUS_LABEL.done, accent: 'bg-emerald-500' },
];

const PRIORITY_VARIANT: Record<string, BadgeProps['variant']> = {
  low: 'neutral',
  normal: 'info',
  high: 'warning',
  urgent: 'error',
};
const PRIORITY_LABEL: Record<string, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as Array<Task['status']>).map((value) => ({
  value,
  label: STATUS_LABEL[value],
}));
// El selector rápido de la tarjeta nunca ofrece «Backlog»: una tarea en backlog
// no aparece en ninguna columna del kanban.
const CARD_STATUS_OPTIONS = STATUS_OPTIONS.filter((o) => o.value !== 'backlog');
const PRIORITY_OPTIONS = Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label }));

const empty = (): Partial<Task> => ({
  title: '',
  status: 'todo',
  priority: 'normal',
  progress: 0,
});

export const Tasks: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const [rows, setRows] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<InternalOrder[]>([]);
  const [editing, setEditing] = useState<Partial<Task> | null>(null);
  const [filter, setFilter] = useState({ projectId: '', assigneeId: '' });

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  const fetchAll = async () => {
    const [t, e, p] = await Promise.all([
      tasksApi.list({
        projectId: filter.projectId || undefined,
        assigneeId: filter.assigneeId || undefined,
      }),
      employeesApi.list(),
      internalOrdersApi.list().catch(() => []),
    ]);
    setRows(Array.isArray(t) ? t : []);
    setEmployees(Array.isArray(e) ? e : []);
    setProjects(Array.isArray(p) ? p : []);
  };
  useEffect(() => {
    if (user?.tenantId) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, filter.projectId, filter.assigneeId]);

  // Opciones de los desplegables de maestros (vienen del servidor).
  const employeeOptions = useMemo(
    () =>
      employees.map((e) => ({
        value: e.id,
        label: `${e.firstName} ${e.lastName}`,
        secondaryLabel: e.code,
      })),
    [employees],
  );
  const projectOptions = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name, secondaryLabel: p.code })),
    [projects],
  );

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.title) {
      toast.error('Título obligatorio');
      return;
    }
    const isNew = !editing.id;
    try {
      if (isNew) {
        await tasksApi.create(editing);
      } else {
        await tasksApi.update(editing.id!, editing);
      }
      setEditing(null);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
    }
  };

  const remove = async (t: Task) => {
    const ok = await popup.confirm({
      title: 'Borrar tarea',
      message: `¿Borrar la tarea ${t.code}?`,
      tone: 'danger',
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    await tasksApi.remove(t.id);
    fetchAll();
  };

  const moveTo = async (t: Task, status: Task['status']) => {
    if (t.status === status) return;
    await tasksApi.update(t.id, { status });
    fetchAll();
  };

  // Drag & drop entre columnas (ligero, sólo desktop).
  const [dragId, setDragId] = useState<string | null>(null);
  const onDragStart = (id: string) => setDragId(id);
  const onDrop = (status: Task['status']) => {
    if (!dragId) return;
    const t = rows.find((r) => r.id === dragId);
    setDragId(null);
    if (t) moveTo(t, status);
  };

  return (
    <div className="p-4 w-full space-y-4">
      {/* Cabecera compacta */}
      <PageHeader
        title="Tareas"
        subtitle="Planificador ligero · arrastra una tarea a otra columna para cambiar de estado"
        icon={<ListTodo size={18} />}
        size="sm"
        actions={
          <Button type="button" size="sm" onClick={() => setEditing(empty())}>
            <Plus size={14} /> Nueva tarea
          </Button>
        }
      />

      {/* Filtros */}
      <Card noPadding>
        <div className="p-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            {/* SearchableSelect no tiene prop `label` → se conserva el <label>
                suelto. El vacío es válido («Todos») → clearable. */}
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
              Proyecto
            </label>
            <SearchableSelect
              options={projectOptions}
              value={filter.projectId}
              onChange={(v) => setFilter({ ...filter, projectId: v })}
              placeholder="Todos"
              clearable
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
              Asignada a
            </label>
            <SearchableSelect
              options={employeeOptions}
              value={filter.assigneeId}
              onChange={(v) => setFilter({ ...filter, assigneeId: v })}
              placeholder="Todos"
              clearable
            />
          </div>
          <div className="text-xs text-ink-500 dark:text-ink-400 whitespace-nowrap pb-2">
            <span className="font-bold text-ink-900 dark:text-slate-100">{rows.length}</span> tarea
            {rows.length === 1 ? '' : 's'}
          </div>
        </div>
      </Card>

      {/* Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {COLUMNS.map((col) => {
          const items = rows.filter((r) => r.status === col.key);
          const isDropTarget = dragId !== null;
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(col.key)}
              className={cn(
                'rounded-xs border bg-white dark:bg-ink-900 flex flex-col min-h-[300px]',
                isDropTarget ? 'border-accent/50' : 'border-line dark:border-ink-700',
              )}
            >
              <div className="flex items-center gap-2 px-3 py-2 border-b border-line dark:border-ink-700">
                <span className={cn('w-1.5 h-1.5 rounded-none', col.accent)} />
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-700 dark:text-slate-200 flex-1">
                  {col.label}
                </span>
                <span className="text-[10px] font-bold text-ink-500 dark:text-ink-400 bg-line-2/70 dark:bg-ink-800 px-1.5 py-0.5 rounded-xs">
                  {items.length}
                </span>
              </div>
              <div className="flex-1 p-2 space-y-2">
                {items.length === 0 ? (
                  <p className="text-[11px] text-ink-400 dark:text-ink-500 text-center py-6">—</p>
                ) : (
                  items.map((t) => {
                    const emp = employees.find((e) => e.id === t.assigneeId);
                    const overdue =
                      t.dueDate && t.status !== 'done' && t.status !== 'cancelled'
                        ? new Date(t.dueDate) < new Date(new Date().toDateString())
                        : false;
                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={() => onDragStart(t.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => setEditing(t)}
                        className={cn(
                          'group rounded-xs border bg-white dark:bg-ink-800 p-2.5 cursor-pointer',
                          'border-line dark:border-ink-700 hover:border-accent/50 hover:shadow-sm',
                          'transition-colors',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="text-sm font-semibold text-ink-900 dark:text-slate-100 leading-snug">
                            {t.title}
                          </div>
                          <Badge variant={PRIORITY_VARIANT[t.priority]}>
                            {PRIORITY_LABEL[t.priority] || t.priority}
                          </Badge>
                        </div>
                        <div className="text-[10px] font-mono text-ink-400 dark:text-ink-500 mb-1.5">
                          {t.code}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-500 dark:text-ink-400">
                          {emp && (
                            <span className="flex items-center gap-1">
                              <User size={10} />
                              {emp.firstName} {emp.lastName}
                            </span>
                          )}
                          {t.dueDate && (
                            <span
                              className={cn(
                                'flex items-center gap-1',
                                overdue && 'text-rose-600 dark:text-rose-400 font-semibold',
                              )}
                            >
                              <Calendar size={10} />
                              {t.dueDate.slice(0, 10)}
                            </span>
                          )}
                          {t.estimatedHours && (
                            <span className="flex items-center gap-1">
                              <Clock size={10} />
                              {Number(t.estimatedHours).toFixed(1)}h
                            </span>
                          )}
                        </div>
                        {(t.progress ?? 0) > 0 && (
                          <div className="mt-2 h-1 bg-line dark:bg-ink-700 rounded-none overflow-hidden">
                            <div
                              className="h-full bg-accent transition-all"
                              style={{ width: `${Math.min(100, t.progress)}%` }}
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* El stopPropagation vive en el envoltorio: Select no
                              expone onClick y la tarjeta abre el editor al
                              hacer click. */}
                          <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                            <Select
                              ariaLabel="Estado de la tarea"
                              options={CARD_STATUS_OPTIONS}
                              value={t.status}
                              onChange={(v) => moveTo(t, v as Task['status'])}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              remove(t);
                            }}
                            title="Borrar"
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="max-w-2xl w-full" noPadding>
            <form onSubmit={save} className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line dark:border-ink-700 pb-3">
                <h2 className="text-base font-bold text-ink-900 dark:text-slate-100">
                  {editing.id ? `Editar ${editing.code || 'tarea'}` : 'Nueva tarea'}
                </h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(null)}
                  title="Cerrar"
                >
                  <X size={18} />
                </Button>
              </div>
              <Input
                label="Título"
                value={editing.title || ''}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                required
              />
              <Input
                label="Descripción"
                value={editing.description || ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Listas estáticas y cortas → Select, que sí tiene prop `label`. */}
                <Select
                  label="Estado"
                  options={STATUS_OPTIONS}
                  value={editing.status || 'todo'}
                  onChange={(v) => setEditing({ ...editing, status: v as Task['status'] })}
                />
                <Select
                  label="Prioridad"
                  options={PRIORITY_OPTIONS}
                  value={editing.priority || 'normal'}
                  onChange={(v) => setEditing({ ...editing, priority: v as Task['priority'] })}
                />
                <div>
                  {/* Maestros del servidor → SearchableSelect, que no tiene prop
                      `label`: se conserva el <label> suelto. El vacío es válido
                      → clearable. */}
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
                    Asignada a
                  </label>
                  <SearchableSelect
                    options={employeeOptions}
                    value={editing.assigneeId || ''}
                    onChange={(v) => setEditing({ ...editing, assigneeId: v })}
                    placeholder="— sin asignar —"
                    clearable
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
                    Proyecto
                  </label>
                  <SearchableSelect
                    options={projectOptions}
                    value={editing.internalOrderId || ''}
                    onChange={(v) => setEditing({ ...editing, internalOrderId: v })}
                    placeholder="— ninguno —"
                    clearable
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <DatePicker
                  label="Inicio"
                  value={(editing.startDate || '').slice(0, 10) || null}
                  onChange={(v) => setEditing({ ...editing, startDate: v ?? '' })}
                />
                <DatePicker
                  label="Fin"
                  value={(editing.dueDate || '').slice(0, 10) || null}
                  onChange={(v) => setEditing({ ...editing, dueDate: v ?? '' })}
                />
                <Input
                  label="Estimadas (h)"
                  type="number"
                  step="0.5"
                  value={String(editing.estimatedHours ?? '')}
                  onChange={(e) => setEditing({ ...editing, estimatedHours: e.target.value })}
                />
                <Input
                  label="Progreso (%)"
                  type="number"
                  min={0}
                  max={100}
                  value={String(editing.progress ?? 0)}
                  onChange={(e) => setEditing({ ...editing, progress: Number(e.target.value) })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-line dark:border-ink-700">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditing(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm">
                  Guardar
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Tasks;
