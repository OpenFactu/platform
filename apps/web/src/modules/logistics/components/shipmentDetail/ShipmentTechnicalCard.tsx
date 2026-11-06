import React from 'react';
import { Accordion, CopyButton } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import type { Shipment } from '../../domain/shipment';

/**
 * Lo que necesita quien conecta un localizador GPS: solo lo ven los administradores
 * y no estorba a los demás.
 */
export const ShipmentTechnicalCard: React.FC<{ shipment: Shipment }> = ({ shipment }) => {
  const { t } = useI18n();
  const positionUrl = `${window.location.origin}/api/logistics/track/${shipment.trackerToken}/position`;
  const trackingUrl = `${window.location.origin}/track/${shipment.reportToken}`;

  return (
    <Accordion
      items={[
        {
          key: 'technical',
          title: t('logistics.shipmentDetail.technical'),
          content: (
            <div className="space-y-3 text-xs text-fg-body">
              <p>
                {t('logistics.shipmentDetail.positionHintBefore')} <code>POST</code>{' '}
                {t('logistics.shipmentDetail.positionHintAfter')}
              </p>
              <div className="font-mono break-all rounded bg-bg-muted p-2">{positionUrl}</div>
              <CopyButton value={positionUrl} variant="secondary" label={t('logistics.shipmentDetail.copyPositionUrl')} />
              <div className="font-mono break-all rounded bg-bg-muted p-2">{trackingUrl}</div>
              <CopyButton value={trackingUrl} variant="secondary" label={t('logistics.shipmentDetail.copyTrackingLink')} />
            </div>
          ),
        },
      ]}
    />
  );
};
