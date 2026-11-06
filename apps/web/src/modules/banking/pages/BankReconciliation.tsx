import React, { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SegmentedControl,
  Select,
  Table,
  useToast,
} from '@openfactu/ui';
import type { TableColumn } from '@openfactu/ui';
import { ArrowLeftRight, Upload } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { useI18n } from '@/i18n/I18nContext';
import { bankAccountsApi, bankStatementsApi } from '../api/bankingApi';
import { LineMatchDrawer } from '../components/LineMatchDrawer';
import { StatementImportDrawer } from '../components/StatementImportDrawer';
import type { BankAccountOption, LineStatus, StatementLine } from '../domain/banking';

const STATUS_VARIANT: Record<LineStatus, 'warning' | 'success' | 'neutral'> = {
  open: 'warning',
  matched: 'success',
  ignored: 'neutral',
};

/** Los movimientos del banco de una cuenta, frente a cobros y pagos. */
export const BankReconciliation: React.FC = () => {
  const { t } = useI18n();
  const fmt = useFormat();
  const toast = useToast();
  const { canWrite } = usePagePermissions();
  const [accounts, setAccounts] = useState<BankAccountOption[]>([]);
  const [accountId, setAccountId] = useState('');
  const [status, setStatus] = useState<LineStatus>('open');
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [counts, setCounts] = useState<Record<LineStatus, number>>({
    open: 0,
    matched: 0,
    ignored: 0,
  });
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [opened, setOpened] = useState<StatementLine | null>(null);

  useEffect(() => {
    bankAccountsApi
      .options()
      .then((rows) => {
        setAccounts(rows);
        setAccountId((current) => current || rows[0]?.id || '');
      })
      .catch(() => toast.error(t('banking.accounts.loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const result = await bankStatementsApi.lines(accountId, status);
      setLines(result.lines);
      setCounts(result.counts);
    } catch {
      toast.error(t('banking.reconciliation.loadError'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: TableColumn<StatementLine>[] = [
    {
      header: t('banking.reconciliation.date'),
      width: '12%',
      card: 'meta',
      cell: (row) => <span className="tabular-nums">{fmt.date(row.date)}</span>,
    },
    {
      header: t('banking.reconciliation.description'),
      card: 'title',
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-fg-default">{row.description || '—'}</p>
          {(row.counterparty || row.reference) && (
            <p className="text-xs text-fg-muted">
              {[row.counterparty, row.reference].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      ),
    },
    {
      header: t('banking.reconciliation.amount'),
      width: '14%',
      align: 'right',
      card: 'status',
      cell: (row) => (
        <span
          className={`tabular-nums font-semibold ${Number(row.amount) > 0 ? 'text-success' : 'text-fg-default'}`}
        >
          {fmt.money(Number(row.amount))}
        </span>
      ),
    },
    {
      header: t('banking.reconciliation.status'),
      width: '12%',
      card: 'meta',
      cell: (row) => (
        <Badge variant={STATUS_VARIANT[row.status]}>
          {t(`banking.reconciliation.statuses.${row.status}`)}
        </Badge>
      ),
    },
  ];

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title={t('banking.reconciliation.title')}
        subtitle={t('banking.reconciliation.subtitle')}
        actions={
          canWrite && accountId ? (
            <Button className="gap-2" onClick={() => setImporting(true)}>
              <Upload size={16} /> {t('banking.reconciliation.import')}
            </Button>
          ) : undefined
        }
      />
      {accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ArrowLeftRight size={24} />}
            title={t('banking.reconciliation.noAccountsTitle')}
            hint={t('banking.reconciliation.noAccountsHint')}
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Select
              label={t('banking.reconciliation.account')}
              containerClassName="w-full sm:w-80"
              value={accountId}
              onChange={setAccountId}
              options={accounts.map((account) => ({ value: account.id, label: account.name }))}
            />
            <SegmentedControl<LineStatus>
              aria-label={t('banking.reconciliation.status')}
              value={status}
              onChange={setStatus}
              options={(['open', 'matched', 'ignored'] as const).map((value) => ({
                value,
                label: `${t(`banking.reconciliation.statuses.${value}`)} (${counts[value]})`,
              }))}
            />
          </div>
          <Card noPadding>
            {!loading && lines.length === 0 ? (
              <EmptyState
                title={t(`banking.reconciliation.empty.${status}`)}
                hint={status === 'open' ? t('banking.reconciliation.emptyHint') : undefined}
              />
            ) : (
              <Table
                className="max-md:p-3"
                columns={columns}
                data={lines}
                isLoading={loading}
                rowKey={(row) => row.id}
                onRowClick={setOpened}
              />
            )}
          </Card>
        </>
      )}
      {accountId && (
        <StatementImportDrawer
          open={importing}
          bankAccountId={accountId}
          onClose={() => setImporting(false)}
          onImported={load}
        />
      )}
      <LineMatchDrawer
        line={opened}
        canWrite={canWrite}
        onClose={() => setOpened(null)}
        onChanged={load}
      />
    </div>
  );
};

export default BankReconciliation;
