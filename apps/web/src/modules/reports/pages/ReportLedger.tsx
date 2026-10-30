import React, { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from '@openfactu/ui';
import { ReportPage } from '../components/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportLedger: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const fmt = useFormat();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState<string>('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    reportsApi
      .get<any>('/api/chart-of-accounts')
      .then((d) => setAccounts(Array.isArray(d) ? d : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const load = () => {
    if (!accountId) return;
    setLoading(true);
    reportsApi
      .get<any>(`/api/reports/ledger?accountId=${accountId}`)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (accountId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const columns = useMemo(
    () => [
      { key: 'date', label: t('reports.common.date'), format: (v: any) => fmt.date(v) },
      { key: 'entryNumber', label: t('reports.ledger.entry') },
      { key: 'description', label: t('reports.common.concept') },
      {
        key: 'debit',
        label: t('reports.common.debit'),
        format: (v: any) => (Number(v) ? fmt.money(v) : ''),
      },
      {
        key: 'credit',
        label: t('reports.common.credit'),
        format: (v: any) => (Number(v) ? fmt.money(v) : ''),
      },
      { key: 'balance', label: t('reports.common.balance'), format: (v: any) => fmt.money(v) },
    ],
    [fmt, t],
  );

  const account = accounts.find((a) => a.id === accountId);

  return (
    <ReportPage
      title={t('reports.ledger.title')}
      subtitle={account ? `${account.code} · ${account.name}` : t('reports.ledger.selectAccount')}
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename={`mayor-${account?.code || 'cuenta'}`}
      pdfEndpoint={accountId ? '/api/reports/ledger/pdf' : undefined}
      pdfQuery={{ accountId }}
      filters={
        <div className="max-w-md">
          <label className="block text-xs font-bold text-fg-body mb-1">
            {t('reports.common.account')}
          </label>
          {/* SearchableSelect y no Select: el plan contable puede tener cientos
              de cuentas y sin buscador es inmanejable. */}
          <SearchableSelect
            options={accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))}
            value={accountId}
            onChange={setAccountId}
            placeholder={t('reports.common.selectPlaceholder')}
            clearable
          />
        </div>
      }
    />
  );
};

export default ReportLedger;
