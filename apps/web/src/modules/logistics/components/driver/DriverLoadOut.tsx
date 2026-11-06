import React from 'react';
import { Button, Checkbox, Progress } from '@openfactu/ui';
import { Navigation, Warehouse } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import type { DeliveryFlow } from '../../domain/deliveryFlow';
import { placeMapsUrl } from '../../domain/driverRoute';
import type { RouteDetail, RoutePackage } from '../../domain/route';

interface Props {
  detail: RouteDetail;
  flow: DeliveryFlow;
  packages: RoutePackage[];
  onToggle: (packageId: string, loaded: boolean) => void;
}

const NO_AREA = '';

/**
 * Cargar antes de salir, acopio por acopio. Si la empresa pide escanear, marcar a mano
 * no vale: solo se marcan al leer su etiqueta.
 */
export const DriverLoadOut: React.FC<Props> = ({ detail, flow, packages, onToggle }) => {
  const { t } = useI18n();
  const loaded = packages.filter((pkg) => pkg.loadedAt).length;
  const shipmentOf = (pkg: RoutePackage) =>
    detail.shipments.find((shipment) => shipment.id === pkg.shipmentId);

  const groups = new Map<string, RoutePackage[]>();
  for (const pkg of packages) {
    const key = pkg.stagingAreaId ?? NO_AREA;
    groups.set(key, [...(groups.get(key) ?? []), pkg]);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-sm font-semibold text-fg-default">
          {t('logistics.driver.loadOut.progress', { done: loaded, total: packages.length })}
        </div>
        <Progress value={Math.round((loaded / packages.length) * 100)} size="sm" />
      </div>

      {[...groups.entries()].map(([areaId, rows]) => {
        const area = detail.pickups?.find((pickup) => pickup.id === areaId);
        const href = area
          ? placeMapsUrl(
              { lat: area.lat, lng: area.lng, address: area.address },
              flow.map.navigationApp,
            )
          : null;
        return (
          <section key={areaId} className="space-y-2">
            <div className="flex items-center gap-2">
              <Warehouse size={16} className="shrink-0 text-fg-muted" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-fg-default">
                  {area?.name ?? t('logistics.driver.loadOut.noArea')}
                </div>
                {area?.address && (
                  <div className="truncate text-xs text-fg-muted">{area.address}</div>
                )}
              </div>
              {href && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => window.open(href, '_blank', 'noreferrer')}
                >
                  <Navigation size={14} /> {t('logistics.driver.go')}
                </Button>
              )}
            </div>
            {rows.map((pkg) => (
              <div key={pkg.id} className="rounded-lg border border-border-default bg-bg-card p-3">
                <Checkbox
                  checked={!!pkg.loadedAt}
                  disabled={flow.loadOut === 'scan'}
                  onChange={(on) => onToggle(pkg.id, on)}
                  label={<span className="font-mono text-base">{pkg.code}</span>}
                  description={[
                    shipmentOf(pkg)?.recipientName,
                    pkg.weightKg ? `${Number(pkg.weightKg)} kg` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
};
