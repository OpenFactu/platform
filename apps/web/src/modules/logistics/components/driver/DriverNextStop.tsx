import React from 'react';
import { Alert, Badge, Button } from '@openfactu/ui';
import { Clock, MessageCircle, Navigation, Package as PackageIcon, Phone } from 'lucide-react';
import { formatDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n/I18nContext';
import type { NavigationApp } from '../../domain/deliveryFlow';
import { stopAddress, stopMapsUrl, whatsAppUrl } from '../../domain/driverRoute';
import type { RoutePackage, RouteStop } from '../../domain/route';
import type { Shipment } from '../../domain/shipment';
import { shipmentCode } from '../../domain/shipmentStatus';
import { StopStatusBadge } from './StopStatusBadge';

interface Props {
  stop: RouteStop;
  total: number;
  shipment?: Shipment;
  packages: RoutePackage[];
  navigationApp: NavigationApp;
}

/** La parada que toca, en grande: a quién, dónde y cómo llegar o llamar. */
export const DriverNextStop: React.FC<Props> = ({
  stop,
  total,
  shipment,
  packages,
  navigationApp,
}) => {
  const { t } = useI18n();
  const isPickup = shipment?.kind === 'pickup_return';
  const address = stopAddress(stop, shipment);
  const name = shipment?.recipientName;
  const href = stopMapsUrl(stop, shipment, navigationApp);
  const phone = shipment?.recipientPhone;
  const windowText = [shipment?.timeWindowFrom, shipment?.timeWindowTo].filter(Boolean).join(' – ');
  const weight = packages.reduce((sum, pkg) => sum + Number(pkg.weightKg || 0), 0);

  const openWhatsApp = () => {
    if (!phone) return;
    const key = isPickup ? 'logistics.driver.whatsapp.pickup' : 'logistics.driver.whatsapp.delivery';
    const message = t(key, { name: name ? ` ${name}` : '' });
    window.open(whatsAppUrl(phone, message), '_blank', 'noreferrer');
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-fg-muted">
          {t('logistics.driver.stopOf', { n: stop.sequence, total })}
        </span>
        <StopStatusBadge status={stop.status} isPickup={isPickup} />
        {isPickup && <Badge variant="warning">{t('logistics.driver.returnPickup')}</Badge>}
      </div>

      <div className="space-y-1">
        <div className="text-2xl font-bold leading-tight text-fg-default">
          {name || address || '—'}
        </div>
        {name && address && <div className="text-lg leading-snug text-fg-body">{address}</div>}
      </div>

      <div className="space-y-1.5 text-sm text-fg-body">
        {(stop.plannedAt || windowText) && (
          <div className="flex items-center gap-2">
            <Clock size={16} className="shrink-0 text-fg-muted" />
            <span>
              {[
                stop.plannedAt &&
                  t('logistics.driver.eta', {
                    time: formatDateTime(stop.plannedAt, { hour: '2-digit', minute: '2-digit' }),
                  }),
                windowText && t('logistics.driver.window', { window: windowText }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        )}
        {packages.length > 0 && (
          <div className="flex items-center gap-2">
            <PackageIcon size={16} className="shrink-0 text-fg-muted" />
            <span>
              {t('logistics.driver.packagesCount', { count: packages.length })}
              {weight > 0 && ` · ${weight} kg`}
            </span>
          </div>
        )}
        {shipment && <div className="font-mono text-xs text-fg-muted">{shipmentCode(shipment)}</div>}
      </div>

      {shipment?.notes && <Alert tone="info">{shipment.notes}</Alert>}

      {href && (
        <Button
          size="lg"
          variant="secondary"
          className="w-full"
          onClick={() => window.open(href, '_blank', 'noreferrer')}
        >
          <Navigation size={18} /> {t('logistics.driver.howToGet')}
        </Button>
      )}
      {phone && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              window.location.href = `tel:${phone.replace(/\s+/g, '')}`;
            }}
          >
            <Phone size={18} /> {t('logistics.driver.call')}
          </Button>
          <Button size="lg" variant="outline" onClick={openWhatsApp}>
            <MessageCircle size={18} /> WhatsApp
          </Button>
        </div>
      )}
    </div>
  );
};
