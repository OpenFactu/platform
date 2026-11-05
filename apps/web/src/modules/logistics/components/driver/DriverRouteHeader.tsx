import React from 'react';
import { Button, DropdownMenu, Progress, SegmentedControl } from '@openfactu/ui';
import {
  ArrowLeft,
  MapPin,
  MoreVertical,
  QrCode,
  Route as RouteIcon,
  Settings,
  Square,
  Warehouse,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { routeTally } from '../../domain/driverRoute';
import type { RouteDetail } from '../../domain/route';

export type DriverView = 'now' | 'list' | 'map';

interface Props {
  detail: RouteDetail;
  view: DriverView;
  onView: (view: DriverView) => void;
  tracking: boolean;
  mapsUrl: string | null;
  /** Paradas sin llegar: con más de una se ofrece marcarlas todas. */
  notArrived: number;
  onBack: () => void;
  onScan: () => void;
  onArriveAll: () => void;
  /** Solo si la empresa lo permite y queda algo que dejar. */
  onDrop?: () => void;
  onFinish: () => void;
  onSettings: () => void;
}

/** Arriba: qué ruta es, cómo va y entre qué vistas moverse. El resto, en el menú. */
export const DriverRouteHeader: React.FC<Props> = ({
  detail,
  view,
  onView,
  tracking,
  mapsUrl,
  notArrived,
  onBack,
  onScan,
  onArriveAll,
  onDrop,
  onFinish,
  onSettings,
}) => {
  const { t } = useI18n();
  const { route, stops } = detail;
  const tally = routeTally(stops);
  const started = route.status !== 'planned';

  const menu = [
    ...(mapsUrl
      ? [
          {
            label: t('logistics.driver.navigateRoute'),
            icon: <RouteIcon size={16} />,
            onClick: () => window.open(mapsUrl, '_blank', 'noreferrer'),
          },
        ]
      : []),
    ...(started && notArrived > 1
      ? [
          {
            label: t('logistics.driver.arrivedAll'),
            icon: <MapPin size={16} />,
            onClick: onArriveAll,
          },
        ]
      : []),
    ...(onDrop
      ? [
          {
            label: t('logistics.driver.drop.title'),
            icon: <Warehouse size={16} />,
            onClick: onDrop,
          },
        ]
      : []),
    {
      label: t('logistics.driver.settings'),
      icon: <Settings size={16} />,
      onClick: onSettings,
    },
    ...(route.status === 'active'
      ? [
          {
            label: t('logistics.driver.finishRoute'),
            icon: <Square size={16} />,
            destructive: true,
            onClick: onFinish,
          },
        ]
      : []),
  ];

  return (
    <div>
      <div className="flex items-center gap-1 px-2 py-2">
        <Button variant="ghost" size="sm" aria-label={t('logistics.driver.myRoutes')} onClick={onBack}>
          <ArrowLeft size={20} />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold text-fg-default">{route.name}</div>
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <span>{t('logistics.driver.progress', { done: tally.delivered, total: tally.total })}</span>
            {tracking && (
              <span className="inline-flex items-center gap-1 text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" /> GPS
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" aria-label={t('logistics.driver.scanArea')} onClick={onScan}>
          <QrCode size={20} />
        </Button>
        <DropdownMenu align="end" items={menu}>
          <Button variant="ghost" size="sm" aria-label={t('logistics.driver.more')}>
            <MoreVertical size={20} />
          </Button>
        </DropdownMenu>
      </div>
      {tally.total > 0 && (
        <Progress
          value={Math.round((tally.delivered / tally.total) * 100)}
          size="sm"
          className="[&>*]:rounded-none"
        />
      )}
      <div className="px-3 py-2">
        <SegmentedControl<DriverView>
          fullWidth
          size="sm"
          aria-label={t('logistics.driver.views')}
          value={view}
          onChange={onView}
          options={[
            { value: 'now', label: t('logistics.driver.now') },
            { value: 'list', label: t('logistics.driver.stops', { count: tally.total }) },
            { value: 'map', label: t('logistics.driver.map') },
          ]}
        />
      </div>
    </div>
  );
};
