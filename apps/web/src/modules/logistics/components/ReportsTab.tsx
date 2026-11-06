import React from 'react';
import { Alert, Card, DateRangePicker, KpiCard, StackedBar, Table } from '@openfactu/ui';
import type { TableColumn } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { onTimeRate, type LogisticsSummary } from '../domain/reports';
import { useLogisticsReports } from '../hooks/useLogisticsReports';

type DriverRow = LogisticsSummary['drivers'][number];
type CauseRow = LogisticsSummary['incidents'][number];

/** Cómo va el reparto: entregas a tiempo, incidencias por causa y trabajo por conductor. */
export const ReportsTab: React.FC = () => {
  const { t } = useI18n();
  const { range, setRange, summary, loading, failed } = useLogisticsReports();
  const delivery = summary?.delivery;
  const rate = delivery ? onTimeRate(delivery) : null;
  const noDriver = t('logistics.reports.noDriver');
  const noCause = t('logistics.reports.noCause');

  const driverColumns: TableColumn<DriverRow>[] = [
    {
      header: t('logistics.reports.driver'),
      cell: (row) => row.driver || noDriver,
    },
    { header: t('logistics.reports.stops'), align: 'right', cell: (row) => row.stops },
    {
      header: t('logistics.reports.delivered'),
      align: 'right',
      cell: (row) => row.delivered,
    },
    {
      header: t('logistics.reports.postponed'),
      align: 'right',
      cell: (row) => row.postponed,
    },
    {
      header: t('logistics.reports.incidents'),
      align: 'right',
      cell: (row) => row.incidents,
    },
  ];

  const causeColumns: TableColumn<CauseRow>[] = [
    { header: t('logistics.reports.cause'), cell: (row) => row.reason || noCause },
    { header: t('logistics.reports.count'), align: 'right', cell: (row) => row.count },
  ];

  return (
    <div className="space-y-4">
      <DateRangePicker
        label={t('logistics.reports.period')}
        value={range}
        onChange={setRange}
        className="max-w-sm"
      />

      {failed && <Alert tone="danger">{t('logistics.common.error')}</Alert>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label={t('logistics.reports.deliveries')}
          value={delivery?.total ?? 0}
          isLoading={loading}
        />
        <KpiCard
          label={t('logistics.reports.onTimeRate')}
          value={rate === null ? '—' : `${rate} %`}
          sub={rate === null ? t('logistics.reports.noPromise') : undefined}
          isLoading={loading}
        />
        <KpiCard
          label={t('logistics.reports.late')}
          value={delivery?.late ?? 0}
          isLoading={loading}
        />
      </div>

      {delivery && delivery.total > 0 && (
        <Card bodyClassName="p-4">
          <StackedBar
            ariaLabel={t('logistics.reports.deliveries')}
            segments={[
              {
                key: 'onTime',
                value: delivery.onTime,
                label: t('logistics.reports.onTime'),
                color: 'rgb(var(--k-success-rgb))',
              },
              {
                key: 'late',
                value: delivery.late,
                label: t('logistics.reports.late'),
                color: 'rgb(var(--k-danger-rgb))',
              },
              {
                key: 'unknown',
                value: delivery.unknown,
                label: t('logistics.reports.unknown'),
              },
            ]}
          />
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card title={t('logistics.reports.byDriver')} bodyClassName="p-0">
          <Table
            columns={driverColumns}
            data={summary?.drivers ?? []}
            rowKey={(row) => row.driver || noDriver}
            emptyMessage={t('logistics.reports.noData')}
          />
        </Card>
        <Card title={t('logistics.reports.byCause')} bodyClassName="p-0">
          <Table
            columns={causeColumns}
            data={summary?.incidents ?? []}
            rowKey={(row) => row.reason || noCause}
            emptyMessage={t('logistics.reports.noIncidents')}
          />
        </Card>
      </div>
    </div>
  );
};
