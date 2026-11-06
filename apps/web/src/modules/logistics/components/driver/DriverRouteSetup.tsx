import React from 'react';
import { List } from '@openfactu/ui';
import { MapPin, Navigation, Truck, Warehouse } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import type { DeliveryFlow } from '../../domain/deliveryFlow';
import { placeMapsUrl } from '../../domain/driverRoute';
import type { RouteDetail, RoutePackage } from '../../domain/route';
import { DriverLoadOut } from './DriverLoadOut';

interface Props {
  detail: RouteDetail;
  flow: DeliveryFlow;
  packages: RoutePackage[];
  onTogglePackage: (packageId: string, loaded: boolean) => void;
}

/** Antes de salir: cuánto hay que repartir, con qué vehículo y qué cargar en cada acopio. */
export const DriverRouteSetup: React.FC<Props> = ({ detail, flow, packages, onTogglePackage }) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const { route, stops, vehicle, pickups } = detail;
  const loading = flow.loadOut !== 'off' && packages.length > 0;

  return (
    <div className="space-y-4 p-4">
      <div>
        <div className="text-2xl font-bold leading-tight text-fg-default">
          {t('logistics.driver.setupTitle')}
        </div>
        <div className="text-sm text-fg-muted">
          {route.code} · {fmt.date(route.plannedDate)}
        </div>
      </div>

      <div className="flex items-center gap-3 text-lg text-fg-body">
        <MapPin size={20} className="shrink-0 text-fg-muted" />
        {t('logistics.driver.stops', { count: stops.length })}
      </div>

      {vehicle && (
        <div className="flex items-center gap-3 text-lg text-fg-body">
          <Truck size={20} className="shrink-0 text-fg-muted" />
          <span className="font-mono font-bold text-fg-default">{vehicle.plate}</span>
          <span className="text-sm text-fg-muted">
            {[vehicle.brand, vehicle.model].filter(Boolean).join(' ')}
          </span>
        </div>
      )}

      {loading ? (
        <DriverLoadOut
          detail={detail}
          flow={flow}
          packages={packages}
          onToggle={onTogglePackage}
        />
      ) : (
        pickups &&
        pickups.length > 0 && (
          <div className="space-y-1">
            <div className="text-sm font-semibold text-fg-muted">
              {t('logistics.driver.pickupAt')}
            </div>
            <List
              variant="bordered"
              items={pickups.map((pickup) => {
                const href = placeMapsUrl(
                  { lat: pickup.lat, lng: pickup.lng, address: pickup.address },
                  flow.map.navigationApp,
                );
                return {
                  id: pickup.id,
                  icon: <Warehouse size={18} />,
                  title: pickup.platform ? `${pickup.name} · ${pickup.platform.name}` : pickup.name,
                  subtitle: `${pickup.address || pickup.platform?.address || t('logistics.driver.noAddress')} · ${pickup.packageCount} ${t('logistics.driver.packagesWord', { count: pickup.packageCount })}`,
                  actions: href
                    ? [
                        {
                          icon: <Navigation size={16} />,
                          label: t('logistics.driver.go'),
                          onClick: () => window.open(href, '_blank', 'noreferrer'),
                        },
                      ]
                    : undefined,
                };
              })}
            />
          </div>
        )
      )}

      <p className="text-sm text-fg-muted">{t('logistics.driver.startRouteHint')}</p>
    </div>
  );
};
