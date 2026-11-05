import React from 'react';
import { Badge, Button, Card, EmptyState, List } from '@openfactu/ui';
import { Package as PackageIcon, Printer } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { openPdf } from '@/utils/downloadPdf';
import { packageTone } from '../../domain/packageStatus';
import type { ShipmentDetailPackage } from '../../domain/shipment';

interface Props {
  shipmentId: string;
  packages: ShipmentDetailPackage[];
}

/** Las cajas del envío, qué lleva cada una y sus papeles. */
export const ShipmentPackages: React.FC<Props> = ({ shipmentId, packages }) => {
  const { t } = useI18n();

  return (
    <Card bodyClassName="p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-fg-default">
          {t('logistics.shipmentDetail.packages', { count: packages.length })}
        </h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openPdf(`/api/logistics/shipments/${shipmentId}/packing-list.pdf`)}
          >
            <Printer size={12} /> {t('logistics.shipmentDetail.packingList')}
          </Button>
          {packages.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openPdf(`/api/logistics/shipments/${shipmentId}/labels.pdf`)}
            >
              <Printer size={12} /> {t('logistics.shipmentDetail.labels')}
            </Button>
          )}
        </div>
      </div>
      {packages.length === 0 ? (
        <EmptyState icon={<PackageIcon size={22} />} title={t('logistics.shipmentDetail.noPackages')} />
      ) : (
        <List
          variant="divided"
          density="compact"
          items={packages.map((pkg) => ({
            id: pkg.id,
            title: <span className="font-mono">{pkg.code}</span>,
            subtitle: pkg.lines
              .map((line) => `${line.quantity} × ${line.itemName || line.itemCode}`)
              .join(' · '),
            meta: pkg.weightKg != null ? `${pkg.weightKg} kg` : undefined,
            badge: (
              <Badge variant={packageTone(pkg.status)}>
                {t(`logistics.packages.status.${pkg.status}`)}
              </Badge>
            ),
          }))}
        />
      )}
    </Card>
  );
};
