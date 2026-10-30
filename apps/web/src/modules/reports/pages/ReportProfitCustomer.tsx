import React, { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from '@openfactu/ui';
import { ReportPage } from '../components/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportProfitCustomer: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const fmt = useFormat();
  const [periods, setPeriods] = useState<any[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    reportsApi.get<any>('/api/periods').then((d) => {
      setPeriods(Array.isArray(d) ? d : []);
      const open = d.find?.((p: any) => p.status === 'O');
      setPeriodId(open?.id || d[0]?.id || '');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const load = () => {
    setLoading(true);
    reportsApi
      .get<any>(`/api/reports/profit-customer${periodId ? `?periodId=${periodId}` : ''}`)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (periodId) load(); /* eslint-disable-next-line */
  }, [periodId]);

  const columns = useMemo(
    () => [
      { key: 'code', label: t('reports.common.code') },
      { key: 'name', label: t('reports.common.customer') },
      { key: 'count', label: t('reports.profitCustomer.invoices'), format: (v: any) => String(v) },
      { key: 'total', label: t('reports.common.revenue'), format: (v: any) => fmt.money(v) },
    ],
    [fmt, t],
  );

  return (
    <ReportPage
      title={t('reports.profitCustomer.title')}
      subtitle={t('reports.profitCustomer.subtitle')}
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename={`rent-cliente-${periodId}`}
      pdfEndpoint="/api/reports/profit-customer/pdf"
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

export default ReportProfitCustomer;
