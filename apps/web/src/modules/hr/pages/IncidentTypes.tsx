import { incidentTypesApi } from '../api';
import type { IncidentType } from '../domain/incident';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  useToast,
  Badge,
  usePopup,
  Checkbox,
  PageHeader,
} from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { AlertOctagon, Plus, Pencil, Trash2 } from 'lucide-react';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';

const empty = (): Partial<IncidentType> => ({
  code: '',
  name: '',
  requiresSubstitution: false,
  affectsPayroll: false,
  consumesLeaveBalance: false,
  requiresDocument: false,
  paid: true,
  color: '#0EA5E9',
  isActive: true,
});

export const IncidentTypes: React.FC = () => {
  const { t } = useI18n();
  const { token, user } = useAuth();
  const [rows, setRows] = useState<IncidentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<IncidentType> | null>(null);
  const toast = useToast();
  const popup = usePopup();
  const fetchAll = async () => {
    setLoading(true);
    try {
      const d = await incidentTypesApi.list();
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
        await incidentTypesApi.create(editing);
      } else {
        await incidentTypesApi.update(editing.id!, editing);
      }
      toast.success(t('hr.common.saved'));
      setEditing(null);
      fetchAll();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : t('hr.common.error'),
      );
    }
  };

  const remove = async (type: IncidentType) => {
    const ok = await popup.confirm({
      title: t('hr.incidentTypes.deactivateTitle', { code: type.code }),
      message: t('hr.incidentTypes.deactivateMessage'),
      tone: 'danger',
    });
    if (!ok) return;
    await incidentTypesApi.remove(type.id);
    fetchAll();
  };

  const columns = [
    { header: t('hr.common.code'), cell: (r: IncidentType) => <code>{r.code}</code> },
    { header: t('hr.common.name'), cell: (r: IncidentType) => r.name },
    {
      header: t('hr.incidentTypes.substitution'),
      cell: (r: IncidentType) =>
        r.requiresSubstitution ? <Badge variant="warning">{t('hr.common.yes')}</Badge> : '—',
    },
    {
      header: t('hr.incidentTypes.payroll'),
      cell: (r: IncidentType) =>
        r.affectsPayroll ? <Badge variant="info">{t('hr.common.yes')}</Badge> : '—',
    },
    {
      header: t('hr.incidentTypes.paidCol'),
      cell: (r: IncidentType) => (r.paid ? t('hr.common.yes') : t('hr.common.no')),
    },
    {
      header: t('hr.common.active'),
      cell: (r: IncidentType) => (r.isActive ? t('hr.common.yes') : t('hr.common.no')),
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que no hace falta duplicarlas
  // en una columna de botones.
  const rowActions = (r: IncidentType): RowAction[] => [
    { label: t('hr.common.edit'), icon: <Pencil size={14} />, onClick: () => setEditing(r) },
    {
      label: t('hr.common.delete'),
      icon: <Trash2 size={14} />,
      destructive: true,
      onClick: () => remove(r),
    },
  ];

  return (
    <div className="p-4 w-full space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title={t('hr.incidentTypes.title')}
        subtitle={t('hr.incidentTypes.subtitle')}
        icon={<AlertOctagon size={18} />}
        size="lg"
        actions={
          <Button type="button" size="sm" onClick={() => setEditing(empty())}>
            <Plus size={14} /> {t('hr.incidentTypes.new')}
          </Button>
        }
      />

      {editing && (
        <Card className="p-6" noPadding>
          <form onSubmit={save} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              {[
                ['requiresSubstitution', t('hr.incidentTypes.requiresSubstitution')],
                ['affectsPayroll', t('hr.incidentTypes.affectsPayroll')],
                ['consumesLeaveBalance', t('hr.incidentTypes.consumesLeave')],
                ['requiresDocument', t('hr.incidentTypes.requiresDocument')],
                ['paid', t('hr.incidentTypes.paid')],
                ['isActive', t('hr.common.active')],
              ].map(([k, lbl]) => (
                // Checkbox no tiene prop `label` → se conserva el <label> envolvente.
                <label key={k} className="flex items-center gap-2 select-none">
                  <Checkbox
                    checked={Boolean((editing as any)[k])}
                    onChange={(checked) => setEditing({ ...editing, [k]: checked })}
                  />
                  {lbl}
                </label>
              ))}
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

export default IncidentTypes;
