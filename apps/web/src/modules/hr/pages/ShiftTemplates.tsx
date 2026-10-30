import { shiftTemplatesApi } from '../api';
import type { ShiftTemplate } from '../domain/shift';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  TimePicker,
  useToast,
  PageHeader,
  ColorInput,
} from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { Clock, Plus, Pencil, Trash2 } from 'lucide-react';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';

const empty = (): Partial<ShiftTemplate> => ({
  code: '',
  name: '',
  startTime: '08:00',
  endTime: '15:00',
  breakMinutes: 0,
  secondStartTime: null,
  secondEndTime: null,
  color: '#6366F1',
  isActive: true,
});

export const ShiftTemplates: React.FC = () => {
  const { t } = useI18n();
  const { token, user } = useAuth();
  const [rows, setRows] = useState<ShiftTemplate[]>([]);
  const [editing, setEditing] = useState<Partial<ShiftTemplate> | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  const fetchAll = async () => {
    setLoading(true);
    try {
      const d = await shiftTemplatesApi.list();
      setRows(Array.isArray(d) ? d : []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (user?.tenantId) fetchAll();
  }, [user?.tenantId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.code || !editing?.name) {
      toast.error(t('hrTime.shiftTemplates.required'));
      return;
    }
    const isNew = !editing.id;
    try {
      if (isNew) {
        await shiftTemplatesApi.create(editing);
      } else {
        await shiftTemplatesApi.update(editing.id!, editing);
      }
      setEditing(null);
      fetchAll();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : t('hr.common.error'),
      );
    }
  };

  const remove = async (t: ShiftTemplate) => {
    await shiftTemplatesApi.remove(t.id);
    fetchAll();
  };

  const columns = [
    {
      header: t('hr.common.color'),
      cell: (r: ShiftTemplate) => (
        <span className="inline-block w-4 h-4 rounded" style={{ background: r.color || '#999' }} />
      ),
    },
    { header: t('hr.common.code'), cell: (r: ShiftTemplate) => <code>{r.code}</code> },
    { header: t('hr.common.name'), cell: (r: ShiftTemplate) => r.name },
    {
      header: t('hrTime.shiftTemplates.schedule'),
      cell: (r: ShiftTemplate) =>
        r.secondStartTime && r.secondEndTime ? (
          <span>
            {r.startTime}–{r.endTime}{' '}
            <span className="text-amber-600 font-bold">
              + {r.secondStartTime}–{r.secondEndTime}
            </span>
          </span>
        ) : (
          `${r.startTime} – ${r.endTime}`
        ),
    },
    { header: t('hrTime.shiftTemplates.breakMin'), cell: (r: ShiftTemplate) => r.breakMinutes },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que no hace falta duplicarlas
  // en una columna de botones.
  const rowActions = (r: ShiftTemplate): RowAction[] => [
    { label: t('hr.common.edit'), icon: <Pencil size={14} />, onClick: () => setEditing(r) },
    {
      label: t('hr.common.delete'),
      icon: <Trash2 size={14} />,
      destructive: true,
      onClick: () => remove(r),
    },
  ];

  return (
    <div className="p-4 w-full space-y-6">
      <PageHeader
        title={t('hrTime.shiftTemplates.title')}
        subtitle={t('hrTime.shiftTemplates.subtitle')}
        icon={<Clock size={18} />}
        size="lg"
        actions={
          <Button type="button" size="sm" onClick={() => setEditing(empty())}>
            <Plus size={14} /> {t('hrTime.shiftTemplates.new')}
          </Button>
        }
      />

      {editing && (
        <Card noPadding>
          <form onSubmit={save} className="p-6 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Input
                label={t('hr.common.code')}
                value={editing.code || ''}
                onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                required
              />
              <div className="md:col-span-2">
                <Input
                  label={t('hr.common.name')}
                  value={editing.name || ''}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  required
                />
              </div>
              <TimePicker
                label={t('hrTime.shiftTemplates.start')}
                value={editing.startTime || '08:00'}
                onChange={(v) => setEditing({ ...editing, startTime: v ?? '' })}
                required
              />
              <TimePicker
                label={t('hrTime.shiftTemplates.end')}
                value={editing.endTime || '15:00'}
                onChange={(v) => setEditing({ ...editing, endTime: v ?? '' })}
                required
              />
              <Input
                label={t('hrTime.shiftTemplates.breakMin')}
                type="number"
                value={editing.breakMinutes ?? 0}
                onChange={(e) =>
                  setEditing({ ...editing, breakMinutes: Number(e.target.value) || 0 })
                }
              />
              {/* ColorInput sí tiene prop `label` → el <label> suelto desaparece. */}
              <ColorInput
                label={t('hr.common.color')}
                value={editing.color || '#6366F1'}
                onChange={(v) => setEditing({ ...editing, color: v })}
              />
            </div>

            {/* Turno partido opcional */}
            <div className="rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-amber-700 dark:text-amber-300">
                    {t('hrTime.shiftTemplates.split')}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t('hrTime.shiftTemplates.splitHint')}
                  </div>
                </div>
                {editing.secondStartTime || editing.secondEndTime ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setEditing({ ...editing, secondStartTime: null, secondEndTime: null })
                    }
                  >
                    {t('hrTime.shiftTemplates.removeSplit')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        secondStartTime: '16:00',
                        secondEndTime: '20:00',
                      })
                    }
                  >
                    {t('hrTime.shiftTemplates.addSplit')}
                  </Button>
                )}
              </div>
              {(editing.secondStartTime || editing.secondEndTime) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TimePicker
                    label={t('hrTime.shiftTemplates.start2')}
                    value={editing.secondStartTime || null}
                    onChange={(v) => setEditing({ ...editing, secondStartTime: v ?? '' })}
                  />
                  <TimePicker
                    label={t('hrTime.shiftTemplates.end2')}
                    value={editing.secondEndTime || null}
                    onChange={(v) => setEditing({ ...editing, secondEndTime: v ?? '' })}
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                {t('hr.common.cancel')}
              </Button>
              <Button type="submit">{t('hr.common.save')}</Button>
            </div>
          </form>
        </Card>
      )}

      <Card noPadding>
        <Table
          className="max-md:p-3"
          columns={columns}
          data={rows}
          isLoading={loading}
          rowActions={rowActions}
        />
      </Card>
    </div>
  );
};

export default ShiftTemplates;
