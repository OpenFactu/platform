import React, { useEffect, useMemo, useState } from 'react';
import { ReportPage } from '../components/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportProfitProject: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const fmt = useFormat();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    reportsApi
      .get<any>('/api/reports/profit-project')
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.tenantId]);

  const columns = useMemo(
    () => [
      { key: 'code', label: t('reports.common.code') },
      { key: 'name', label: t('reports.profitProject.project') },
      { key: 'budget', label: t('reports.profitProject.budget'), format: (v: any) => fmt.money(v) },
      { key: 'income', label: t('reports.common.income'), format: (v: any) => fmt.money(v) },
      { key: 'expense', label: t('reports.common.expenses'), format: (v: any) => fmt.money(v) },
      { key: 'margin', label: t('reports.common.margin'), format: (v: any) => fmt.money(v) },
      {
        key: 'deviation',
        label: t('reports.profitProject.deviation'),
        format: (v: any) => (Number(v) === 0 ? '—' : `${Number(v).toFixed(1)} %`),
      },
    ],
    [fmt, t],
  );

  return (
    <ReportPage
      title={t('reports.profitProject.title')}
      subtitle={t('reports.profitProject.subtitle')}
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename="rent-proyecto"
    />
  );
};

export default ReportProfitProject;
