import { hrApi } from '../api';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, Badge, useToast, cn } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { ListTodo, Plus, Trash2, X, User, Calendar, Clock } from 'lucide-react';

interface Task {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assigneeId: string | null;
  internalOrderId: string | null;
  startDate: string | null;
  dueDate: string | null;
  estimatedHours: string | null;
  actualHours: string | null;
  progress: number;
}

const COLUMNS: Array<{ key: Task['status']; label: string; accent: string }> = [
  { key: 'todo', label: 'Por hacer', accent: 'bg-slate-400' },
  { key: 'in_progress', label: 'En curso', accent: 'bg-indigo-500' },
  { key: 'blocked', label: 'Bloqueada', accent: 'bg-rose-500' },
  { key: 'done', label: 'Hecha', accent: 'bg-emerald-500' },
];

const PRIORITY_VARIANT: Record<string, any> = {
  low: 'neutral',
  normal: 'info',
  high: 'warning',
  urgent: 'danger',
};
const PRIORITY_LABEL: Record<string, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

const SELECT_CLS =
  'w-full px-3 py-2 rounded-xs border border-line dark:border-ink-700 bg-white dark:bg-ink-800 text-sm text-ink-900 dark:text-slate-100 focus:outline-none focus:border-accent';

const empty = (): Partial<Task> => ({
  title: '',
  status: 'todo',
  priority: 'normal',
  progress: 0,
});

export const Tasks: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [editing, setEditing] = useState<Partial<Task> | null>(null);
  const [filter, setFilter] = useState({ projectId: '', assigneeId: '' });

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  const fetchAll = async () => {
    const params = new URLSearchParams();
    if (filter.projectId) params.set('projectId', filter.projectId);
    if (filter.assigneeId) params.set('assigneeId', filter.assigneeId);
    const [t, e, p] = await Promise.all([
      hrApi.get<any>(`/api/hr/tasks?${params}`),
      hrApi.get<any>('/api/hr/employees'),
      hrApi.get<any>('/api/internal-orders').catch(() => []),
    ]);
    setRows(Array.isArray(t) ? t : []);
    setEmployees(Array.isArray(e) ? e : []);
    setProjects(Array.isArray(p) ? p : []);
  };
  useEffect(() => {
    if (user?.tenantId) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, filter.projectId, filter.assigneeId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.title) {
      toast.error('Título obligatorio');
      return;
    }
    const isNew = !editing.id;
    const r = await hrApi.raw(isNew ? 'POST' : 'PATCH', isNew ? '/api/hr/tasks' : `/api/hr/tasks/${editing.id}`, editing);
    if (!r.ok) {
      const d = r.data;
      toast.error(d.error || 'Error');
      return;
    }
    setEditing(null);
    fetchAll();
  };

  const remove = async (t: Task) => {
    if (!confirm(`¿Borrar tarea ${t.code}?`)) return;
    await hrApi.raw('DELETE', `/api/hr/tasks/${t.id}`);
    fetchAll();
  };

  const moveTo = async (t: Task, status: Task['status']) => {
    if (t.status === status) return;
    await hrApi.raw('PATCH', `/api/hr/tasks/${t.id}`, { status });
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <ListTodo className="text-accent" size={22} />
          <div>
            <h1 className="text-xl font-bold text-ink-900 dark:text-slate-100 leading-tight">
              Tareas
            </h1>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              Planificador ligero · arrastra una tarea a otra columna para cambiar de estado
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setEditing(empty())}>
          <Plus size={14} /> Nueva tarea
        </Button>
      </div>

      {/* Filtros */}
      <Card noPadding>
        <div className="p-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
              Proyecto
            </label>
            <select
              value={filter.projectId}
              onChange={(e) => setFilter({ ...filter, projectId: e.target.value })}
              className={SELECT_CLS}
            >
              <option value="">Todos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
              Asignada a
            </label>
            <select
              value={filter.assigneeId}
              onChange={(e) => setFilter({ ...filter, assigneeId: e.target.value })}
              className={SELECT_CLS}
            >
              <option value="">Todos</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </select>
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
                          <select
                            onClick={(e) => e.stopPropagation()}
                            value={t.status}
                            onChange={(e) => moveTo(t, e.target.value as Task['status'])}
                            className="flex-1 text-[10px] px-1.5 py-1 rounded-xs border border-line dark:border-ink-700 bg-transparent text-ink-700 dark:text-ink-300"
                          >
                            <option value="todo">Por hacer</option>
                            <option value="in_progress">En curso</option>
                            <option value="blocked">Bloqueada</option>
                            <option value="done">Hecha</option>
                            <option value="cancelled">Cancelada</option>
                          </select>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              remove(t);
                            }}
                            className="p-1 rounded-xs text-ink-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                            title="Borrar"
                          >
                            <Trash2 size={12} />
                          </button>
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
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="p-1 rounded-xs text-ink-400 hover:text-ink-700 dark:hover:text-slate-200"
                >
                  <X size={18} />
                </button>
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
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
                    Estado
                  </label>
                  <select
                    value={editing.status || 'todo'}
                    onChange={(e) => setEditing({ ...editing, status: e.target.value as any })}
                    className={SELECT_CLS}
                  >
                    <option value="backlog">Backlog</option>
                    <option value="todo">Por hacer</option>
                    <option value="in_progress">En curso</option>
                    <option value="blocked">Bloqueada</option>
                    <option value="done">Hecha</option>
                    <option value="cancelled">Cancelada</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
                    Prioridad
                  </label>
                  <select
                    value={editing.priority || 'normal'}
                    onChange={(e) => setEditing({ ...editing, priority: e.target.value as any })}
                    className={SELECT_CLS}
                  >
                    <option value="low">Baja</option>
                    <option value="normal">Normal</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
                    Asignada a
                  </label>
                  <select
                    value={editing.assigneeId || ''}
                    onChange={(e) => setEditing({ ...editing, assigneeId: e.target.value })}
                    className={SELECT_CLS}
                  >
                    <option value="">— sin asignar —</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.firstName} {e.lastName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
                    Proyecto
                  </label>
                  <select
                    value={editing.internalOrderId || ''}
                    onChange={(e) => setEditing({ ...editing, internalOrderId: e.target.value })}
                    className={SELECT_CLS}
                  >
                    <option value="">— ninguno —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Input
                  label="Inicio"
                  type="date"
                  value={(editing.startDate || '').slice(0, 10)}
                  onChange={(e) => setEditing({ ...editing, startDate: e.target.value })}
                />
                <Input
                  label="Fin"
                  type="date"
                  value={(editing.dueDate || '').slice(0, 10)}
                  onChange={(e) => setEditing({ ...editing, dueDate: e.target.value })}
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
