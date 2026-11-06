import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Table } from '@openfactu/ui';
import { CalendarClock, Plus, Repeat } from 'lucide-react';
import { ResponsiveActions } from '@/components/common/ResponsiveActions';
import { useAuth } from '@/context/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import { recurringApi } from '../api/salesApi';
import { RECURRING_STATUS_VARIANT, type RecurringDocument } from '../domain/sales';

/** Las facturas que se repiten solas. */
export const RecurringDocuments: React.FC = () => {
  const { t } = useI18n();
  const fmt = useFormat();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    !!user?.permissions?.['/sales/recurring']?.write;
  const [rows, setRows] = useState<RecurringDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    recurringApi
      .list()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const columns = [
    {
      header: t('doc.recurring.name'),
      card: 'title' as const,
      sortable: true,
      sortAccessor: (row: RecurringDocument) => row.name,
      accessor: (row: RecurringDocument) => (
        <span className="font-bold text-fg-default">{row.name}</span>
      ),
    },
    {
      header: t('doc.partner.customer'),
      card: 'subtitle' as const,
      sortable: true,
      sortAccessor: (row: RecurringDocument) => row.partnerName,
      accessor: (row: RecurringDocument) => row.partnerName,
    },
    {
      header: t('doc.recurring.frequency'),
      accessor: (row: RecurringDocument) => t(`doc.recurring.freq.${row.frequency}`),
    },
    {
      header: t('doc.recurring.nextDate'),
      card: 'meta' as const,
      sortable: true,
      sortAccessor: (row: RecurringDocument) => row.nextDate ?? '9999',
      accessor: (row: RecurringDocument) => (row.nextDate ? fmt.date(row.nextDate) : '—'),
    },
    {
      header: t('doc.recurring.net'),
      align: 'right' as const,
      sortable: true,
      sortAccessor: (row: RecurringDocument) => row.net,
      accessor: (row: RecurringDocument) => (
        <span className="tabular-nums">{fmt.money(row.net)}</span>
      ),
    },
    {
      header: t('doc.common.status'),
      card: 'status' as const,
      align: 'center' as const,
      cell: (row: RecurringDocument) => (
        <div className="flex flex-wrap justify-center gap-1">
          <Badge variant={RECURRING_STATUS_VARIANT[row.status]}>
            {t(`doc.recurring.status.${row.status}`)}
          </Badge>
          {row.lastError && <Badge variant="danger">{t('doc.recurring.failed')}</Badge>}
        </div>
      ),
    },
  ];

  const create = () => navigate('/sales/recurring/new');

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <PageHeader
        title={t('doc.recurring.title')}
        subtitle={t('doc.recurring.subtitle')}
        icon={<Repeat size={18} />}
        size="sm"
        actions={
          canWrite && (
            <ResponsiveActions
              source="recurring-list"
              actions={[
                {
                  id: 'new',
                  label: t('doc.recurring.new'),
                  icon: <Plus size={16} />,
                  onClick: create,
                },
              ]}
            >
              <Button onClick={create}>
                <Plus size={14} /> {t('doc.recurring.new')}
              </Button>
            </ResponsiveActions>
          )
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}
      <Card className="overflow-hidden" noPadding>
        {!loading && rows.length === 0 ? (
          <EmptyState
            icon={<CalendarClock size={22} />}
            title={t('doc.recurring.emptyTitle')}
            hint={t('doc.recurring.emptyHint')}
          />
        ) : (
          <Table
            className="max-md:p-3"
            columns={columns}
            data={rows}
            isLoading={loading}
            onRowClick={(row: RecurringDocument) => navigate(`/sales/recurring/${row.id}`)}
          />
        )}
      </Card>
    </div>
  );
};

export default RecurringDocuments;
