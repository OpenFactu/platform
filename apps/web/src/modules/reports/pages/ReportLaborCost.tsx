import React, { useEffect, useMemo, useState } from 'react';
import { NumberInput } from '@openfactu/ui';
import { ReportPage } from '../components/ReportPage';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { reportsApi } from '../api';
import { useFormat } from '@/hooks/useFormat';

/** Claves i18n de los meses abreviados: se traducen al pintar. */
const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
].map((m) => `reports.common.months.${m}`);

export const ReportLaborCost: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const fmt = useFormat();
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    reportsApi
      .get<any>(`/api/reports/labor-cost?year=${year}`)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [year, user?.tenantId]);

  const columns = useMemo(
    () => [
      {
        key: 'month',
        label: t('reports.laborCost.month'),
        format: (v: any) => (MONTHS[v - 1] ? t(MONTHS[v - 1]) : v),
      },
      { key: 'gross', label: t('reports.common.gross'), format: (v: any) => fmt.money(v) },
      {
        key: 'ssEmployer',
        label: t('reports.laborCost.ssEmployer'),
        format: (v: any) => fmt.money(v),
      },
      { key: 'irpf', label: t('reports.laborCost.irpf'), format: (v: any) => fmt.money(v) },
      { key: 'netPay', label: t('reports.common.net'), format: (v: any) => fmt.money(v) },
      {
        key: 'totalCost',
        label: t('reports.laborCost.totalCost'),
        format: (v: any) => fmt.money(v),
      },
    ],
    [fmt, t],
  );

  return (
    <ReportPage
      title={t('reports.laborCost.title')}
      subtitle={t('reports.laborCost.subtitle', { year })}
      rows={rows}
      columns={columns as any}
      loading={loading}
      onRefresh={load}
      filename={`costes-laborales-${year}`}
      filters={
        <NumberInput
          label={t('reports.laborCost.year')}
          value={year}
          onChange={(v) => setYear(v ?? new Date().getFullYear())}
          min={2000}
          max={2100}
          commitOn="blur"
          thousandSeparator={false}
          containerClassName="w-32"
        />
      }
    />
  );
};

export default ReportLaborCost;
