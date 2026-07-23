import { tasksApi, employeesApi } from '../api';
import type { Task } from '../domain/task';
import type { Employee } from '../domain/employee';
import { internalOrdersApi, type InternalOrder } from '@/modules/analytics/api/internalOrdersApi';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Button, Input, useToast, cn } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { useTabs } from '@/context/TabsContext';
import { CalendarRange, ChevronLeft, ChevronRight, GanttChart, Plus, X } from 'lucide-react';
import { ApiError } from '@/shared/http';

const STATUS_COLOR: Record<string, string> = {
  todo: 'bg-slate-400 dark:bg-slate-500',
  in_progress: 'bg-indigo-500',
  blocked: 'bg-rose-500',
  done: 'bg-emerald-500',
  cancelled: 'bg-slate-300 dark:bg-slate-600',
  backlog: 'bg-slate-500',
};

const HOUR_START = 6;
const HOUR_END = 22; // exclusivo
const HOUR_PX = 36; // alto de cada fila de hora
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // L=0..D=6
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

type View = 'week' | 'month';

export const Gantt: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const { openTab } = useTabs();
  const [quickCreate, setQuickCreate] = useState<{ title: string; assigneeId: string } | null>(
    null,
  );
  const today = new Date();
  const [view, setView] = useState<View>('week');
  const [cursor, setCursor] = useState<Date>(startOfWeek(today));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<InternalOrder[]>([]);
  const [filterProject, setFilterProject] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  const days = view === 'week' ? 7 : 42;
  const fromDate = view === 'week' ? cursor : new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthStart = view === 'month' ? startOfWeek(fromDate) : fromDate;
  const range = useMemo(() => {
    const start = view === 'week' ? cursor : monthStart;
    return { from: start, to: addDays(start, days - 1) };
  }, [cursor, view, days, monthStart]);

  const fetchAll = async () => {
    const [g, e, p] = await Promise.all([
      tasksApi.gantt({
        from: ymd(range.from),
        to: ymd(range.to),
        projectId: filterProject || undefined,
      }),
      employeesApi.list(),
      internalOrdersApi.list().catch(() => []),
    ]);
    setTasks(g.tasks || []);
    setEmployees(Array.isArray(e) ? e : []);
    setProjects(Array.isArray(p) ? p : []);
  };
  useEffect(() => {
    if (user?.tenantId) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, cursor.getTime(), view, filterProject]);

  const navigate = (dir: -1 | 1) => {
    const next = new Date(cursor);
    if (view === 'week') next.setDate(next.getDate() + dir * 7);
    else next.setMonth(next.getMonth() + dir);
    setCursor(view === 'week' ? startOfWeek(next) : next);
  };
  const goToday = () => {
    const now = new Date();
    const target =
      view === 'week' ? startOfWeek(now) : new Date(now.getFullYear(), now.getMonth(), 1);
    // Si ya estamos en la fecha, refetch igualmente.
    if (cursor.getTime() === target.getTime()) {
      fetchAll();
    } else {
      setCursor(target);
    }
  };

  const todayStr = ymd(new Date());

  // Patch genérico.
  const patchTask = async (id: string, body: any): Promise<boolean> => {
    try {
      await tasksApi.update(id, body);
      return true;
    } catch {
      toast.error('No se pudo guardar');
      return false;
    }
  };

  // Mover una tarea a un día concreto (sin hora). Mantiene duración si tenía.
  const moveTask = async (t: Task, newStart: Date) => {
    if (!t.startDate || !t.dueDate) {
      const newStartStr = ymd(newStart);
      await patchTask(t.id, {
        startDate: newStartStr,
        dueDate: newStartStr,
        startAt: null,
        endAt: null,
      });
    } else {
      const oldStart = new Date(t.startDate);
      const oldEnd = new Date(t.dueDate);
      const span = Math.round((oldEnd.getTime() - oldStart.getTime()) / 86400000);
      const ns = ymd(newStart);
      const ne = ymd(addDays(newStart, span));
      const ok = await patchTask(t.id, {
        startDate: ns,
        dueDate: ne,
        startAt: null,
        endAt: null,
      });
      if (!ok) return;
    }
    fetchAll();
  };

  // Mover a una hora concreta del día (modo calendario semanal).
  const moveTaskToHour = async (t: Task, day: Date, hour: number) => {
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    // Duración: estimatedHours si la hay, sino la duración previa o 1h.
    let durMs = 60 * 60 * 1000;
    if (t.estimatedHours) {
      const h = Number(t.estimatedHours);
      if (h > 0) durMs = h * 60 * 60 * 1000;
    } else if (t.startAt && t.endAt) {
      durMs = new Date(t.endAt).getTime() - new Date(t.startAt).getTime();
    }
    const end = new Date(start.getTime() + Math.max(durMs, 30 * 60 * 1000));
    const ok = await patchTask(t.id, {
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      startDate: ymd(start),
      dueDate: ymd(end),
    });
    if (ok) fetchAll();
  };

  // Drag & drop entre días.
  const dragRef = useRef<{ taskId: string } | null>(null);
  const onDragStart = (taskId: string) => (e: React.DragEvent) => {
    dragRef.current = { taskId };
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDropDay = (day: Date) => () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const t = tasks.find((x) => x.id === drag.taskId);
    if (!t) return;
    moveTask(t, day);
  };
  const onDropHour = (day: Date, hour: number) => () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const t = tasks.find((x) => x.id === drag.taskId);
    if (!t) return;
    moveTaskToHour(t, day, hour);
  };

  return (
    <div className="p-4 w-full space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <CalendarRange className="text-accent" size={22} />
          <div>
            <h1 className="text-xl font-bold text-ink-900 dark:text-slate-100 leading-tight">
              Calendario de tareas
            </h1>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              Arrastra una tarea a otro día para reprogramarla
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="h-8 px-2 rounded-xs border border-line dark:border-ink-700 bg-white dark:bg-ink-800 text-xs font-medium text-ink-900 dark:text-slate-100 focus:outline-none focus:border-accent"
          >
            <option value="">Todos los proyectos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-xs border border-line dark:border-ink-700 overflow-hidden h-8">
            {(['week', 'month'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 text-xs font-bold transition-colors',
                  view === v
                    ? 'bg-accent text-white'
                    : 'bg-white dark:bg-ink-800 text-ink-700 dark:text-slate-200 hover:bg-line-2 dark:hover:bg-ink-700',
                )}
              >
                {v === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
          <Button size="sm" variant="secondary" onClick={() => navigate(-1)} title="Anterior">
            <ChevronLeft size={14} />
          </Button>
          <Button size="sm" variant="secondary" onClick={goToday}>
            Hoy
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate(1)} title="Siguiente">
            <ChevronRight size={14} />
          </Button>
          <Button size="sm" onClick={() => setQuickCreate({ title: '', assigneeId: '' })}>
            <Plus size={14} /> Nueva tarea
          </Button>
        </div>
      </div>

      <div className="text-xs font-bold text-ink-700 dark:text-slate-200">
        {view === 'week'
          ? `Semana del ${range.from.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} al ${range.to.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`
          : cursor.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
      </div>

      {view === 'week' ? (
        <WeekView
          weekStart={cursor}
          tasks={tasks}
          employees={employees}
          todayStr={todayStr}
          onDragStart={onDragStart}
          onDropDay={onDropDay}
          onDropHour={onDropHour}
          onClickTask={setEditing}
          onResizeEnd={async (t, newEnd) => {
            const ok = await patchTask(t.id, {
              endAt: newEnd.toISOString(),
              dueDate: ymd(newEnd),
            });
            if (ok) fetchAll();
          }}
        />
      ) : (
        <MonthView
          monthCursor={cursor}
          tasks={tasks}
          todayStr={todayStr}
          onDragStart={onDragStart}
          onDropDay={onDropDay}
          onClickTask={setEditing}
        />
      )}
      <UnscheduledPanel
        tasks={tasks.filter((t) => !t.startDate || !t.dueDate)}
        employees={employees}
        onDragStart={onDragStart}
        onClickTask={setEditing}
      />

      <div className="flex items-center gap-3 text-[11px] text-ink-500 dark:text-ink-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-none bg-indigo-500" /> En curso
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-none bg-rose-500" /> Bloqueada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-none bg-emerald-500" /> Hecha
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-none bg-slate-400" /> Por hacer
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <GanttChart size={12} /> Para editar fechas/horas, abre la tarea
        </span>
      </div>

      {editing && (
        <TaskQuickView
          task={editing}
          employees={employees}
          onClose={() => setEditing(null)}
          onEditFull={() => {
            openTab('/hr/tasks');
            setEditing(null);
          }}
        />
      )}

      {quickCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setQuickCreate(null)}
        >
          <Card className="max-w-md w-full" noPadding>
            <form
              onClick={(e) => e.stopPropagation()}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!quickCreate.title.trim()) {
                  toast.error('Título obligatorio');
                  return;
                }
                try {
                  await tasksApi.create({
                    title: quickCreate.title.trim(),
                    status: 'todo',
                    priority: 'normal',
                    progress: 0,
                    assigneeId: quickCreate.assigneeId || null,
                  });
                  setQuickCreate(null);
                  fetchAll();
                  toast.success('Tarea creada · arrástrala a un día para programarla');
                } catch (err) {
                  toast.error(
                    err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'No se pudo crear',
                  );
                }
              }}
              className="p-4 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-line dark:border-ink-700 pb-2">
                <h3 className="text-base font-bold text-ink-900 dark:text-slate-100">
                  Nueva tarea
                </h3>
                <button
                  type="button"
                  onClick={() => setQuickCreate(null)}
                  className="p-1 rounded-xs text-ink-400 hover:text-ink-700 dark:hover:text-slate-200"
                >
                  <X size={16} />
                </button>
              </div>
              <Input
                label="Título"
                value={quickCreate.title}
                onChange={(e) => setQuickCreate({ ...quickCreate, title: e.target.value })}
                autoFocus
                required
              />
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
                  Asignada a (opcional)
                </label>
                <select
                  value={quickCreate.assigneeId}
                  onChange={(e) => setQuickCreate({ ...quickCreate, assigneeId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xs border border-line dark:border-ink-700 bg-white dark:bg-ink-800 text-sm text-ink-900 dark:text-slate-100 focus:outline-none focus:border-accent"
                >
                  <option value="">— sin asignar —</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.firstName} {e.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-ink-500 dark:text-ink-400">
                Se creará sin fechas. Arrástrala desde "Sin programar" a un día del calendario para
                programarla.
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-line dark:border-ink-700">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setQuickCreate(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm">
                  Crear
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Gantt;

// ────────────────────────────── Week view ──────────────────────────────

const WeekView: React.FC<{
  weekStart: Date;
  tasks: Task[];
  employees: any[];
  todayStr: string;
  onDragStart: (id: string) => (e: React.DragEvent) => void;
  onDropDay: (d: Date) => () => void;
  onDropHour: (d: Date, h: number) => () => void;
  onClickTask: (t: Task) => void;
  onResizeEnd: (t: Task, newEnd: Date) => void | Promise<void>;
}> = ({
  weekStart,
  tasks,
  employees,
  todayStr,
  onDragStart,
  onDropDay,
  onDropHour,
  onClickTask,
  onResizeEnd,
}) => {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  // All-day = tareas con fechas pero sin startAt/endAt.
  const allDayByDay = (day: Date) => {
    const ds = ymd(day);
    return tasks.filter((t) => {
      if (t.startAt) return false;
      if (!t.startDate || !t.dueDate) return false;
      return t.startDate.slice(0, 10) <= ds && t.dueDate.slice(0, 10) >= ds;
    });
  };
  // Tareas con hora concreta de un día
  const hourTasksOfDay = (day: Date) => {
    const ds = ymd(day);
    return tasks.filter((t) => {
      if (!t.startAt || !t.endAt) return false;
      return t.startAt.slice(0, 10) === ds;
    });
  };

  const totalHeight = (HOUR_END - HOUR_START) * HOUR_PX;

  return (
    <Card noPadding className="overflow-hidden">
      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {/* Cabecera + all-day band en grid */}
        <div className="grid" style={{ gridTemplateColumns: '60px repeat(7, minmax(0, 1fr))' }}>
          <div className="bg-line-2/40 dark:bg-ink-900 border-b border-r border-line dark:border-ink-700 sticky top-0 z-20" />
          {days.map((d) => {
            const isToday = ymd(d) === todayStr;
            const isWeekend = [0, 6].includes(d.getDay());
            return (
              <div
                key={d.toISOString()}
                className={cn(
                  'sticky top-0 z-20 border-b border-r border-line dark:border-ink-700 px-2 py-2 text-center',
                  isToday
                    ? 'bg-accent/10 text-accent'
                    : isWeekend
                      ? 'bg-line-2/40 dark:bg-ink-900/60 text-ink-500 dark:text-ink-400'
                      : 'bg-white dark:bg-ink-900 text-ink-700 dark:text-slate-200',
                )}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider">
                  {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][(d.getDay() + 6) % 7]}
                </div>
                <div className={cn('text-lg font-black leading-tight', isToday && 'text-accent')}>
                  {d.getDate()}
                </div>
              </div>
            );
          })}

          {/* All-day band */}
          <div className="bg-line-2/40 dark:bg-ink-900 border-b border-r border-line dark:border-ink-700 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 sticky left-0 z-10">
            Todo&nbsp;el&nbsp;día
          </div>
          {days.map((d) => {
            const list = allDayByDay(d);
            const isToday = ymd(d) === todayStr;
            const isWeekend = [0, 6].includes(d.getDay());
            return (
              <div
                key={`all-${d.toISOString()}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDropDay(d)}
                className={cn(
                  'border-b border-r border-line dark:border-ink-700 px-1 py-1 space-y-1 min-h-[44px]',
                  isToday
                    ? 'bg-accent/5'
                    : isWeekend
                      ? 'bg-line-2/30 dark:bg-ink-900/40'
                      : 'bg-white dark:bg-ink-900',
                )}
              >
                {list.map((t) => (
                  <TaskBlock
                    key={`${t.id}-${ymd(d)}`}
                    task={t}
                    employees={employees}
                    onDragStart={onDragStart(t.id)}
                    onClick={() => onClickTask(t)}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {/* Cuadrícula horaria: gutter horas + 7 columnas-día con bloques absolutos */}
        <div
          className="grid relative"
          style={{ gridTemplateColumns: '60px repeat(7, minmax(0, 1fr))', height: totalHeight }}
        >
          {/* Gutter horas */}
          <div className="relative bg-white dark:bg-ink-900 border-r border-line dark:border-ink-700">
            {HOURS.map((h, hi) => (
              <div
                key={h}
                className={cn(
                  'absolute left-0 right-0 px-1 text-right text-[10px] font-mono text-ink-400 dark:text-ink-500',
                )}
                style={{ top: hi * HOUR_PX, height: HOUR_PX }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Columnas día */}
          {days.map((d) => {
            const isToday = ymd(d) === todayStr;
            const isWeekend = [0, 6].includes(d.getDay());
            const dayTasks = hourTasksOfDay(d);
            return (
              <div
                key={`col-${d.toISOString()}`}
                className={cn(
                  'relative border-r border-line dark:border-ink-700',
                  isToday
                    ? 'bg-accent/5'
                    : isWeekend
                      ? 'bg-line-2/20 dark:bg-ink-900/40'
                      : 'bg-white dark:bg-ink-900',
                )}
              >
                {/* Drop zones por hora (líneas + drop) */}
                {HOURS.map((h, hi) => (
                  <div
                    key={`drop-${h}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={onDropHour(d, h)}
                    className={cn(
                      'absolute left-0 right-0',
                      hi !== HOURS.length - 1 && 'border-b border-line/60 dark:border-ink-800',
                    )}
                    style={{ top: hi * HOUR_PX, height: HOUR_PX }}
                  />
                ))}
                {/* Bloques de tarea posicionados */}
                {dayTasks.map((t) => (
                  <HourTaskBlock
                    key={t.id}
                    task={t}
                    employees={employees}
                    day={d}
                    onDragStart={onDragStart(t.id)}
                    onClick={() => onClickTask(t)}
                    onResizeEnd={onResizeEnd}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};

// Bloque de tarea posicionada por hora con resize en el borde inferior.
const HourTaskBlock: React.FC<{
  task: Task;
  employees: any[];
  day: Date;
  onDragStart: (e: React.DragEvent) => void;
  onClick: () => void;
  onResizeEnd: (t: Task, newEnd: Date) => void | Promise<void>;
}> = ({ task, employees, day, onDragStart, onClick, onResizeEnd }) => {
  const start = new Date(task.startAt!);
  const end = new Date(task.endAt!);
  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;
  // Si el bloque no está dentro de las horas visibles, lo recortamos.
  const top = Math.max(0, (startHour - HOUR_START) * HOUR_PX);
  const bottom = Math.min((HOUR_END - HOUR_START) * HOUR_PX, (endHour - HOUR_START) * HOUR_PX);
  const height = Math.max(20, bottom - top);
  const emp = employees.find((e) => e.id === task.assigneeId);
  const color = STATUS_COLOR[task.status] || STATUS_COLOR.todo;

  // Resize handler.
  const [resizing, setResizing] = useState(false);
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    const startY = e.clientY;
    const initialHeight = height;
    const onMove = (ev: MouseEvent) => {
      const dy = ev.clientY - startY;
      // Snap a 15 minutos.
      const newHeight = Math.max(HOUR_PX / 4, initialHeight + dy);
      const newDurHours = newHeight / HOUR_PX;
      const snapped = Math.round(newDurHours * 4) / 4; // 0.25h
      const el = document.getElementById(`task-block-${task.id}`);
      if (el) el.style.height = `${snapped * HOUR_PX}px`;
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setResizing(false);
      const dy = ev.clientY - startY;
      const newDurHours = Math.max(0.25, (initialHeight + dy) / HOUR_PX);
      const snapped = Math.round(newDurHours * 4) / 4;
      const newEnd = new Date(start.getTime() + snapped * 60 * 60 * 1000);
      onResizeEnd(task, newEnd);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  void day;

  return (
    <div
      id={`task-block-${task.id}`}
      draggable={!resizing}
      onDragStart={onDragStart}
      onClick={onClick}
      style={{ top, height, left: 4, right: 4 }}
      className={cn(
        'absolute z-10 px-2 py-1 text-white text-[11px] font-semibold cursor-pointer overflow-hidden shadow-sm hover:shadow rounded-xs',
        color,
      )}
      title={`${task.title} ${start.toTimeString().slice(0, 5)}–${end.toTimeString().slice(0, 5)}`}
    >
      <div className="text-[9px] opacity-90 leading-tight">
        {start.toTimeString().slice(0, 5)}–{end.toTimeString().slice(0, 5)}
      </div>
      <div className="truncate leading-tight">{task.title}</div>
      {height > 56 && emp && (
        <div className="text-[9px] opacity-90 truncate font-normal">
          {emp.firstName} {emp.lastName}
        </div>
      )}
      {/* Resize handle */}
      <div
        onMouseDown={onResizeStart}
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize bg-black/10 hover:bg-black/30"
        title="Arrastra para cambiar la duración"
      />
    </div>
  );
};

const UnscheduledPanel: React.FC<{
  tasks: Task[];
  employees: any[];
  onDragStart: (id: string) => (e: React.DragEvent) => void;
  onClickTask: (t: Task) => void;
}> = ({ tasks, employees, onDragStart, onClickTask }) => {
  return (
    <Card noPadding>
      <div className="px-3 py-2 border-b border-line dark:border-ink-700 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Sin programar
        </span>
        <span className="text-[10px] font-bold text-ink-500 dark:text-ink-400 bg-line-2/70 dark:bg-ink-800 px-1.5 py-0.5 rounded-xs">
          {tasks.length}
        </span>
        <span className="text-[11px] text-ink-500 dark:text-ink-400 ml-2">
          Arrastra una tarjeta a un día del calendario para programarla
        </span>
      </div>
      <div className="p-2 flex flex-wrap gap-1.5 min-h-[44px]">
        {tasks.length === 0 ? (
          <p className="text-[11px] text-ink-400 dark:text-ink-500 italic px-1 py-1">
            No hay tareas sin programar
          </p>
        ) : (
          tasks.map((t) => (
            <TaskBlock
              key={t.id}
              task={t}
              employees={employees}
              onDragStart={onDragStart(t.id)}
              onClick={() => onClickTask(t)}
              compact
            />
          ))
        )}
      </div>
    </Card>
  );
};

// ────────────────────────────── Month view ──────────────────────────────

const MonthView: React.FC<{
  monthCursor: Date;
  tasks: Task[];
  todayStr: string;
  onDragStart: (id: string) => (e: React.DragEvent) => void;
  onDropDay: (d: Date) => () => void;
  onClickTask: (t: Task) => void;
}> = ({ monthCursor, tasks, todayStr, onDragStart, onDropDay, onClickTask }) => {
  const monthStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const start = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const tasksByDay = (day: Date) => {
    const ds = ymd(day);
    return tasks.filter((t) => {
      if (!t.startDate || !t.dueDate) return false;
      return t.startDate.slice(0, 10) <= ds && t.dueDate.slice(0, 10) >= ds;
    });
  };
  return (
    <Card noPadding className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line dark:border-ink-700">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((n) => (
          <div
            key={n}
            className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 text-center bg-line-2/40 dark:bg-ink-900 border-r border-line dark:border-ink-700 last:border-r-0"
          >
            {n}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const isToday = ymd(d) === todayStr;
          const isWeekend = [0, 6].includes(d.getDay());
          const isOtherMonth = d.getMonth() !== monthCursor.getMonth();
          const list = tasksByDay(d);
          return (
            <div
              key={d.toISOString()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDropDay(d)}
              className={cn(
                'min-h-[110px] border-r border-b border-line dark:border-ink-700 p-1.5 space-y-1',
                isToday && 'bg-accent/5',
                isWeekend && !isToday && 'bg-line-2/20 dark:bg-ink-900/40',
                isOtherMonth && 'opacity-50',
              )}
            >
              <div
                className={cn(
                  'text-[11px] font-bold',
                  isToday ? 'text-accent' : 'text-ink-700 dark:text-slate-200',
                )}
              >
                {d.getDate()}
              </div>
              {list.slice(0, 4).map((t) => (
                <div
                  key={`${t.id}-${ymd(d)}`}
                  draggable
                  onDragStart={onDragStart(t.id)}
                  onClick={() => onClickTask(t)}
                  className={cn(
                    'rounded-xs px-1.5 py-0.5 text-[10px] font-semibold text-white truncate cursor-pointer',
                    STATUS_COLOR[t.status] || STATUS_COLOR.todo,
                  )}
                  title={t.title}
                >
                  {t.title}
                </div>
              ))}
              {list.length > 4 && (
                <div className="text-[10px] text-ink-500 dark:text-ink-400">
                  +{list.length - 4} más
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

// ────────────────────────────── Task block ──────────────────────────────

const TaskBlock: React.FC<{
  task: Task;
  employees: any[];
  onDragStart: (e: React.DragEvent) => void;
  onClick: () => void;
  compact?: boolean;
}> = ({ task, employees, onDragStart, onClick, compact }) => {
  const emp = employees.find((e) => e.id === task.assigneeId);
  const color = STATUS_COLOR[task.status] || STATUS_COLOR.todo;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        'rounded-xs px-2 py-1 text-white text-[11px] font-semibold cursor-pointer shadow-sm hover:shadow truncate',
        color,
        compact && 'text-[10px] px-1.5 py-0.5',
      )}
      title={`${task.title}${emp ? ` · ${emp.firstName} ${emp.lastName}` : ''}${task.estimatedHours ? ` · ${Number(task.estimatedHours).toFixed(1)}h` : ''}`}
    >
      <div className="truncate">{task.title}</div>
      {!compact && (task.code || emp) && (
        <div className="text-[9px] opacity-90 truncate font-normal">
          {task.code}
          {emp ? ` · ${emp.firstName} ${emp.lastName}` : ''}
        </div>
      )}
    </div>
  );
};

// ────────────────────────────── Quick view (modal lite) ──────────────────────────────

const TaskQuickView: React.FC<{
  task: Task;
  employees: any[];
  onClose: () => void;
  onEditFull: () => void;
}> = ({ task, employees, onClose, onEditFull }) => {
  const emp = employees.find((e) => e.id === task.assigneeId);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <Card className="max-w-md w-full" noPadding>
        <div className="p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] font-mono text-ink-400 dark:text-ink-500">
                {task.code}
              </div>
              <h3 className="text-base font-bold text-ink-900 dark:text-slate-100">{task.title}</h3>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-ink-700 dark:text-slate-300">
            <div>
              <div className="text-[10px] uppercase font-bold text-ink-500 dark:text-ink-400">
                Estado
              </div>
              {task.status}
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-ink-500 dark:text-ink-400">
                Prioridad
              </div>
              {task.priority}
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-ink-500 dark:text-ink-400">
                Inicio
              </div>
              {task.startDate?.slice(0, 10) || '—'}
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-ink-500 dark:text-ink-400">
                Fin
              </div>
              {task.dueDate?.slice(0, 10) || '—'}
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-ink-500 dark:text-ink-400">
                Estimadas
              </div>
              {task.estimatedHours ? `${Number(task.estimatedHours).toFixed(1)}h` : '—'}
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-ink-500 dark:text-ink-400">
                Asignada
              </div>
              {emp ? `${emp.firstName} ${emp.lastName}` : '—'}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-line dark:border-ink-700">
            <Button size="sm" variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
            <Button size="sm" onClick={onEditFull}>
              Editar en Tareas
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
