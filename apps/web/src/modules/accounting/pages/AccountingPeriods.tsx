import React, { useEffect, useState } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  DatePicker,
  Loader,
  PageHeader,
  useToast,
  Badge,
  usePopup,
} from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { formatDate, formatNumber } from '@/i18n/format';
import { Calendar, Plus, Trash2, Lock, AlertTriangle } from 'lucide-react';
import { periodsApi } from '../api';
import type { AccountingPeriod } from '../domain/accounting';

export const AccountingPeriods: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.write;
  const canDelete =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.delete;
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();
  const popup = usePopup();

  const fetchPeriods = async () => {
    setLoading(true);
    try {
      const data = await periodsApi.list();
      setPeriods(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchPeriods();
  }, [user?.tenantId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await periodsApi.create({
        code: code.toUpperCase(),
        name,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        status: 'O',
      });
      setCode('');
      setName('');
      setStartDate('');
      setEndDate('');
      fetchPeriods();
      toast.success(t('accounting.periods.created'));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? t('accounting.common.errorWithMessage', { message: err.message })
          : t('accounting.periods.createError'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const openClosePreview = async (periodId: string) => {
    let preview: any;
    try {
      preview = await periodsApi.closePreview(periodId);
    } catch (err) {
      toast.error((err instanceof Error && err.message) || t('accounting.periods.previewError'));
      return;
    }

    const confirmed = await popup.show<boolean>({
      title: t('accounting.periods.closeTitle', { code: preview.period?.code ?? '' }),
      subtitle: t('accounting.periods.closeSubtitle'),
      tone: 'warning',
      maxWidth: '3xl',
      render: (close) => (
        <ClosePreviewBody
          preview={preview}
          onCancel={() => close(false)}
          onConfirm={() => close(true)}
        />
      ),
    });

    if (!confirmed) return;

    try {
      await periodsApi.close(periodId);
      toast.success(t('accounting.periods.closed'));
      fetchPeriods();
    } catch (err) {
      toast.error((err instanceof Error && err.message) || t('accounting.periods.closeError'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await periodsApi.remove(id);
      fetchPeriods();
      toast.success(t('accounting.periods.deleted'));
    } catch (err) {
      toast.error(t('accounting.common.errorDeleting'));
    }
  };

  const columns = [
    {
      header: t('accounting.common.code'),
      sortable: true,
      sortAccessor: (item: any) => item.code || '',
      accessor: 'code',
    },
    {
      header: t('accounting.common.name'),
      sortable: true,
      sortAccessor: (item: any) => item.name || '',
      accessor: 'name',
    },
    { header: t('accounting.periods.start'), cell: (c: any) => formatDate(c.startDate) },
    { header: t('accounting.periods.end'), cell: (c: any) => formatDate(c.endDate) },
    {
      header: t('accounting.common.status'),
      cell: (c: any) => {
        const overdue = c.status === 'O' && new Date(c.endDate) < new Date();
        return overdue ? (
          <Badge variant="warning">{t('accounting.periods.pendingClose')}</Badge>
        ) : c.status === 'O' ? (
          <Badge variant="success">{t('accounting.periods.open')}</Badge>
        ) : (
          <Badge variant="neutral">{t('accounting.periods.closedStatus')}</Badge>
        );
      },
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que las condiciones de estado
  // y permiso se declaran una vez en lugar de duplicarse.
  const rowActions = (c: any): RowAction[] => [
    ...(c.status === 'O' && canWrite
      ? [
          {
            label: t('accounting.periods.closeAction'),
            icon: <Lock size={14} />,
            onClick: () => openClosePreview(c.id),
          },
        ]
      : []),
    {
      label: t('accounting.common.delete'),
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => handleDelete(c.id),
    },
  ];

  return (
    <div className="p-8 w-full space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title={t('accounting.periods.title')}
        subtitle={t('accounting.periods.subtitle')}
        icon={<Calendar size={18} />}
        size="lg"
      />

      <Card className="border-border-subtle shadow-lg" noPadding>
        <form onSubmit={handleSubmit} className="p-6 flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-[1]">
            <Input
              placeholder={t('accounting.periods.codePlaceholder')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          <div className="flex-[2]">
            <Input
              placeholder={t('accounting.periods.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex-1">
            <DatePicker value={startDate} onChange={(v) => setStartDate(v ?? '')} required />
          </div>
          <div className="flex-1">
            <DatePicker value={endDate} onChange={(v) => setEndDate(v ?? '')} required />
          </div>
          <Button
            type="submit"
            disabled={isSubmitting || !canWrite}
            className="flex items-center gap-2 disabled:opacity-50 disabled:grayscale transition-all"
          >
            {isSubmitting ? <Loader size="sm" variant="white" /> : <Plus size={18} />}
            {t('accounting.common.create')}
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden border-border-subtle" noPadding>
        <Table
          className="max-md:p-3"
          columns={columns}
          data={periods}
          isLoading={loading}
          rowActions={rowActions}
        />
      </Card>
    </div>
  );
};

interface ClosePreviewBodyProps {
  preview: any;
  onCancel: () => void;
  onConfirm: () => void;
}

const ClosePreviewBody: React.FC<ClosePreviewBodyProps> = ({ preview, onCancel, onConfirm }) => {
  const { t } = useI18n();

  /** Líneas del asiento de regularización que se propone al cerrar el período. */
  const previewColumns: TableColumn<any>[] = [
    {
      header: t('accounting.common.account'),
      cell: (l) => <span className="font-mono text-xs">{l.accountId}</span>,
    },
    { header: t('accounting.common.description'), accessor: 'description' },
    {
      header: t('accounting.common.debit'),
      align: 'right',
      cell: (l) => (Number(l.debit) > 0 ? Number(l.debit).toFixed(2) : ''),
    },
    {
      header: t('accounting.common.credit'),
      align: 'right',
      cell: (l) => (Number(l.credit) > 0 ? Number(l.credit).toFixed(2) : ''),
    },
  ];

  return (
    <div className="space-y-6">
      {preview.blockers?.length > 0 && (
        <div className="border border-danger/30 bg-danger-bg rounded-lg p-4 space-y-1">
          <div className="flex items-center gap-2 font-semibold text-danger-fg">
            <AlertTriangle size={16} />
            {t('accounting.periods.blockers')}
          </div>
          <ul className="list-disc ml-6 text-sm text-danger-fg">
            {preview.blockers.map((b: string, i: number) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="font-bold mb-2">
          {t('accounting.periods.regularizationResult')}{' '}
          <span className={preview.resultAmount >= 0 ? 'text-success-fg' : 'text-danger-fg'}>
            {formatNumber(Number(preview.resultAmount), { minimumFractionDigits: 2 })} €
          </span>
        </h3>
        {/* La Table ya trae cabecera y estado vacío: el <table> a mano y el
            párrafo de "sin resultados" sobraban. */}
        <Card className="overflow-hidden" noPadding>
          <Table
            className="max-md:p-3"
            columns={previewColumns}
            data={preview.regularizationLines || []}
            rowKey={(_l, i) => i}
            emptyMessage={t('accounting.periods.noRegularization')}
          />
        </Card>
      </div>

      <div>
        <h3 className="font-bold mb-2">
          {t('accounting.periods.nextPeriod')} <code>{preview.nextPeriodCode}</code> (
          {preview.nextPeriodStart} → {preview.nextPeriodEnd})
        </h3>
        <p className="text-sm text-fg-muted mb-2">
          {t('accounting.periods.openingLines', { count: preview.openingLines?.length || 0 })}
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('accounting.common.cancel')}
        </Button>
        <Button type="button" onClick={onConfirm} disabled={preview.blockers?.length > 0}>
          {t('accounting.periods.confirmClose')}
        </Button>
      </div>
    </div>
  );
};
