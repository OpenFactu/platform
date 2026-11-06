import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, PageHeader, Table, useToast } from '@openfactu/ui';
import type { TableColumn } from '@openfactu/ui';
import { Plus, Send } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { useI18n } from '@/i18n/I18nContext';
import { paymentBatchesApi } from '../api/bankingApi';
import { BATCH_STATUS_VARIANT, type PaymentBatchRow } from '../domain/banking';

/** Las remesas de cobro y de pago. */
export const PaymentBatches: React.FC = () => {
  const { t } = useI18n();
  const fmt = useFormat();
  const toast = useToast();
  const navigate = useNavigate();
  const { canWrite } = usePagePermissions();
  const [batches, setBatches] = useState<PaymentBatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    paymentBatchesApi
      .list()
      .then(setBatches)
      .catch(() => toast.error(t('banking.batches.loadError')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: TableColumn<PaymentBatchRow>[] = [
    {
      header: t('banking.batches.code'),
      card: 'title',
      cell: (row) => <span className="font-mono font-semibold">{row.code}</span>,
    },
    {
      header: t('banking.batches.kind'),
      card: 'subtitle',
      cell: (row) => t(`banking.batches.kinds.${row.kind}`),
    },
    {
      header: t('banking.batches.account'),
      card: 'meta',
      cell: (row) => row.accountName ?? '—',
    },
    {
      header: t('banking.batches.chargeDate'),
      card: 'meta',
      cell: (row) => <span className="tabular-nums">{fmt.date(row.chargeDate)}</span>,
    },
    {
      header: t('banking.batches.lines'),
      align: 'right',
      card: 'meta',
      cell: (row) => <span className="tabular-nums">{row.lineCount}</span>,
    },
    {
      header: t('banking.batches.total'),
      align: 'right',
      card: 'meta',
      cell: (row) => (
        <span className="tabular-nums font-semibold">{fmt.money(Number(row.total))}</span>
      ),
    },
    {
      header: t('banking.batches.status'),
      card: 'status',
      cell: (row) => (
        <Badge variant={BATCH_STATUS_VARIANT[row.status]}>
          {t(`banking.batches.statuses.${row.status}`)}
        </Badge>
      ),
    },
  ];

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title={t('banking.batches.title')}
        subtitle={t('banking.batches.subtitle')}
        actions={
          canWrite ? (
            <Button className="gap-2" onClick={() => navigate('/banking/batches/new')}>
              <Plus size={16} /> {t('banking.batches.new')}
            </Button>
          ) : undefined
        }
      />
      <Card noPadding>
        {!loading && batches.length === 0 ? (
          <EmptyState
            icon={<Send size={24} />}
            title={t('banking.batches.emptyTitle')}
            hint={t('banking.batches.emptyHint')}
          />
        ) : (
          <Table
            className="max-md:p-3"
            columns={columns}
            data={batches}
            isLoading={loading}
            rowKey={(row) => row.id}
            onRowClick={(row) => navigate(`/banking/batches/${row.id}`)}
          />
        )}
      </Card>
    </div>
  );
};

export default PaymentBatches;
