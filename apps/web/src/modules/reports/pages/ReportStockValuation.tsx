import React, { useEffect, useMemo, useState } from 'react';
import { ReportPage } from '../components/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';
import { UncostedNotice } from '../components/UncostedNotice';
import { hasValues } from '../domain/itemCosts';

export const ReportStockValuation: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const fmt = useFormat();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    reportsApi
      .get<any>('/api/reports/stock-valuation')
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.tenantId]);

  const totalValue = rows.reduce((s, r) => s + Number(r.value || 0), 0);

  const columns = useMemo(
    () => [
      { key: 'code', label: t('reports.common.code') },
      { key: 'name', label: t('reports.common.item') },
      { key: 'stock', label: t('reports.common.stock'), format: (v: any) => String(v) },
      ...(hasValues(rows)
        ? [
            {
              key: 'unitPrice',
              label: t('reports.stockValuation.unitPrice'),
              format: (v: any, row: any) =>
                row?.uncosted ? t('reports.stockValuation.noCost') : fmt.money(v),
            },
            {
              key: 'value',
              label: t('reports.stockValuation.value'),
              format: (v: any) => fmt.money(v),
            },
          ]
        : []),
    ],
    [fmt, t, rows],
  );

  return (
    <ReportPage
      title={t('reports.stockValuation.title')}
      subtitle={
        hasValues(rows)
          ? t('reports.stockValuation.subtitle', { total: fmt.money(totalValue) })
          : t('reports.stockValuation.subtitleNoCost')
      }
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename="valoracion-inventario"
      footer={<UncostedNotice rows={rows} message={t('reports.stockValuation.uncostedNotice')} />}
    />
  );
};

export default ReportStockValuation;
