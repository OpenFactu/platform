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
  PageHeader,
  Select,
  SearchableSelect,
  Modal,
  Kanban,
} from '@openfactu/ui';
import type { BadgeProps, KanbanTone } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { ListTodo, Plus, Trash2, Clock } from 'lucide-react';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';

// Etiquetas de estado en un solo sitio: de aquí salen las columnas del kanban y
// las `options` de los dos desplegables de estado.
// (claves de i18n; se traducen al pintar)
const STATUS_LABEL: Record<Task['status'], string> = {
  backlog: 'hrTalent.tasks.status.backlog',
  todo: 'hrTalent.tasks.status.todo',
  in_progress: 'hrTalent.tasks.status.in_progress',
  blocked: 'hrTalent.tasks.status.blocked',
  done: 'hrTalent.tasks.status.done',
  cancelled: 'hrTalent.tasks.status.cancelled',
};

const COLUMNS: Array<{ key: Task['status']; label: string; tone: KanbanTone }> = [
  { key: 'todo', label: STATUS_LABEL.todo, tone: 'default' },
  { key: 'in_progress', label: STATUS_LABEL.in_progress, tone: 'accent' },
  { key: 'blocked', label: STATUS_LABEL.blocked, tone: 'danger' },
  { key: 'done', label: STATUS_LABEL.done, tone: 'success' },
];

const PRIORITY_VARIANT: Record<string, BadgeProps['variant']> = {
  low: 'neutral',
  normal: 'info',
  high: 'warning',
  urgent: 'error',
};
const PRIORITY_LABEL: Record<string, string> = {
  low: 'hrTalent.tasks.priority.low',
  normal: 'hrTalent.tasks.priority.normal',
  high: 'hrTalent.tasks.priority.high',
  urgent: 'hrTalent.tasks.priority.urgent',
};

const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as Array<Task['status']>).map((value) => ({
  value,
  label: STATUS_LABEL[value],
}));
const PRIORITY_OPTIONS = Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label }));

const empty = (): Partial<Task> => ({
  title: '',
  status: 'todo',
  priority: 'normal',
  progress: 0,
});

export const Tasks: React.FC = () => {
  const { t } = useI18n();
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
      toast.error(t('hrTalent.tasks.titleRequired'));
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
      toast.error(
        err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : t('hr.common.error'),
      );
    }
  };

  const remove = async (task: Task) => {
    const ok = await popup.confirm({
      title: t('hrTalent.tasks.deleteTitle'),
      message: t('hrTalent.tasks.deleteMessage', { code: task.code }),
      tone: 'danger',
      confirmLabel: t('hr.common.delete'),
    });
    if (!ok) return;
    await tasksApi.remove(task.id);
    fetchAll();
  };

  const moveTo = async (t: Task, status: Task['status']) => {
    if (t.status === status) return;
    await tasksApi.update(t.id, { status });
    fetchAll();
  };

  return (
    <div className="p-4 w-full space-y-4">
      {/* Cabecera compacta */}
      <PageHeader
        title={t('hrTalent.tasks.title')}
        subtitle={t('hrTalent.tasks.subtitle')}
        icon={<ListTodo size={18} />}
        size="sm"
        actions={
          <Button type="button" size="sm" onClick={() => setEditing(empty())}>
            <Plus size={14} /> {t('hrTalent.tasks.new')}
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
              {t('hrPayroll.laborCost.project')}
            </label>
            <SearchableSelect
              options={projectOptions}
              value={filter.projectId}
              onChange={(v) => setFilter({ ...filter, projectId: v })}
              placeholder={t('hr.common.all')}
              clearable
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
              {t('hrTalent.tasks.assignedTo')}
            </label>
            <SearchableSelect
              options={employeeOptions}
              value={filter.assigneeId}
              onChange={(v) => setFilter({ ...filter, assigneeId: v })}
              placeholder={t('hr.common.all')}
              clearable
            />
          </div>
          <div className="text-xs text-ink-500 dark:text-ink-400 whitespace-nowrap pb-2">
            {t('hrTalent.tasks.count', { count: rows.length })}
          </div>
        </div>
      </Card>

      {/* Kanban de @openfactu/ui: arrastrar con ratón, Espacio + flechas con
          teclado y menú «mover a…» en móvil. Antes era un tablero a mano con
          arrastre nativo (solo escritorio) y un selector de estado por tarjeta. */}
      <Kanban
        aria-label={t('hrTalent.tasks.kanbanAria')}
        columns={COLUMNS.map((col) => ({
          id: col.key,
          label: t(col.label),
          tone: col.tone,
          emptyMessage: '—',
          cards: rows
            .filter((r) => r.status === col.key)
            .map((task) => {
              const emp = employees.find((e) => e.id === task.assigneeId);
              return {
                id: task.id,
                title: task.title,
                description: <span className="font-mono text-[10px]">{task.code}</span>,
                badges: (
                  <Badge variant={PRIORITY_VARIANT[task.priority]}>
                    {PRIORITY_LABEL[task.priority]
                      ? t(PRIORITY_LABEL[task.priority])
                      : task.priority}
                  </Badge>
                ),
                due: task.dueDate ?? undefined,
                done: task.status === 'done' || task.status === 'cancelled',
                assignees: emp ? [{ name: `${emp.firstName} ${emp.lastName}` }] : [],
                progress:
                  (task.progress ?? 0) > 0
                    ? { done: Math.min(100, Number(task.progress)), total: 100 }
                    : undefined,
                meta: task.estimatedHours ? (
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {Number(task.estimatedHours).toFixed(1)}h
                  </span>
                ) : undefined,
              };
            }),
        }))}
        onCardClick={(card) => {
          const t = rows.find((r) => r.id === card.id);
          if (t) setEditing(t);
        }}
        onCardMove={(card, to) => {
          const t = rows.find((r) => r.id === card.id);
          if (t) void moveTo(t, to.columnId as Task['status']);
        }}
      />

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={
          editing?.id
            ? t('hrTalent.tasks.editTitle', { code: editing.code || t('hrTalent.tasks.taskWord') })
            : t('hrTalent.tasks.new')
        }
        size="2xl"
        onSubmit={save}
        primaryAction={{ label: t('hr.common.save') }}
        tertiaryAction={
          editing?.id
            ? {
                label: t('hr.common.delete'),
                variant: 'danger',
                icon: <Trash2 size={14} />,
                onClick: async () => {
                  await remove(editing as Task);
                  setEditing(null);
                },
              }
            : undefined
        }
      >
        {editing && (
          <div className="space-y-4">
            <Input
              label={t('hrTalent.tasks.titleField')}
              value={editing.title || ''}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              required
            />
            <Input
              label={t('hr.common.description')}
              value={editing.description || ''}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Listas estáticas y cortas → Select, que sí tiene prop `label`. */}
              <Select
                label={t('hr.common.status')}
                options={STATUS_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                value={editing.status || 'todo'}
                onChange={(v) => setEditing({ ...editing, status: v as Task['status'] })}
              />
              <Select
                label={t('hrTalent.tasks.priorityLabel')}
                options={PRIORITY_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                value={editing.priority || 'normal'}
                onChange={(v) => setEditing({ ...editing, priority: v as Task['priority'] })}
              />
              <div>
                {/* Maestros del servidor → SearchableSelect, que no tiene prop
                      `label`: se conserva el <label> suelto. El vacío es válido
                      → clearable. */}
                <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
                  {t('hrTalent.tasks.assignedTo')}
                </label>
                <SearchableSelect
                  options={employeeOptions}
                  value={editing.assigneeId || ''}
                  onChange={(v) => setEditing({ ...editing, assigneeId: v })}
                  placeholder={t('hrTalent.tasks.unassigned')}
                  clearable
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
                  {t('hrPayroll.laborCost.project')}
                </label>
                <SearchableSelect
                  options={projectOptions}
                  value={editing.internalOrderId || ''}
                  onChange={(v) => setEditing({ ...editing, internalOrderId: v })}
                  placeholder={t('hrTalent.tasks.none')}
                  clearable
                />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <DatePicker
                label={t('hrTime.shiftTemplates.start')}
                value={(editing.startDate || '').slice(0, 10) || null}
                onChange={(v) => setEditing({ ...editing, startDate: v ?? '' })}
              />
              <DatePicker
                label={t('hrTime.shiftTemplates.end')}
                value={(editing.dueDate || '').slice(0, 10) || null}
                onChange={(v) => setEditing({ ...editing, dueDate: v ?? '' })}
              />
              <Input
                label={t('hrTalent.tasks.estimatedHours')}
                type="number"
                step="0.5"
                value={String(editing.estimatedHours ?? '')}
                onChange={(e) => setEditing({ ...editing, estimatedHours: e.target.value })}
              />
              <Input
                label={t('hrTalent.tasks.progress')}
                type="number"
                min={0}
                max={100}
                value={String(editing.progress ?? 0)}
                onChange={(e) => setEditing({ ...editing, progress: Number(e.target.value) })}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Tasks;
