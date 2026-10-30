import React, { useEffect, useMemo, useState } from 'react';
import { ReportPage } from '../components/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportProfitCostCenter: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const fmt = useFormat();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    reportsApi
      .get<any>('/api/reports/profit-cost-center')
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.tenantId]);

  const columns = useMemo(
    () => [
      { key: 'code', label: t('reports.common.code') },
      { key: 'name', label: t('reports.profitCostCenter.center') },
      { key: 'income', label: t('reports.common.income'), format: (v: any) => fmt.money(v) },
      { key: 'expense', label: t('reports.common.expenses'), format: (v: any) => fmt.money(v) },
      { key: 'margin', label: t('reports.common.margin'), format: (v: any) => fmt.money(v) },
    ],
    [fmt, t],
  );

  return (
    <ReportPage
      title={t('reports.profitCostCenter.title')}
      subtitle={t('reports.profitCostCenter.subtitle')}
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename="rent-centro-coste"
    />
  );
};

export default ReportProfitCostCenter;
