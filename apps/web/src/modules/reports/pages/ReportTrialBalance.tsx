import React, { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from '@openfactu/ui';
import { ReportPage } from '../components/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportTrialBalance: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const fmt = useFormat();
  const [periods, setPeriods] = useState<any[]>([]);
  const [periodId, setPeriodId] = useState<string>('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    reportsApi.get<any>('/api/periods').then((d) => {
      if (Array.isArray(d)) {
        setPeriods(d);
        const open = d.find((p) => p.status === 'O');
        setPeriodId(open?.id || d[0]?.id || '');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const load = () => {
    if (!periodId) return;
    setLoading(true);
    reportsApi
      .get<any>(`/api/reports/trial-balance?periodId=${periodId}`)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (periodId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId]);

  const columns = useMemo(
    () => [
      { key: 'code', label: t('reports.common.account') },
      { key: 'name', label: t('reports.common.accountName') },
      { key: 'debit', label: t('reports.common.debit'), format: (v: any) => fmt.money(v) },
      { key: 'credit', label: t('reports.common.credit'), format: (v: any) => fmt.money(v) },
      { key: 'balance', label: t('reports.common.balance'), format: (v: any) => fmt.money(v) },
    ],
    [fmt, t],
  );

  return (
    <ReportPage
      title={t('reports.trialBalance.title')}
      subtitle={t('reports.trialBalance.subtitle')}
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename={`sumas-saldos-${periodId}`}
      pdfEndpoint="/api/reports/trial-balance/pdf"
      pdfQuery={{ periodId }}
      filters={
        <div className="max-w-sm">
          <label className="block text-xs font-bold text-fg-body mb-1">
            {t('reports.common.period')}
          </label>
          <SearchableSelect
            options={periods.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
            value={periodId}
            onChange={setPeriodId}
            placeholder={t('reports.common.selectPeriod')}
          />
        </div>
      }
    />
  );
};

export default ReportTrialBalance;
