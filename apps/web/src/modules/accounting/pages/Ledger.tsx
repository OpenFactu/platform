import React, { useEffect, useMemo, useState } from 'react';
import { Table, Card, PageHeader, useToast, Badge, SearchableSelect } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { formatDate, formatNumber } from '@/i18n/format';
import { BookOpenCheck } from 'lucide-react';
import { chartOfAccountsApi, journalEntriesApi } from '../api';
import type { Account, LedgerRow } from '../domain/accounting';

export const Ledger: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!user?.tenantId) return;
    chartOfAccountsApi
      .list()
      .then((d) => setAccounts(Array.isArray(d) ? d : []))
      .catch(() => toast.error(t('accounting.ledger.accountsLoadError')));
  }, [user?.tenantId]);

  useEffect(() => {
    if (!selected) {
      setRows([]);
      return;
    }
    setLoading(true);
    journalEntriesApi
      .ledger(selected)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => toast.error(t('accounting.ledger.loadError')))
      .finally(() => setLoading(false));
  }, [selected]);

  const account = useMemo(() => accounts.find((a) => a.id === selected), [accounts, selected]);
  const totalDebit = rows.reduce((s, r) => s + Number(r.debit), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit), 0);

  const columns = [
    {
      header: t('accounting.common.date'),
      cell: (r: LedgerRow) => formatDate(r.entryDate),
    },
    { header: t('accounting.ledger.entry'), cell: (r: LedgerRow) => <b>{r.entryNumber}</b> },
    {
      header: t('accounting.common.concept'),
      cell: (r: LedgerRow) => r.description || r.headerDescription || '',
    },
    {
      header: t('accounting.common.debit'),
      align: 'right' as const,
      cell: (r: LedgerRow) =>
        Number(r.debit) > 0 ? formatNumber(Number(r.debit), { minimumFractionDigits: 2 }) : '',
    },
    {
      header: t('accounting.common.credit'),
      align: 'right' as const,
      cell: (r: LedgerRow) =>
        Number(r.credit) > 0 ? formatNumber(Number(r.credit), { minimumFractionDigits: 2 }) : '',
    },
    {
      header: t('accounting.common.balance'),
      align: 'right' as const,
      cell: (r: LedgerRow) => (
        <b className={r.runningBalance >= 0 ? 'text-fg-body' : 'text-red-600 dark:text-red-400'}>
          {formatNumber(r.runningBalance, { minimumFractionDigits: 2 })}
        </b>
      ),
    },
  ];

  return (
    <div className="p-8 w-full space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title={t('accounting.ledger.title')}
        subtitle={t('accounting.ledger.subtitle')}
        icon={<BookOpenCheck size={18} />}
        size="lg"
      />

      <Card className="border-border-subtle shadow-lg" noPadding>
        <div className="p-6 flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-fg-body mb-1">
              {t('accounting.common.account')}
            </label>
            {/* SearchableSelect y no Select: el plan contable puede tener cientos
                de cuentas y sin buscador es inmanejable. */}
            <SearchableSelect
              options={accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))}
              value={selected}
              onChange={setSelected}
              placeholder={t('accounting.ledger.selectAccount')}
              clearable
            />
          </div>
          {account && (
            <div className="flex items-center gap-2">
              <Badge variant="info">{account.type}</Badge>
              <Badge variant="success">
                {t('accounting.common.debit')} {totalDebit.toFixed(2)}
              </Badge>
              <Badge variant="warning">
                {t('accounting.common.credit')} {totalCredit.toFixed(2)}
              </Badge>
              <Badge variant="neutral">
                {t('accounting.common.balance')} {(totalDebit - totalCredit).toFixed(2)}
              </Badge>
            </div>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden border-border-subtle" noPadding>
        <Table className="max-md:p-3" columns={columns} data={rows} isLoading={loading} />
      </Card>
    </div>
  );
};

export default Ledger;
