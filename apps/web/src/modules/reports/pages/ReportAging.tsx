import React, { useEffect, useMemo, useState } from 'react';
import { ReportPage } from '../components/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

interface Props {
  kind: 'receivables' | 'payables';
}

export const ReportAging: React.FC<Props> = ({ kind }) => {
  const { user } = useAuth();
  const { t } = useI18n();
  const fmt = useFormat();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const endpoint =
    kind === 'receivables' ? '/api/reports/aging-receivables' : '/api/reports/aging-payables';

  const load = () => {
    setLoading(true);
    reportsApi
      .get<any>(endpoint)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.tenantId]);

  const columns = useMemo(
    () => [
      { key: 'code', label: t('reports.aging.invoice') },
      {
        key: 'partnerName',
        label: kind === 'receivables' ? t('reports.common.customer') : t('reports.common.supplier'),
      },
      { key: 'date', label: t('reports.common.date'), format: (v: any) => fmt.date(v) },
      {
        key: 'dueDate',
        label: t('reports.aging.dueDate'),
        format: (v: any) => (v ? fmt.date(v) : '—'),
      },
      {
        key: 'days',
        label: t('reports.aging.daysOverdue'),
        format: (v: any) => (Number(v) > 0 ? String(v) : '—'),
      },
      { key: 'bucket', label: t('reports.aging.bucket') },
      { key: 'pending', label: t('reports.aging.pending'), format: (v: any) => fmt.money(v) },
    ],
    [fmt, kind, t],
  );

  const title =
    kind === 'receivables' ? t('reports.aging.receivablesTitle') : t('reports.aging.payablesTitle');
  const subtitle =
    kind === 'receivables'
      ? t('reports.aging.receivablesSubtitle')
      : t('reports.aging.payablesSubtitle');

  return (
    <ReportPage
      title={title}
      subtitle={subtitle}
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename={`aging-${kind}`}
    />
  );
};

export default ReportAging;
