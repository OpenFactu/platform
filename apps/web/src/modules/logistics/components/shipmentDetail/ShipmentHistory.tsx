import React, { useMemo } from 'react';
import { Card, Timeline, type TimelineEvent, type TimelineTone } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { stateLabelKey } from '../../domain/shipmentStatus';
import type { ShipmentEvent } from '../../domain/shipment';

const TONE_BY_STATE: Record<string, TimelineTone> = {
  delivered: 'success',
  received: 'success',
  exception: 'danger',
  returned: 'danger',
  postponed: 'warning',
};

/** El historial en palabras: lo que pasó, no el nombre interno del evento. */
export const ShipmentHistory: React.FC<{ events: ShipmentEvent[]; isPickup: boolean }> = ({
  events,
  isPickup,
}) => {
  const { t } = useI18n();

  const items = useMemo<TimelineEvent[]>(
    () =>
      events.map((event) => {
        const isStateChange = event.kind === 'status_change' && event.status;
        return {
          id: event.id,
          title: isStateChange
            ? t(stateLabelKey(event.status as string, isPickup))
            : t(`logistics.shipmentDetail.eventKind.${event.kind}`),
          description: event.description || undefined,
          date: event.createdAt,
          tone: isStateChange
            ? TONE_BY_STATE[event.status as string] || 'default'
            : event.kind === 'shortage' || event.kind === 'incident'
              ? 'warning'
              : 'default',
        };
      }),
    [events, isPickup, t],
  );

  return (
    <Card bodyClassName="p-4">
      <h3 className="text-sm font-bold text-fg-default mb-3">
        {t('logistics.shipmentDetail.history')}
      </h3>
      <Timeline events={items} variant="compacto" emptyMessage={t('logistics.shipmentDetail.noEvents')} />
    </Card>
  );
};
