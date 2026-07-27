/**
 * Calendario de tareas de RRHH.
 *
 * La rejilla (semana y mes), la barra «‹ Hoy ›» con el conmutador de vista, la
 * banda de todo el día, el arrastre para mover un bloque o cambiar su duración
 * y la cola lateral de tareas sin programar los pone el `Calendar` de
 * `@openfactu/ui`. El arrastre solo mueve la vista y avisa una única vez al
 * soltar, así que se guarda con una sola petición.
 *
 * De propio quedan: el filtro por proyecto y el alta rápida de la cabecera, los
 * dos modales (ficha de la tarea y nueva tarea) y la leyenda de colores. Los
 * datos —qué ventana se pide, cómo se traduce una tarea a evento y qué se
 * guarda al reprogramar— viven en `useTaskCalendar`.
 */
import React, { useState } from 'react';
import {
  Button,
  Calendar,
  Card,
  Input,
  PageHeader,
  SearchableSelect,
  useToast,
} from '@openfactu/ui';
import { CalendarRange, Plus, X } from 'lucide-react';
import { useTabs } from '@/context/TabsContext';
import type { Task } from '../domain/task';
import type { Employee } from '../domain/employee';
import { useTaskCalendar } from '../hooks/useTaskCalendar';

/** Mismos colores que usa el `Calendar` para cada estado, para la leyenda. */
const LEYENDA = [
  { label: 'Por hacer', color: 'var(--k-ink-500, #64748b)' },
  { label: 'En curso', color: 'rgb(var(--color-accent-rgb))' },
  { label: 'Bloqueada', color: 'var(--k-danger)' },
  { label: 'Hecha', color: 'var(--k-success)' },
  { label: 'Cancelada', color: 'var(--k-ink-400, #94a3b8)' },
];

export const Gantt: React.FC = () => {
  const toast = useToast();
  const { openTab } = useTabs();
  const cal = useTaskCalendar();

  const [editing, setEditing] = useState<Task | null>(null);
  const [quickCreate, setQuickCreate] = useState<{ title: string; assigneeId: string } | null>(
    null,
  );

  return (
    <div className="p-4 w-full space-y-4">
      <PageHeader
        title="Calendario de tareas"
        subtitle="Arrastra una tarea a otro día u hora para reprogramarla"
        icon={<CalendarRange size={18} />}
        size="sm"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Maestro del servidor → SearchableSelect; el vacío es válido
                («todos los proyectos») → clearable. */}
            <SearchableSelect
              options={cal.projectOptions}
              value={cal.filterProject}
              onChange={(v) => cal.setFilterProject(v)}
              placeholder="Todos los proyectos"
              clearable
              className="w-56"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => setQuickCreate({ title: '', assigneeId: '' })}
            >
              <Plus size={14} /> Nueva tarea
            </Button>
          </div>
        }
      />

      {/* Rejilla, navegación y cola de sin programar: todo del componente. Las
          horas visibles (6–22) y el alto de fila (36px) son sus valores por
          defecto, que son justo los que tenía la página. */}
      <Calendar
        events={cal.events}
        unscheduled={cal.unscheduled}
        view={cal.view}
        onViewChange={cal.setView}
        date={cal.cursor}
        onDateChange={cal.setCursor}
        maxPorDia={4}
        emptyMessage="No hay tareas en estas fechas"
        onEventChange={cal.reprogramar}
        onSchedule={cal.programar}
        onEventClick={(e) => {
          const t = cal.tareaDe(e);
          if (t) setEditing(t);
        }}
        onSlotClick={() => setQuickCreate({ title: '', assigneeId: '' })}
        aria-label="Calendario de tareas"
      />

      <div className="flex items-center gap-3 text-[11px] text-fg-muted flex-wrap">
        {LEYENDA.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-none" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>

      {editing && (
        <TaskQuickView
          task={editing}
          employees={cal.employees}
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
                const ok = await cal.crearTarea(quickCreate.title, quickCreate.assigneeId);
                if (ok) setQuickCreate(null);
              }}
              className="p-4 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-border-default pb-2">
                <h3 className="text-base font-bold text-fg-default">Nueva tarea</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setQuickCreate(null)}
                  title="Cerrar"
                >
                  <X size={16} />
                </Button>
              </div>
              <Input
                label="Título"
                value={quickCreate.title}
                onChange={(e) => setQuickCreate({ ...quickCreate, title: e.target.value })}
                autoFocus
                required
              />
              <div>
                {/* SearchableSelect no tiene prop `label` → se conserva el
                    <label> suelto. El vacío es válido → clearable. */}
                <label className="block text-[10px] font-bold uppercase tracking-wider text-fg-muted mb-1">
                  Asignada a (opcional)
                </label>
                <SearchableSelect
                  options={cal.employeeOptions}
                  value={quickCreate.assigneeId}
                  onChange={(v) => setQuickCreate({ ...quickCreate, assigneeId: v })}
                  placeholder="— sin asignar —"
                  clearable
                />
              </div>
              <p className="text-[11px] text-fg-muted">
                Se creará sin fechas. Arrástrala desde "Sin programar" a un día del calendario para
                programarla.
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
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

// ────────────────────────── Ficha rápida de la tarea ──────────────────────────

const TaskQuickView: React.FC<{
  task: Task;
  employees: Employee[];
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
              <div className="text-[10px] font-mono text-fg-subtle">{task.code}</div>
              <h3 className="text-base font-bold text-fg-default">{task.title}</h3>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-fg-body">
            <div>
              <div className="text-[10px] uppercase font-bold text-fg-muted">Estado</div>
              {task.status}
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-fg-muted">Prioridad</div>
              {task.priority}
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-fg-muted">Inicio</div>
              {task.startDate?.slice(0, 10) || '—'}
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-fg-muted">Fin</div>
              {task.dueDate?.slice(0, 10) || '—'}
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-fg-muted">Estimadas</div>
              {task.estimatedHours ? `${Number(task.estimatedHours).toFixed(1)}h` : '—'}
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-fg-muted">Asignada</div>
              {emp ? `${emp.firstName} ${emp.lastName}` : '—'}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
            <Button type="button" size="sm" variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
            <Button type="button" size="sm" onClick={onEditFull}>
              Editar en Tareas
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
