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
  DescriptionList,
  Input,
  Modal,
  PageHeader,
  SearchableSelect,
  useToast,
} from '@openfactu/ui';
import { CalendarRange, Plus } from 'lucide-react';
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

      <TaskQuickView
        task={editing}
        employees={cal.employees}
        onClose={() => setEditing(null)}
        onEditFull={() => {
          openTab('/hr/tasks');
          setEditing(null);
        }}
      />

      <Modal
        isOpen={!!quickCreate}
        onClose={() => setQuickCreate(null)}
        title="Nueva tarea"
        size="md"
        onSubmit={async () => {
          if (!quickCreate) return;
          if (!quickCreate.title.trim()) {
            toast.error('Título obligatorio');
            return;
          }
          const ok = await cal.crearTarea(quickCreate.title, quickCreate.assigneeId);
          if (ok) setQuickCreate(null);
        }}
        primaryAction={{ label: 'Crear' }}
      >
        {quickCreate && (
          <div className="space-y-3">
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
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Gantt;

// ────────────────────────── Ficha rápida de la tarea ──────────────────────────

const TaskQuickView: React.FC<{
  task: Task | null;
  employees: Employee[];
  onClose: () => void;
  onEditFull: () => void;
}> = ({ task, employees, onClose, onEditFull }) => {
  const emp = task ? employees.find((e) => e.id === task.assigneeId) : undefined;
  return (
    <Modal
      isOpen={!!task}
      onClose={onClose}
      eyebrow={task?.code}
      title={task?.title}
      size="md"
      primaryAction={{ label: 'Editar en Tareas', onClick: onEditFull }}
      cancelLabel="Cerrar"
    >
      {task && (
        <DescriptionList
          items={[
            { key: 'status', label: 'Estado', value: task.status },
            { key: 'priority', label: 'Prioridad', value: task.priority },
            { key: 'start', label: 'Inicio', value: task.startDate?.slice(0, 10) },
            { key: 'end', label: 'Fin', value: task.dueDate?.slice(0, 10) },
            {
              key: 'hours',
              label: 'Estimadas',
              value: task.estimatedHours ? `${Number(task.estimatedHours).toFixed(1)}h` : null,
            },
            {
              key: 'assignee',
              label: 'Asignada',
              value: emp ? `${emp.firstName} ${emp.lastName}` : null,
            },
          ]}
        />
      )}
    </Modal>
  );
};
