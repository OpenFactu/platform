import React from 'react';
import { Accordion, EmptyState, List } from '@openfactu/ui';
import { MapPin } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { isOpenStop, stopAddress } from '../../domain/driverRoute';
import type { RouteStop } from '../../domain/route';
import type { Shipment } from '../../domain/shipment';
import { NumberedPin } from '../maps/MapPins';
import { StopStatusBadge } from './StopStatusBadge';

interface Props {
  stops: RouteStop[];
  shipments: Map<string, Shipment>;
  currentId: string | null;
  onPick: (stopId: string) => void;
}

/** Todas las paradas de un vistazo: las que quedan y, recogidas, las ya hechas. */
export const DriverStopList: React.FC<Props> = ({ stops, shipments, currentId, onPick }) => {
  const { t } = useI18n();
  const open = stops.filter(isOpenStop);
  const closed = stops.filter((stop) => !isOpenStop(stop));

  const toItem = (stop: RouteStop, clickable: boolean) => {
    const shipment = stop.shipmentId ? shipments.get(stop.shipmentId) : undefined;
    const address = stopAddress(stop, shipment);
    return {
      id: stop.id,
      icon: (
        <NumberedPin
          label={stop.sequence}
          onMap={false}
          tone={stop.status === 'delivered' ? 'success' : isOpenStop(stop) ? 'accent' : 'muted'}
        />
      ),
      title: shipment?.recipientName || address || '—',
      subtitle: shipment?.recipientName ? address : undefined,
      badge: <StopStatusBadge status={stop.status} isPickup={shipment?.kind === 'pickup_return'} />,
      unread: stop.id === currentId,
      onClick: clickable ? () => onPick(stop.id) : undefined,
    };
  };

  return (
    <div className="space-y-3 p-3">
      {open.length > 0 ? (
        <List variant="cards" items={open.map((stop) => toItem(stop, true))} />
      ) : (
        <EmptyState icon={<MapPin size={24} />} title={t('logistics.driver.allDoneTitle')} />
      )}
      {closed.length > 0 && (
        <Accordion
          items={[
            {
              key: 'done',
              title: t('logistics.driver.doneStops', { count: closed.length }),
              content: <List items={closed.map((stop) => toItem(stop, false))} />,
            },
          ]}
        />
      )}
    </div>
  );
};
