import React from 'react';
import { Card, DescriptionList } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { useFormat } from '@/hooks/useFormat';
import type { Shipment } from '../../domain/shipment';

const OWN_CARRIER = 'propio';

/** Quién, de dónde y cómo: lo primero que se pregunta de un envío. */
export const ShipmentFacts: React.FC<{ shipment: Shipment }> = ({ shipment }) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const isPickup = shipment.direction === 'pickup';
  const isInbound = shipment.direction === 'in';
  const addressLabel = isInbound
    ? t('logistics.shipmentDetail.receivingAt')
    : isPickup
      ? t('logistics.shipmentDetail.pickupAddress')
      : t('logistics.shipmentDetail.shippingAddress');

  const items = [
    {
      key: 'counterparty',
      label: isInbound
        ? t('logistics.shipmentDetail.facts.supplier')
        : t('logistics.shipmentDetail.facts.customer'),
      value: shipment.counterparty as string,
    },
    {
      key: 'document',
      label: t('logistics.shipmentDetail.facts.document'),
      value: shipment.documentNumber as string,
      mono: true,
    },
    {
      key: 'phone',
      label: t('logistics.shipmentDetail.facts.phone'),
      value: shipment.contactPhone as string,
    },
    {
      key: 'email',
      label: t('logistics.shipmentDetail.facts.email'),
      value: shipment.contactEmail as string,
    },
    { key: 'address', label: addressLabel, value: shipment.destinationAddress, fullWidth: true },
    {
      key: 'route',
      label: t('logistics.shipmentDetail.facts.route'),
      value: shipment.routeCode as string,
      mono: true,
    },
    {
      key: 'driver',
      label: t('logistics.shipmentDetail.facts.driver'),
      value: (shipment.routeDriver as string) || shipment.driverName,
    },
    {
      key: 'vehicle',
      label: t('logistics.shipmentDetail.facts.vehicle'),
      value: (shipment.routeVehicle as string) || shipment.vehiclePlate,
      mono: true,
    },
    {
      key: 'carrier',
      label: t('logistics.shipmentDetail.facts.carrier'),
      value:
        shipment.carrier === OWN_CARRIER ? t('logistics.shipments.ownFleet') : shipment.carrier,
    },
    {
      key: 'tracking',
      label: t('logistics.shipmentDetail.facts.trackingNumber'),
      value: shipment.trackingNumber,
      mono: true,
    },
    {
      key: 'eta',
      label: t('logistics.shipmentDetail.facts.estimated'),
      value: shipment.estimatedDelivery ? fmt.date(shipment.estimatedDelivery) : null,
    },
    {
      key: 'window',
      label: t('logistics.shipmentDetail.facts.window'),
      value: [shipment.timeWindowFrom, shipment.timeWindowTo].filter(Boolean).join(' – '),
    },
    { key: 'notes', label: t('logistics.shipmentDetail.facts.notes'), value: shipment.notes, fullWidth: true },
  ].filter((item) => item.value);

  return (
    <Card bodyClassName="p-4">
      <DescriptionList items={items} columns={2} />
    </Card>
  );
};
