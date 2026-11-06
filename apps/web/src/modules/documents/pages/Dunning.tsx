import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Card,
  Drawer,
  EmptyState,
  KpiCard,
  Loader,
  PageHeader,
  Table,
  Tabs,
} from '@openfactu/ui';
import { BellRing, CheckCircle2, History, Mail } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import { dunningApi } from '../api/salesApi';
import { useDunning } from '../hooks/useDunning';
import { LetterFrame } from '../components/documents/LetterFrame';
import {
  dunningTotals,
  type DunningLetter,
  type DunningLetterDetail,
  type LetterStatus,
  type OverdueCustomer,
} from '../domain/sales';

type View = 'overdue' | 'letters';

const STATUS_VARIANT: Record<LetterStatus, 'success' | 'danger' | 'info'> = {
  sent: 'success',
  failed: 'danger',
  sending: 'info',
};

const CustomerState: React.FC<{ customer: OverdueCustomer }> = ({ customer }) => {
  const { t } = useI18n();
  if (customer.excluded) return <Badge variant="neutral">{t('doc.dunning.excluded')}</Badge>;
  if (customer.claimable <= 0) return <Badge variant="neutral">{t('doc.dunning.notYet')}</Badge>;
  if (!customer.needsLetter) return <Badge variant="info">{t('doc.dunning.waiting')}</Badge>;
  return <Badge variant="warning">{t('doc.dunning.toClaim', { level: customer.level })}</Badge>;
};

/** Lo vencido, por cliente, y lo que ya se ha reclamado. */
export const Dunning: React.FC = () => {
  const { t } = useI18n();
  const fmt = useFormat();
  const navigate = useNavigate();
  const { customers, letters, loading, error } = useDunning();
  const [view, setView] = useState<View>('overdue');
  const [opened, setOpened] = useState<DunningLetterDetail | null>(null);
  const totals = useMemo(() => dunningTotals(customers), [customers]);

  const customerColumns = [
    {
      header: t('doc.partner.customer'),
      card: 'title' as const,
      sortable: true,
      sortAccessor: (row: OverdueCustomer) => row.name,
      accessor: (row: OverdueCustomer) => (
        <div>
          <p className="font-bold text-fg-default leading-tight">{row.name}</p>
          <p className="text-xs text-fg-muted mt-0.5">
            {row.invoices.length === 1
              ? t('doc.dunning.invoiceCountOne')
              : t('doc.dunning.invoiceCount', { count: row.invoices.length })}
            {!row.email && ` · ${t('doc.dunning.noEmail')}`}
          </p>
        </div>
      ),
    },
    {
      header: t('doc.dunning.overdue'),
      align: 'right' as const,
      card: 'meta' as const,
      sortable: true,
      sortAccessor: (row: OverdueCustomer) => row.total,
      accessor: (row: OverdueCustomer) => (
        <span className="font-black text-fg-default tabular-nums">{fmt.money(row.total)}</span>
      ),
    },
    {
      header: t('doc.dunning.oldest'),
      align: 'right' as const,
      sortable: true,
      sortAccessor: (row: OverdueCustomer) => row.oldestDays,
      accessor: (row: OverdueCustomer) => (
        <span className="tabular-nums">
          {row.oldestDays === 1
            ? t('doc.dunning.dayOne')
            : t('doc.dunning.days', { days: row.oldestDays })}
        </span>
      ),
    },
    {
      header: t('doc.dunning.lastLetter'),
      sortable: true,
      sortAccessor: (row: OverdueCustomer) => row.lastLetterAt ?? '',
      accessor: (row: OverdueCustomer) =>
        row.lastLetterAt ? fmt.date(row.lastLetterAt) : t('doc.dunning.never'),
    },
    {
      header: t('doc.common.status'),
      card: 'status' as const,
      align: 'center' as const,
      cell: (row: OverdueCustomer) => <CustomerState customer={row} />,
    },
  ];

  const letterColumns = [
    {
      header: t('doc.partner.customer'),
      card: 'title' as const,
      sortable: true,
      sortAccessor: (row: DunningLetter) => row.name,
      accessor: (row: DunningLetter) => (
        <div>
          <p className="font-bold text-fg-default leading-tight">{row.name}</p>
          <p className="text-xs text-fg-muted mt-0.5">{row.toAddress}</p>
        </div>
      ),
    },
    {
      header: t('doc.common.date'),
      card: 'meta' as const,
      sortable: true,
      sortAccessor: (row: DunningLetter) => row.createdAt,
      accessor: (row: DunningLetter) => fmt.date(row.createdAt),
    },
    {
      header: t('doc.dunning.level'),
      align: 'center' as const,
      accessor: (row: DunningLetter) => row.level,
    },
    {
      header: t('doc.lines.total'),
      align: 'right' as const,
      accessor: (row: DunningLetter) => (
        <span className="tabular-nums">{fmt.money(row.total)}</span>
      ),
    },
    {
      header: t('doc.common.status'),
      card: 'status' as const,
      align: 'center' as const,
      cell: (row: DunningLetter) => (
        <div className="flex flex-wrap justify-center gap-1">
          <Badge variant={STATUS_VARIANT[row.status]}>
            {t(`doc.dunning.status.${row.status}`)}
          </Badge>
          {row.auto && <Badge variant="neutral">{t('doc.dunning.auto')}</Badge>}
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="p-12 flex justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <PageHeader
        title={t('doc.dunning.title')}
        subtitle={t('doc.dunning.subtitle')}
        icon={<BellRing size={18} />}
        size="sm"
        tabs={
          <Tabs
            items={[
              { key: 'overdue', label: t('doc.dunning.tabOverdue'), icon: <BellRing size={14} /> },
              { key: 'letters', label: t('doc.dunning.tabLetters'), icon: <History size={14} /> },
            ]}
            value={view}
            onChange={(key) => setView(key as View)}
          />
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}

      {view === 'overdue' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <KpiCard
              className="col-span-2 sm:col-span-1"
              label={t('doc.dunning.kpiOverdue')}
              value={fmt.money(totals.overdue)}
            />
            <KpiCard label={t('doc.dunning.kpiCustomers')} value={totals.customers} />
            <KpiCard label={t('doc.dunning.kpiToClaim')} value={totals.toClaim} />
          </div>
          <Card className="overflow-hidden" noPadding>
            {customers.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={22} />}
                title={t('doc.dunning.emptyTitle')}
                hint={t('doc.dunning.emptyHint')}
              />
            ) : (
              <Table
                className="max-md:p-3"
                columns={customerColumns}
                data={customers}
                onRowClick={(row: OverdueCustomer) => navigate(`/sales/dunning/${row.partnerId}`)}
              />
            )}
          </Card>
        </>
      )}

      {view === 'letters' && (
        <Card className="overflow-hidden" noPadding>
          {letters.length === 0 ? (
            <EmptyState icon={<Mail size={22} />} title={t('doc.dunning.noLetters')} />
          ) : (
            <Table
              className="max-md:p-3"
              columns={letterColumns}
              data={letters}
              onRowClick={(row: DunningLetter) => {
                dunningApi.letter(row.id).then(setOpened);
              }}
            />
          )}
        </Card>
      )}

      <Drawer
        open={!!opened}
        onClose={() => setOpened(null)}
        title={opened?.subject}
        subtitle={opened?.toAddress}
        size="lg"
      >
        {opened && (
          <div className="space-y-3">
            {opened.error && <Alert tone="danger">{opened.error}</Alert>}
            <LetterFrame html={opened.html} title={opened.subject} />
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default Dunning;
