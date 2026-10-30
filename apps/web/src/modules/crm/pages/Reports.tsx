import { useI18n } from '@/i18n/I18nContext';
import React, { useMemo, useState } from 'react';
import {
  Card,
  EmptyState,
  KpiCard,
  PageHeader,
  SegmentedControl,
  Skeleton,
  Table,
  Tabs,
  type TableColumn,
} from '@openfactu/ui';
import { Chart } from '@openfactu/ui/charts';
import { BarChart3 } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useFormat } from '@/hooks/useFormat';
import { intlLocale, t as translate } from '@/i18n/i18n';
import {
  crmReportsApi,
  type LostReasonRow,
  type OwnerActivityRow,
  type SourceRow,
} from '../api/reportsApi';
import { ACTIVITY_TYPE_LABEL, type ActivityType } from '../domain/crm';
import { lastMonths, useCrmReport } from '../hooks/useCrmReport';

type Tab = 'forecast' | 'funnel' | 'lost' | 'sources' | 'activity' | 'surveys';
type Range = '3' | '6' | '12' | '24';

const monthLabel = (m: string | null) => {
  if (!m) return translate('crm.reports.noDate');
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString(intlLocale(), {
    month: 'short',
    year: '2-digit',
  });
};

const Loading = () => <Skeleton className="h-64 w-full" />;
const Empty = ({ title }: { title: string }) => {
  const { t } = useI18n();
  return (
    <EmptyState icon={<BarChart3 size={18} />} title={title} hint={t('crm.reports.tryLonger')} />
  );
};

export const Reports: React.FC = () => {
  const fmt = useFormat();
  const { t } = useI18n();
  const { flags } = useTheme();
  const [tab, setTab] = useState<Tab>('forecast');
  const [range, setRange] = useState<Range>('12');
  // El periodo se calcula al cambiar el rango, no en cada render.
  const period = useMemo(() => lastMonths(Number(range)), [range]);

  const tabs = [
    { key: 'forecast', label: t('crm.reports.tabs.forecast') },
    { key: 'funnel', label: t('crm.reports.tabs.funnel') },
    { key: 'lost', label: t('crm.reports.tabs.lost') },
    { key: 'sources', label: t('crm.reports.tabs.sources') },
    { key: 'activity', label: t('crm.reports.tabs.activity') },
    ...(flags.formsEnabled ? [{ key: 'surveys', label: t('crm.reports.tabs.surveys') }] : []),
  ];

  return (
    <div className="p-4 w-full space-y-4">
      <PageHeader
        title={t('crm.nav.reportsTitle')}
        subtitle={t('crm.reports.subtitle')}
        icon={<BarChart3 size={18} />}
        size="sm"
        actions={
          <SegmentedControl
            size="sm"
            aria-label={t('crm.reports.period')}
            value={range}
            onChange={(v) => setRange(v as Range)}
            options={[
              { value: '3', label: t('crm.reports.months', { n: 3 }) },
              { value: '6', label: t('crm.reports.months', { n: 6 }) },
              { value: '12', label: t('crm.reports.months', { n: 12 }) },
              { value: '24', label: t('crm.reports.months', { n: 24 }) },
            ]}
          />
        }
      />
      <Tabs items={tabs} value={tab} onChange={(k) => setTab(k as Tab)} scrollable />
      {tab === 'forecast' && <ForecastTab period={period} fmt={fmt} />}
      {tab === 'funnel' && <FunnelTab period={period} />}
      {tab === 'lost' && <LostTab period={period} fmt={fmt} />}
      {tab === 'sources' && <SourcesTab period={period} fmt={fmt} />}
      {tab === 'activity' && <ActivityTab period={period} fmt={fmt} />}
      {tab === 'surveys' && <SurveysTab period={period} />}
    </div>
  );
};

type Fmt = ReturnType<typeof useFormat>;
type PeriodProps = { period: ReturnType<typeof lastMonths> };

const ForecastTab: React.FC<PeriodProps & { fmt: Fmt }> = ({ period, fmt }) => {
  const { t } = useI18n();
  const { data } = useCrmReport(crmReportsApi.forecast, period);
  if (!data) return <Loading />;
  const openTotal = data.open.reduce((s, r) => s + r.amount, 0);
  const weightedTotal = data.open.reduce((s, r) => s + r.weighted, 0);
  const wonTotal = data.won.reduce((s, r) => s + r.amount, 0);
  const chartData = data.open.map((r) => ({
    month: monthLabel(r.month),
    Importe: r.amount,
    Ponderado: r.weighted,
  }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label={t('crm.reports.openInPipeline')} value={fmt.money(openTotal)} />
        <KpiCard label={t('crm.opportunities.weighted')} value={fmt.money(weightedTotal)} />
        <KpiCard label={t('crm.reports.wonInPeriod')} value={fmt.money(wonTotal)} />
      </div>
      <Card title={t('crm.reports.forecastByMonth')} subtitle={t('crm.reports.openOpportunities')}>
        {chartData.length ? (
          <Chart
            type="bar"
            data={chartData}
            xKey="month"
            series={[
              { key: 'Importe', label: t('crm.common.amount') },
              { key: 'Ponderado', label: t('crm.reports.weighted') },
            ]}
            valueFormat={(v) => fmt.money(v)}
            height={280}
            legend
            aria-label={t('crm.reports.forecastByMonth')}
          />
        ) : (
          <Empty title={t('crm.reports.noOpen')} />
        )}
      </Card>
      <Card title={t('crm.reports.wonByMonth')}>
        {data.won.length ? (
          <Chart
            type="bar"
            data={data.won.map((r) => ({ month: monthLabel(r.month), Ganado: r.amount }))}
            xKey="month"
            series={[{ key: 'Ganado', label: t('crm.reports.won'), color: 'positive' }]}
            valueFormat={(v) => fmt.money(v)}
            height={240}
            aria-label={t('crm.reports.wonByMonth')}
          />
        ) : (
          <Empty title={t('crm.reports.noneWon')} />
        )}
      </Card>
    </div>
  );
};

const FunnelTab: React.FC<PeriodProps> = ({ period }) => {
  const { t } = useI18n();
  const { data } = useCrmReport(crmReportsApi.funnel, period);
  if (!data) return <Loading />;
  if (data.cohort === 0) return <Empty title={t('crm.reports.noneCreated')} />;
  const max = Math.max(...data.stages.map((s) => s.reached), 1);
  return (
    <Card
      title={t('crm.reports.tabs.funnel')}
      subtitle={t('crm.reports.funnelSubtitle', { count: data.cohort })}
    >
      <ul className="space-y-4">
        {data.stages.map((s) => (
          <li key={s.stageId} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-fg-default">{s.name}</span>
              <span className="text-xs text-fg-muted tabular-nums">{s.reached}</span>
              <span className="flex-1" />
              {s.conversion != null && (
                <span className="text-xs text-fg-body">
                  {t('crm.reports.conversion', { pct: s.conversion })}
                </span>
              )}
              {s.avgDays != null && (
                <span className="text-xs text-fg-muted">
                  {t('crm.reports.avgDays', { days: s.avgDays })}
                </span>
              )}
            </div>
            <div className="h-3 rounded-full bg-bg-muted overflow-hidden">
              <div
                className={
                  s.kind === 'won'
                    ? 'h-full bg-success'
                    : s.kind === 'lost'
                      ? 'h-full bg-border-strong'
                      : 'h-full bg-accent'
                }
                style={{ width: `${(s.reached / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
};

const LostTab: React.FC<PeriodProps & { fmt: Fmt }> = ({ period, fmt }) => {
  const { t } = useI18n();
  const { data } = useCrmReport(crmReportsApi.lostReasons, period);
  if (!data) return <Loading />;
  if (data.length === 0) return <Empty title={t('crm.reports.noneLost')} />;
  const columns: TableColumn<LostReasonRow>[] = [
    { header: t('crm.lostReason.reason'), accessor: 'reason', card: 'title' },
    { header: t('crm.nav.opportunities'), accessor: 'count', align: 'right' },
    {
      header: t('crm.reports.lostAmount'),
      id: 'amount',
      accessor: (r) => fmt.money(r.amount),
      align: 'right',
    },
  ];
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <Card title={t('crm.settings.lostReasons')}>
        <Chart
          type="donut"
          data={data.map((r) => ({ reason: r.reason, Oportunidades: r.count }))}
          xKey="reason"
          series={[{ key: 'Oportunidades', label: t('crm.nav.opportunities') }]}
          height={260}
          legend
          aria-label={t('crm.settings.lostReasons')}
        />
      </Card>
      <Table
        columns={columns}
        data={data}
        ariaLabel={t('crm.settings.lostReasons')}
        rowKey={(r) => r.reason}
      />
    </div>
  );
};

const SourcesTab: React.FC<PeriodProps & { fmt: Fmt }> = ({ period, fmt }) => {
  const { t } = useI18n();
  const { data } = useCrmReport(crmReportsApi.sources, period);
  if (!data) return <Loading />;
  if (data.length === 0) return <Empty title={t('crm.reports.noneCreated')} />;
  const columns: TableColumn<SourceRow>[] = [
    { header: t('crm.fields.source'), accessor: 'source', card: 'title' },
    { header: t('crm.reports.created'), accessor: 'created', align: 'right' },
    { header: t('crm.reports.wonCount'), accessor: 'won', align: 'right' },
    { header: t('crm.reports.lostCount'), accessor: 'lost', align: 'right' },
    {
      header: t('crm.reports.winRate'),
      id: 'rate',
      accessor: (r) => (r.winRate == null ? '—' : `${r.winRate}%`),
      align: 'right',
    },
    {
      header: t('crm.reports.won'),
      id: 'amount',
      accessor: (r) => fmt.money(r.wonAmount),
      align: 'right',
    },
  ];
  return (
    <div className="space-y-4">
      <Card title={t('crm.reports.bySource')}>
        <Chart
          type="bar"
          data={data.map((r) => ({
            source: r.source,
            Ganadas: r.won,
            Perdidas: r.lost,
            Abiertas: r.created - r.won - r.lost,
          }))}
          xKey="source"
          series={[
            { key: 'Ganadas', label: t('crm.reports.wonCount'), color: 'positive', stackId: 'a' },
            { key: 'Abiertas', label: t('crm.opportunities.open'), color: 'neutral', stackId: 'a' },
            { key: 'Perdidas', label: t('crm.reports.lostCount'), color: 'negative', stackId: 'a' },
          ]}
          height={260}
          legend
          aria-label={t('crm.reports.bySource')}
        />
      </Card>
      <Table
        columns={columns}
        data={data}
        ariaLabel={t('crm.settings.sources')}
        rowKey={(r) => r.source}
      />
    </div>
  );
};

const ActivityTab: React.FC<PeriodProps & { fmt: Fmt }> = ({ period, fmt }) => {
  const { t } = useI18n();
  const { data } = useCrmReport(crmReportsApi.activity, period);
  if (!data) return <Loading />;
  if (data.length === 0) return <Empty title={t('crm.reports.noActivity')} />;
  const types = Object.keys(ACTIVITY_TYPE_LABEL) as ActivityType[];
  const columns: TableColumn<OwnerActivityRow>[] = [
    { header: t('crm.reports.salesRep'), accessor: 'name', card: 'title' },
    ...types.map<TableColumn<OwnerActivityRow>>((type) => ({
      header: t(ACTIVITY_TYPE_LABEL[type]),
      id: type,
      accessor: (r) => r.done[type] ?? 0,
      align: 'right',
    })),
    { header: t('crm.reports.overdue'), accessor: 'overdue', align: 'right' },
    { header: t('crm.reports.wonCount'), accessor: 'won', align: 'right' },
    {
      header: t('crm.reports.wonAmount'),
      id: 'amount',
      accessor: (r) => fmt.money(r.wonAmount),
      align: 'right',
    },
  ];
  return (
    <Card
      title={t('crm.reports.activityByRep')}
      subtitle={t('crm.reports.activityByRepHint')}
      noPadding
    >
      <Table
        columns={columns}
        data={data}
        ariaLabel={t('crm.reports.activityByRep')}
        rowKey={(r) => r.ownerUserId ?? 'none'}
      />
    </Card>
  );
};

const SurveysTab: React.FC<PeriodProps> = ({ period }) => {
  const { t } = useI18n();
  const { data } = useCrmReport(crmReportsApi.surveys, period);
  if (!data) return <Loading />;
  if (data.length === 0) return <Empty title={t('crm.reports.noSurveys')} />;
  return (
    <div className="space-y-4">
      {data.map((s) => (
        <Card
          key={s.formId}
          title={s.name}
          subtitle={`${t('crm.reports.responses', { count: s.responses })}${s.nps != null ? ` · NPS ${s.nps}` : ''}`}
        >
          {s.months.some((m) => m.nps != null) ? (
            <Chart
              type="line"
              data={s.months.map((m) => ({ month: monthLabel(m.month), NPS: m.nps }))}
              xKey="month"
              series={[{ key: 'NPS' }]}
              height={220}
              aria-label={t('crm.reports.npsByMonth', { name: s.name })}
            />
          ) : (
            <p className="text-sm text-fg-muted">
              {s.responses ? t('crm.reports.noNps') : t('crm.reports.noResponses')}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
};

export default Reports;
