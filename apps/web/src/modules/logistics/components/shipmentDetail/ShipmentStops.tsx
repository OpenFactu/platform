import React, { useMemo, useState } from 'react';
import { Badge, Button, Card, DescriptionList, Lightbox } from '@openfactu/ui';
import { Camera, Printer } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useFormat } from '@/hooks/useFormat';
import { openPdf } from '@/utils/downloadPdf';
import type { ShipmentDetailStop } from '../../domain/shipment';

const STOP_TONE: Record<string, React.ComponentProps<typeof Badge>['variant']> = {
  delivered: 'success',
  postponed: 'warning',
  exception: 'error',
  cancelled: 'neutral',
  pending: 'neutral',
  en_route: 'info',
  arrived: 'info',
};

/** Las rutas por las que ha pasado el envío y, en la que se entregó, la prueba. */
export const ShipmentStops: React.FC<{ stops: ShipmentDetailStop[] }> = ({ stops }) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const [viewing, setViewing] = useState<number | null>(null);

  const images = useMemo(
    () =>
      stops.flatMap((stop) => [
        ...(stop.signatureImage
          ? [{ src: stop.signatureImage, alt: t('logistics.shipmentDetail.pod.signature') }]
          : []),
        ...(stop.photoImage
          ? [{ src: stop.photoImage, alt: t('logistics.shipmentDetail.pod.photo') }]
          : []),
      ]),
    [stops, t],
  );

  if (stops.length === 0) return null;

  return (
    <Card bodyClassName="p-4 space-y-4">
      <h3 className="text-sm font-bold text-fg-default">{t('logistics.shipmentDetail.routes')}</h3>
      {stops.map((stop) => (
        <div key={stop.id} className="space-y-2 border-t border-border-subtle pt-3 first:border-0 first:pt-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-fg-default">{stop.routeCode}</span>
            <Badge variant={STOP_TONE[stop.status] || 'neutral'}>
              {t(`logistics.shipmentDetail.stopStatus.${stop.status}`)}
            </Badge>
            <span className="text-xs text-fg-muted">{fmt.date(stop.plannedDate)}</span>
            <span className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openPdf(`/api/logistics/routes/${stop.routeId}/sheet.pdf`)}
            >
              <Printer size={12} /> {t('logistics.routes.sheet')}
            </Button>
          </div>
          <DescriptionList
            columns={2}
            items={[
              { key: 'driver', label: t('logistics.shipmentDetail.facts.driver'), value: stop.driverName },
              { key: 'vehicle', label: t('logistics.shipmentDetail.facts.vehicle'), value: stop.vehiclePlate },
              { key: 'received', label: t('logistics.shipmentDetail.pod.receivedBy'), value: stop.recipientName },
              {
                key: 'handover',
                label: t('logistics.shipmentDetail.pod.handover'),
                value:
                  stop.handover && stop.handover !== 'customer'
                    ? t(`logistics.wizard.handover.${stop.handover}`)
                    : null,
              },
              { key: 'document', label: t('logistics.shipmentDetail.pod.document'), value: stop.recipientDocument },
              {
                key: 'departed',
                label: t('logistics.shipmentDetail.pod.at'),
                value: stop.departedAt ? fmt.date(stop.departedAt) : null,
              },
              { key: 'notes', label: t('logistics.shipmentDetail.pod.notes'), value: stop.podNotes, fullWidth: true },
            ].filter((item) => item.value)}
          />
          {(stop.signatureImage || stop.photoImage) && (
            <div className="flex gap-2">
              {[stop.signatureImage, stop.photoImage].filter(Boolean).map((src) => (
                <Button
                  key={String(src).slice(-24)}
                  variant="outline"
                  size="sm"
                  onClick={() => setViewing(images.findIndex((image) => image.src === src))}
                >
                  <Camera size={12} />
                  {src === stop.signatureImage
                    ? t('logistics.shipmentDetail.pod.signature')
                    : t('logistics.shipmentDetail.pod.photo')}
                </Button>
              ))}
            </div>
          )}
        </div>
      ))}
      <Lightbox
        images={images}
        open={viewing !== null}
        index={viewing ?? 0}
        onIndexChange={setViewing}
        onClose={() => setViewing(null)}
      />
    </Card>
  );
};
