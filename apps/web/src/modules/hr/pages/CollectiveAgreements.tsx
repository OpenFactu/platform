import { collectiveAgreementsApi } from '../api';
import type { CollectiveAgreement as Agreement } from '../domain/collectiveAgreement';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Button,
  Input,
  DatePicker,
  Table,
  useToast,
  usePopup,
  PageHeader,
} from '@openfactu/ui';
import type { TableColumn, RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { BookOpen, Plus, Pencil, Trash2 } from 'lucide-react';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import { formatNumber } from '@/i18n/format';

const empty = (): Partial<Agreement> => ({
  code: '',
  name: '',
  sector: '',
  validFrom: '',
  validTo: '',
  baseSalary: '0',
  vacationDays: 22,
  weeklyHours: '40',
  documentUrl: '',
  notes: '',
  isActive: true,
});

export const CollectiveAgreements: React.FC = () => {
  const { t } = useI18n();
  const { token, user } = useAuth();
  const { canWrite, canDelete } = usePagePermissions();
  const [rows, setRows] = useState<Agreement[]>([]);
  const [editing, setEditing] = useState<Partial<Agreement> | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const popup = usePopup();
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  const fetchAll = async () => {
    setLoading(true);
    try {
      const d = await collectiveAgreementsApi.list();
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
        await collectiveAgreementsApi.create(editing);
      } else {
        await collectiveAgreementsApi.update(editing.id!, editing);
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

  const remove = async (a: Agreement) => {
    const ok = await popup.confirm({
      title: t('hrPayroll.agreements.deleteTitle'),
      message: t('hrPayroll.agreements.deleteMessage', { code: a.code }),
      tone: 'danger',
      confirmLabel: t('hr.common.delete'),
    });
    if (!ok) return;
    await collectiveAgreementsApi.remove(a.id);
    fetchAll();
  };

  const money = (v: unknown) => `${formatNumber(Number(v || 0), { minimumFractionDigits: 2 })} €`;

  const columns: TableColumn<Agreement>[] = [
    { header: t('hr.common.code'), accessor: 'code', sortable: true, primary: true },
    { header: t('hr.common.name'), accessor: 'name', sortable: true },
    {
      header: t('hrPayroll.agreements.sector'),
      sortable: true,
      sortAccessor: (r) => r.sector || '',
      cell: (r) => <span className="text-fg-muted">{r.sector || '—'}</span>,
    },
    {
      header: t('hrPayroll.agreements.baseSalary'),
      align: 'right',
      sortable: true,
      sortAccessor: (r) => Number(r.baseSalary || 0),
      cell: (r) => <span className="tabular-nums">{money(r.baseSalary)}</span>,
      className: 'tabular-nums',
    },
    {
      header: t('hrPayroll.agreements.vacationShort'),
      accessor: 'vacationDays',
      align: 'right',
      sortable: true,
    },
    {
      header: t('hrPayroll.agreements.weeklyShort'),
      accessor: 'weeklyHours',
      align: 'right',
      sortable: true,
    },
    {
      header: t('hrPayroll.agreements.validity'),
      cell: (r) => (
        <span className="text-xs text-fg-muted">
          {r.validFrom?.slice(0, 10) || '—'} → {r.validTo?.slice(0, 10) || '—'}
        </span>
      ),
    },
  ];

  // Editar/borrar viven en el menú ⋯ de la fila; la Table los ofrece también con
  // click derecho, así no hace falta una columna de botones.
  const rowActions = (r: Agreement): RowAction[] => [
    {
      label: t('hr.common.edit'),
      icon: <Pencil size={14} />,
      disabled: !canWrite,
      onClick: () => setEditing(r),
    },
    {
      label: t('hr.common.delete'),
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => remove(r),
    },
  ];

  return (
    <div className="p-4 w-full space-y-5">
      <PageHeader
        title={t('hrPayroll.agreements.title')}
        subtitle={t('hrPayroll.agreements.subtitle')}
        icon={<BookOpen size={18} />}
        size="lg"
        actions={
          canWrite && (
            <Button type="button" size="sm" onClick={() => setEditing(empty())}>
              <Plus size={14} /> {t('hrPayroll.agreements.new')}
            </Button>
          )
        }
      />

      {editing && (
        <Card noPadding>
          <form onSubmit={save} className="p-6 grid grid-cols-1 md:grid-cols-4 gap-3">
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
            <Input
              label={t('hrPayroll.agreements.sector')}
              value={editing.sector || ''}
              onChange={(e) => setEditing({ ...editing, sector: e.target.value })}
            />
            <DatePicker
              label={t('hrPayroll.agreements.validFrom')}
              value={(editing.validFrom || '').slice(0, 10) || null}
              onChange={(v) => setEditing({ ...editing, validFrom: v ?? '' })}
            />
            <DatePicker
              label={t('hrPayroll.agreements.validTo')}
              value={(editing.validTo || '').slice(0, 10) || null}
              onChange={(v) => setEditing({ ...editing, validTo: v ?? '' })}
            />
            <Input
              label={t('hrPayroll.agreements.baseSalaryYear')}
              type="number"
              step="0.01"
              value={String(editing.baseSalary ?? '0')}
              onChange={(e) => setEditing({ ...editing, baseSalary: e.target.value })}
            />
            <Input
              label={t('hrPayroll.agreements.vacationDays')}
              type="number"
              value={String(editing.vacationDays ?? 22)}
              onChange={(e) => setEditing({ ...editing, vacationDays: Number(e.target.value) })}
            />
            <Input
              label={t('hrPayroll.agreements.weeklyHours')}
              type="number"
              step="0.5"
              value={String(editing.weeklyHours ?? '40')}
              onChange={(e) => setEditing({ ...editing, weeklyHours: e.target.value })}
            />
            <Input
              label={t('hrPayroll.agreements.pdfUrl')}
              value={editing.documentUrl || ''}
              onChange={(e) => setEditing({ ...editing, documentUrl: e.target.value })}
            />
            <div className="md:col-span-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                {t('hr.common.cancel')}
              </Button>
              <Button type="submit" disabled={!canWrite}>
                {t('hr.common.save')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden" noPadding>
        <Table
          className="max-md:p-3"
          columns={columns}
          data={rows}
          isLoading={loading}
          rowActions={rowActions}
          onRowClick={(r) => setEditing(r)}
          emptyMessage={t('hrPayroll.agreements.empty')}
        />
      </Card>
    </div>
  );
};

export default CollectiveAgreements;
