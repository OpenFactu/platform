import React, { useEffect, useMemo, useState } from 'react';
import { ReportPage } from '../components/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportStockRotation: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const fmt = useFormat();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    reportsApi
      .get<any>('/api/reports/stock-rotation')
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.tenantId]);

  const columns = useMemo(
    () => [
      { key: 'code', label: t('reports.common.code') },
      { key: 'name', label: t('reports.common.item') },
      { key: 'stock', label: t('reports.common.stock'), format: (v: any) => String(v) },
      { key: 'sold', label: t('reports.stockRotation.sold'), format: (v: any) => String(v) },
      {
        key: 'daysOfStock',
        label: t('reports.stockRotation.daysOfStock'),
        format: (v: any) => (v == null ? t('reports.stockRotation.noSales') : String(v)),
      },
    ],
    [fmt, t],
  );

  return (
    <ReportPage
      title={t('reports.stockRotation.title')}
      subtitle={t('reports.stockRotation.subtitle')}
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename="rotacion-stock"
    />
  );
};

export default ReportStockRotation;
