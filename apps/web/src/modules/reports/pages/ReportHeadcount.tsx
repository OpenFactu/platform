import React, { useEffect, useMemo, useState } from 'react';
import { ReportPage } from '../components/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

export const ReportHeadcount: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const fmt = useFormat();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    reportsApi
      .get<any>('/api/reports/headcount')
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.tenantId]);

  const columns = useMemo(
    () => [
      { key: 'code', label: t('reports.common.code') },
      { key: 'firstName', label: t('reports.common.name') },
      { key: 'lastName', label: t('reports.headcount.lastName') },
      { key: 'departmentName', label: t('reports.headcount.department') },
      {
        key: 'hireDate',
        label: t('reports.headcount.hireDate'),
        format: (v: any) => (v ? fmt.date(v) : '—'),
      },
      {
        key: 'terminationDate',
        label: t('reports.headcount.terminationDate'),
        format: (v: any) => (v ? fmt.date(v) : '—'),
      },
      { key: 'status', label: t('reports.common.status') },
    ],
    [fmt, t],
  );

  return (
    <ReportPage
      title={t('reports.headcount.title')}
      subtitle={t('reports.headcount.subtitle')}
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename="plantilla"
    />
  );
};

export default ReportHeadcount;
