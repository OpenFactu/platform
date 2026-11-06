import React from 'react';
import {
  Badge,
  Button,
  DatePicker,
  EmptyState,
  List,
  Progress,
  SegmentedControl,
  Spinner,
} from '@openfactu/ui';
import { ArrowLeft, QrCode, Route as RouteIcon, Settings } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import { todayStr } from '../../domain/driverRoute';
import type { Route } from '../../domain/route';
import { DriverScreen } from './DriverScreen';

interface Props {
  userName: string;
  loading: boolean;
  hasRoutes: boolean;
  routes: Route[];
  dateFilter: string;
  onDateFilter: (value: string) => void;
  onOpen: (routeId: string) => void;
  onScan: () => void;
  onSettings: () => void;
  /** Volver al ERP; quien solo es conductor no tiene adónde. */
  onExit?: () => void;
}

/** Las rutas del conductor, por defecto las de hoy. */
export const DriverRouteList: React.FC<Props> = ({
  userName,
  loading,
  hasRoutes,
  routes,
  dateFilter,
  onDateFilter,
  onOpen,
  onScan,
  onSettings,
  onExit,
}) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const today = todayStr();

  return (
    <DriverScreen
      header={
        <div className="flex items-center gap-2 px-3 py-3">
          {onExit && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('logistics.driver.settingsModal.backToErp')}
              onClick={onExit}
            >
              <ArrowLeft size={20} />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold text-fg-default">
              {t('logistics.driver.greeting', { name: userName })}
            </div>
            <div className="text-xs text-fg-muted">{t('logistics.driver.assignedRoutes')}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('logistics.driver.settings')}
            onClick={onSettings}
          >
            <Settings size={20} />
          </Button>
        </div>
      }
      footer={
        <Button size="lg" className="w-full" onClick={onScan}>
          <QrCode size={20} /> {t('logistics.driver.scanButton')}
        </Button>
      }
    >
      <div className="space-y-3 p-3">
        <div className="space-y-2">
          <SegmentedControl<string>
            fullWidth
            size="md"
            aria-label={t('logistics.driver.assignedRoutes')}
            value={dateFilter === today ? 'today' : !dateFilter ? 'all' : ''}
            onChange={(value) => onDateFilter(value === 'today' ? today : '')}
            options={[
              { value: 'today', label: t('logistics.driver.today') },
              { value: 'all', label: t('logistics.driver.all') },
            ]}
          />
          <DatePicker
            value={dateFilter || null}
            onChange={(value) => onDateFilter(value ?? '')}
            clearable
            className="w-full"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : !hasRoutes ? (
          <EmptyState icon={<RouteIcon size={24} />} title={t('logistics.driver.noRoutes')} />
        ) : routes.length === 0 ? (
          <EmptyState
            icon={<RouteIcon size={24} />}
            title={
              dateFilter === today
                ? t('logistics.driver.noRoutesToday')
                : t('logistics.driver.noRoutesThatDay')
            }
            hint={t('logistics.driver.noRoutesHint')}
            action={
              <Button size="sm" variant="secondary" onClick={() => onDateFilter('')}>
                {t('logistics.driver.viewAll')}
              </Button>
            }
          />
        ) : (
          <List
            variant="cards"
            items={routes.map((route) => {
              const total = route.stopsTotal ?? 0;
              const done = route.stopsDelivered ?? 0;
              return {
                id: route.id,
                title: <span className="text-base font-semibold">{route.name}</span>,
                subtitle: `${route.code} · ${fmt.date(route.plannedDate)}${route.vehiclePlate ? ` · ${route.vehiclePlate}` : ''}`,
                badge: (
                  <Badge variant={route.status === 'active' ? 'info' : 'neutral'}>
                    {t(`logistics.status.route.${route.status}`)}
                  </Badge>
                ),
                content:
                  total > 0 ? (
                    <div className="mt-2 space-y-1">
                      <div className="text-xs text-fg-muted">
                        {t('logistics.driver.progress', { done, total })}
                      </div>
                      <Progress value={Math.round((done / total) * 100)} size="sm" />
                    </div>
                  ) : undefined,
                onClick: () => onOpen(route.id),
              };
            })}
          />
        )}
      </div>
    </DriverScreen>
  );
};
