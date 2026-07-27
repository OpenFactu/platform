import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CalendarChange, CalendarEvent, CalendarView } from '@openfactu/ui';
import { useToast } from '@openfactu/ui';
import { employeesApi, tasksApi } from '../api';
import type { Task } from '../domain/task';
import type { Employee } from '../domain/employee';
import { internalOrdersApi, type InternalOrder } from '@/modules/analytics/api/internalOrdersApi';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/shared/http';

/**
 * Datos del calendario de tareas: qué se pide al servidor según la ventana
 * visible, cómo se traduce una tarea a evento del `Calendar` y qué se guarda
 * al reprogramarla. La página se queda solo con la composición.
 */

/** `2026-07-22` en hora local (no UTC: `toISOString()` desplaza de día). */
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/**
 * Una fecha suelta (`2026-07-22`, o el ISO completo que a veces devuelve el
 * servidor) al mediodía local. Mediodía y no medianoche por lo mismo que hace
 * el paquete: sumar días cruzando un cambio de hora puede saltarse una columna.
 */
function parseDia(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // la semana empieza en lunes
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * Estado de la tarea → color del bloque. Cuatro de los seis encajan con el
 * `status` del `CalendarEvent` (que ya trae contraste resuelto en claro y
 * oscuro); «cancelled» no tiene equivalente, así que lleva color propio, y
 * sacado de los tokens del tema, nunca de la paleta fija.
 */
const ESTADO_EVENTO: Record<string, Pick<CalendarEvent, 'status' | 'color' | 'textColor'>> = {
  backlog: { status: 'pendiente' },
  todo: { status: 'pendiente' },
  in_progress: { status: 'en-curso' },
  blocked: { status: 'bloqueada' },
  done: { status: 'hecha' },
  cancelled: { color: 'var(--k-ink-400, #94a3b8)', textColor: 'var(--k-ink-900, #0f172a)' },
};

const MIN_DURACION_MS = 30 * 60 * 1000;

/** Duración que se le da a una tarea al colocarla en la rejilla horaria. */
function duracionMs(t: Task): number {
  if (t.estimatedHours) {
    const h = Number(t.estimatedHours);
    if (h > 0) return Math.max(h * 60 * 60 * 1000, MIN_DURACION_MS);
  }
  if (t.startAt && t.endAt) {
    const prev = new Date(t.endAt).getTime() - new Date(t.startAt).getTime();
    if (prev > 0) return Math.max(prev, MIN_DURACION_MS);
  }
  return 60 * 60 * 1000;
}

export interface TaskCalendarOptions {
  value: string;
  label: string;
  secondaryLabel?: string;
}

export function useTaskCalendar() {
  const { user } = useAuth();
  const toast = useToast();

  const [view, setView] = useState<CalendarView>('week');
  const [cursor, setCursor] = useState<Date>(() => startOfWeek(new Date()));
  const [filterProject, setFilterProject] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<InternalOrder[]>([]);

  // Ventana que se le pide al servidor: la semana del cursor, o las seis
  // semanas que pinta la vista de mes (empezando en el lunes anterior al día 1).
  const range = useMemo(() => {
    if (view === 'week') {
      const from = startOfWeek(cursor);
      return { from, to: addDays(from, 6) };
    }
    const from = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    return { from, to: addDays(from, 41) };
  }, [cursor, view]);

  const refrescar = useCallback(async () => {
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
  }, [range.from, range.to, filterProject]);

  useEffect(() => {
    if (user?.tenantId) refrescar();
  }, [user?.tenantId, refrescar]);

  // ── Tareas → eventos ────────────────────────────────────────────────────

  const nombreEmpleado = useCallback(
    (id: string | null) => {
      if (!id) return null;
      const e = employees.find((x) => x.id === id);
      return e ? `${e.firstName} ${e.lastName}` : null;
    },
    [employees],
  );

  const aEvento = useCallback(
    (t: Task): CalendarEvent => {
      const conHora = Boolean(t.startAt && t.endAt);
      const meta = [t.code, nombreEmpleado(t.assigneeId)].filter(Boolean).join(' · ');
      // Con hora se respeta el instante; sin ella es una barra de todo el día.
      // Las tareas sin fecha van a la cola y ahí da igual el valor, pero el
      // tipo pide fechas: se les pone hoy.
      const hoy = new Date();
      return {
        id: t.id,
        title: t.title,
        start: conHora ? new Date(t.startAt as string) : t.startDate ? parseDia(t.startDate) : hoy,
        end: conHora ? new Date(t.endAt as string) : t.dueDate ? parseDia(t.dueDate) : hoy,
        allDay: !conHora,
        meta: meta || undefined,
        ...(ESTADO_EVENTO[t.status] ?? ESTADO_EVENTO.todo),
      };
    },
    [nombreEmpleado],
  );

  /** Sin fechas = no se puede colocar: va a la cola de «sin programar». */
  const sinFecha = useCallback((t: Task) => !t.startDate || !t.dueDate, []);

  const events = useMemo(
    () => tasks.filter((t) => !sinFecha(t)).map(aEvento),
    [tasks, aEvento, sinFecha],
  );

  const unscheduled = useMemo(
    () => tasks.filter(sinFecha).map((t) => aEvento({ ...t, startAt: null, endAt: null })),
    [tasks, aEvento, sinFecha],
  );

  const tareaDe = useCallback((e: CalendarEvent) => tasks.find((t) => t.id === e.id), [tasks]);

  // ── Guardado ────────────────────────────────────────────────────────────

  const guardar = useCallback(
    async (id: string, body: Record<string, unknown>): Promise<boolean> => {
      try {
        await tasksApi.update(id, body);
        return true;
      } catch {
        toast.error('No se pudo guardar');
        return false;
      }
    },
    [toast],
  );

  /**
   * Fin de un arrastre sobre el calendario: el componente avisa una sola vez
   * con las fechas ya calculadas, así que aquí solo hay una petición.
   */
  const reprogramar = useCallback(
    async (e: CalendarEvent, { start, end }: CalendarChange) => {
      const t = tasks.find((x) => x.id === e.id);
      if (!t) return;
      const body = e.allDay
        ? { startDate: ymd(start), dueDate: ymd(end), startAt: null, endAt: null }
        : {
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            startDate: ymd(start),
            dueDate: ymd(end),
          };
      if (await guardar(t.id, body)) refrescar();
    },
    [tasks, guardar, refrescar],
  );

  /**
   * Una tarjeta de la cola soltada en el calendario. En la vista de mes solo
   * hay día (queda como tarea de todo el día); en la de semana hay hora, y
   * entonces la duración sale de las horas estimadas.
   */
  const programar = useCallback(
    async (e: CalendarEvent, start: Date) => {
      const t = tasks.find((x) => x.id === e.id);
      if (!t) return;
      if (view === 'month') {
        const dia = ymd(start);
        if (await guardar(t.id, { startDate: dia, dueDate: dia, startAt: null, endAt: null })) {
          refrescar();
        }
        return;
      }
      const fin = new Date(start.getTime() + duracionMs(t));
      const ok = await guardar(t.id, {
        startAt: start.toISOString(),
        endAt: fin.toISOString(),
        startDate: ymd(start),
        dueDate: ymd(fin),
      });
      if (ok) refrescar();
    },
    [tasks, view, guardar, refrescar],
  );

  /** Alta rápida: nace sin fechas, en la cola de «sin programar». */
  const crearTarea = useCallback(
    async (title: string, assigneeId: string): Promise<boolean> => {
      try {
        await tasksApi.create({
          title: title.trim(),
          status: 'todo',
          priority: 'normal',
          progress: 0,
          assigneeId: assigneeId || null,
        });
        refrescar();
        toast.success('Tarea creada · arrástrala a un día para programarla');
        return true;
      } catch (err) {
        toast.error(
          err instanceof ApiError
            ? ((err.body as { error?: string } | undefined)?.error ?? err.message)
            : 'No se pudo crear',
        );
        return false;
      }
    },
    [refrescar, toast],
  );

  // ── Maestros de los desplegables ────────────────────────────────────────

  const projectOptions = useMemo<TaskCalendarOptions[]>(
    () => projects.map((p) => ({ value: p.id, label: p.name, secondaryLabel: p.code })),
    [projects],
  );
  const employeeOptions = useMemo<TaskCalendarOptions[]>(
    () =>
      employees.map((e) => ({
        value: e.id,
        label: `${e.firstName} ${e.lastName}`,
        secondaryLabel: e.code,
      })),
    [employees],
  );

  return {
    view,
    setView,
    cursor,
    setCursor,
    filterProject,
    setFilterProject,
    employees,
    events,
    unscheduled,
    tareaDe,
    reprogramar,
    programar,
    crearTarea,
    projectOptions,
    employeeOptions,
  };
}
