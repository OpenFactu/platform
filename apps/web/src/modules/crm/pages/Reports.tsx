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
  if (!m) return 'Sin fecha';
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
};

const Loading = () => <Skeleton className="h-64 w-full" />;
const Empty = ({ title }: { title: string }) => (
  <EmptyState
    icon={<BarChart3 size={18} />}
    title={title}
    hint="Prueba con un periodo más largo."
  />
);

export const Reports: React.FC = () => {
  const fmt = useFormat();
  const { flags } = useTheme();
  const [tab, setTab] = useState<Tab>('forecast');
  const [range, setRange] = useState<Range>('12');
  // El periodo se calcula al cambiar el rango, no en cada render.
  const period = useMemo(() => lastMonths(Number(range)), [range]);

  const tabs = [
    { key: 'forecast', label: 'Previsión' },
    { key: 'funnel', label: 'Embudo' },
    { key: 'lost', label: 'Pérdidas' },
    { key: 'sources', label: 'Orígenes' },
    { key: 'activity', label: 'Comerciales' },
    ...(flags.crmFormsEnabled ? [{ key: 'surveys', label: 'Encuestas' }] : []),
  ];

  return (
    <div className="p-4 w-full space-y-4">
      <PageHeader
        title="Informes del CRM"
        subtitle="Cómo va el embudo, de dónde vienen las ventas y por qué se pierden"
        icon={<BarChart3 size={18} />}
        size="sm"
        actions={
          <SegmentedControl
            size="sm"
            aria-label="Periodo"
            value={range}
            onChange={(v) => setRange(v as Range)}
            options={[
              { value: '3', label: '3 meses' },
              { value: '6', label: '6 meses' },
              { value: '12', label: '12 meses' },
              { value: '24', label: '24 meses' },
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
        <KpiCard label="Abierto en el embudo" value={fmt.money(openTotal)} />
        <KpiCard label="Previsión ponderada" value={fmt.money(weightedTotal)} />
        <KpiCard label="Ganado en el periodo" value={fmt.money(wonTotal)} />
      </div>
      <Card title="Previsión por mes de cierre" subtitle="Oportunidades abiertas.">
        {chartData.length ? (
          <Chart
            type="bar"
            data={chartData}
            xKey="month"
            series={[{ key: 'Importe' }, { key: 'Ponderado' }]}
            valueFormat={(v) => fmt.money(v)}
            height={280}
            legend
            aria-label="Previsión por mes de cierre"
          />
        ) : (
          <Empty title="No hay oportunidades abiertas" />
        )}
      </Card>
      <Card title="Ganado por mes">
        {data.won.length ? (
          <Chart
            type="bar"
            data={data.won.map((r) => ({ month: monthLabel(r.month), Ganado: r.amount }))}
            xKey="month"
            series={[{ key: 'Ganado', color: 'positive' }]}
            valueFormat={(v) => fmt.money(v)}
            height={240}
            aria-label="Ganado por mes"
          />
        ) : (
          <Empty title="Nada ganado en el periodo" />
        )}
      </Card>
    </div>
  );
};

const FunnelTab: React.FC<PeriodProps> = ({ period }) => {
  const { data } = useCrmReport(crmReportsApi.funnel, period);
  if (!data) return <Loading />;
  if (data.cohort === 0) return <Empty title="No se crearon oportunidades en el periodo" />;
  const max = Math.max(...data.stages.map((s) => s.reached), 1);
  return (
    <Card
      title="Embudo"
      subtitle={`${data.cohort} oportunidad(es) creadas en el periodo: cuántas pasaron por cada etapa, cuántas siguieron y cuánto tiempo estuvieron.`}
    >
      <ul className="space-y-4">
        {data.stages.map((s) => (
          <li key={s.stageId} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-fg-default">{s.name}</span>
              <span className="text-xs text-fg-muted tabular-nums">{s.reached}</span>
              <span className="flex-1" />
              {s.conversion != null && (
                <span className="text-xs text-fg-body">{s.conversion}% siguen adelante</span>
              )}
              {s.avgDays != null && (
                <span className="text-xs text-fg-muted">{s.avgDays} días de media</span>
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
  const { data } = useCrmReport(crmReportsApi.lostReasons, period);
  if (!data) return <Loading />;
  if (data.length === 0) return <Empty title="No se perdió ninguna oportunidad en el periodo" />;
  const columns: TableColumn<LostReasonRow>[] = [
    { header: 'Motivo', accessor: 'reason', card: 'title' },
    { header: 'Oportunidades', accessor: 'count', align: 'right' },
    {
      header: 'Importe perdido',
      id: 'amount',
      accessor: (r) => fmt.money(r.amount),
      align: 'right',
    },
  ];
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <Card title="Motivos de pérdida">
        <Chart
          type="donut"
          data={data.map((r) => ({ reason: r.reason, Oportunidades: r.count }))}
          xKey="reason"
          series={[{ key: 'Oportunidades' }]}
          height={260}
          legend
          aria-label="Motivos de pérdida"
        />
      </Card>
      <Table
        columns={columns}
        data={data}
        ariaLabel="Motivos de pérdida"
        rowKey={(r) => r.reason}
      />
    </div>
  );
};

const SourcesTab: React.FC<PeriodProps & { fmt: Fmt }> = ({ period, fmt }) => {
  const { data } = useCrmReport(crmReportsApi.sources, period);
  if (!data) return <Loading />;
  if (data.length === 0) return <Empty title="No se crearon oportunidades en el periodo" />;
  const columns: TableColumn<SourceRow>[] = [
    { header: 'Origen', accessor: 'source', card: 'title' },
    { header: 'Creadas', accessor: 'created', align: 'right' },
    { header: 'Ganadas', accessor: 'won', align: 'right' },
    { header: 'Perdidas', accessor: 'lost', align: 'right' },
    {
      header: '% de éxito',
      id: 'rate',
      accessor: (r) => (r.winRate == null ? '—' : `${r.winRate}%`),
      align: 'right',
    },
    { header: 'Ganado', id: 'amount', accessor: (r) => fmt.money(r.wonAmount), align: 'right' },
  ];
  return (
    <div className="space-y-4">
      <Card title="Oportunidades por origen">
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
            { key: 'Ganadas', color: 'positive', stackId: 'a' },
            { key: 'Abiertas', color: 'neutral', stackId: 'a' },
            { key: 'Perdidas', color: 'negative', stackId: 'a' },
          ]}
          height={260}
          legend
          aria-label="Oportunidades por origen"
        />
      </Card>
      <Table columns={columns} data={data} ariaLabel="Orígenes" rowKey={(r) => r.source} />
    </div>
  );
};

const ActivityTab: React.FC<PeriodProps & { fmt: Fmt }> = ({ period, fmt }) => {
  const { data } = useCrmReport(crmReportsApi.activity, period);
  if (!data) return <Loading />;
  if (data.length === 0) return <Empty title="Sin actividad en el periodo" />;
  const types = Object.keys(ACTIVITY_TYPE_LABEL) as ActivityType[];
  const columns: TableColumn<OwnerActivityRow>[] = [
    { header: 'Comercial', accessor: 'name', card: 'title' },
    ...types.map<TableColumn<OwnerActivityRow>>((t) => ({
      header: ACTIVITY_TYPE_LABEL[t],
      id: t,
      accessor: (r) => r.done[t] ?? 0,
      align: 'right',
    })),
    { header: 'Vencidas', accessor: 'overdue', align: 'right' },
    { header: 'Ganadas', accessor: 'won', align: 'right' },
    {
      header: 'Importe ganado',
      id: 'amount',
      accessor: (r) => fmt.money(r.wonAmount),
      align: 'right',
    },
  ];
  return (
    <Card
      title="Actividad por comercial"
      subtitle="Actividades hechas en el periodo, pendientes vencidas y oportunidades ganadas."
      noPadding
    >
      <Table
        columns={columns}
        data={data}
        ariaLabel="Actividad por comercial"
        rowKey={(r) => r.ownerUserId ?? 'none'}
      />
    </Card>
  );
};

const SurveysTab: React.FC<PeriodProps> = ({ period }) => {
  const { data } = useCrmReport(crmReportsApi.surveys, period);
  if (!data) return <Loading />;
  if (data.length === 0) return <Empty title="No hay encuestas" />;
  return (
    <div className="space-y-4">
      {data.map((s) => (
        <Card
          key={s.formId}
          title={s.name}
          subtitle={`${s.responses} respuesta(s) en el periodo${s.nps != null ? ` · NPS ${s.nps}` : ''}`}
        >
          {s.months.some((m) => m.nps != null) ? (
            <Chart
              type="line"
              data={s.months.map((m) => ({ month: monthLabel(m.month), NPS: m.nps }))}
              xKey="month"
              series={[{ key: 'NPS' }]}
              height={220}
              aria-label={`NPS de ${s.name} por mes`}
            />
          ) : (
            <p className="text-sm text-fg-muted">
              {s.responses
                ? 'Esta encuesta no tiene pregunta NPS.'
                : 'Sin respuestas en el periodo.'}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
};

export default Reports;
