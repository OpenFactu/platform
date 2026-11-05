import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, EmptyState, KpiCard, List, Skeleton } from '@openfactu/ui';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Route as RouteIcon,
  Truck,
} from 'lucide-react';
import { useTabs } from '@/context/TabsContext';
import { useFormat } from '@/hooks/useFormat';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import { useI18n } from '@/i18n/I18nContext';
import { logisticsApi } from '../api';
import type { TodaySummary } from '../domain/shipment';
import { shipmentCode } from '../domain/shipmentStatus';

export type HubSection = 'preparation' | 'shipments' | 'routes' | 'incidents';

interface Props {
  onOpenSection: (section: HubSection) => void;
}

/** Lo primero que se mira por la mañana: qué hay que hacer hoy y qué se ha torcido. */
export const TodayTab: React.FC<Props> = ({ onOpenSection }) => {
  const { t } = useI18n();
  const { openTab } = useTabs();
  const fmt = useFormat();
  const [data, setData] = useState<TodaySummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    logisticsApi
      .today()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeEvents({
    'shipment.updated': load,
    'route.changed': load,
  });

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!data) return <EmptyState title={t('logistics.today.loadError')} />;

  const { counts } = data;
  const nothing = counts.late + counts.incidents + counts.readyForRoute + counts.staleRoutes === 0;

  const shipmentItems = (rows: TodaySummary['late']) =>
    rows.map((s) => ({
      id: s.id,
      title: <span className="font-mono">{shipmentCode(s)}</span>,
      subtitle: [s.counterparty, s.destinationAddress].filter(Boolean).join(' · '),
      meta: s.estimatedDelivery ? fmt.date(s.estimatedDelivery) : undefined,
      onClick: () => openTab(`/logistics/shipments/${s.id}`),
    }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label={t('logistics.today.toPrepare')}
          value={counts.toPrepare}
          icon={<ClipboardCheck size={16} />}
          onClick={() => onOpenSection('preparation')}
        />
        <KpiCard
          label={t('logistics.today.readyForRoute')}
          value={counts.readyForRoute}
          icon={<RouteIcon size={16} />}
          onClick={() => onOpenSection('routes')}
        />
        <KpiCard
          label={t('logistics.today.onRoute')}
          value={counts.onRoute}
          icon={<Truck size={16} />}
          onClick={() => onOpenSection('shipments')}
        />
        <KpiCard
          label={t('logistics.today.incidents')}
          value={counts.incidents}
          icon={<AlertTriangle size={16} />}
          onClick={() => onOpenSection('incidents')}
        />
        <KpiCard
          label={t('logistics.today.deliveredToday')}
          value={counts.deliveredToday}
          icon={<CheckCircle2 size={16} />}
        />
      </div>

      {data.staleRoutes.length > 0 && (
        <Alert
          tone="warning"
          title={t('logistics.today.staleRoutes', { count: data.staleRoutes.length })}
          action={
            <Button size="sm" variant="outline" onClick={() => onOpenSection('routes')}>
              {t('logistics.today.review')}
            </Button>
          }
        >
          {data.staleRoutes.map((r) => `${r.code} (${fmt.date(r.plannedDate)})`).join(', ')}
        </Alert>
      )}

      {nothing ? (
        <Card bodyClassName="py-10">
          <EmptyState icon={<CheckCircle2 size={28} />} title={t('logistics.today.allClear')} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {counts.late > 0 && (
            <Card bodyClassName="p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-fg-default mb-2">
                <Clock size={14} /> {t('logistics.today.late', { count: counts.late })}
              </h3>
              <List variant="divided" density="compact" items={shipmentItems(data.late)} />
            </Card>
          )}
          {counts.incidents > 0 && (
            <Card bodyClassName="p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-fg-default mb-2">
                <AlertTriangle size={14} />{' '}
                {t('logistics.today.incidentsTitle', { count: counts.incidents })}
              </h3>
              <List variant="divided" density="compact" items={shipmentItems(data.incidents)} />
            </Card>
          )}
          {counts.readyForRoute > 0 && (
            <Card bodyClassName="p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-fg-default mb-2">
                <RouteIcon size={14} />{' '}
                {t('logistics.today.readyTitle', { count: counts.readyForRoute })}
              </h3>
              <List variant="divided" density="compact" items={shipmentItems(data.readyForRoute)} />
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
