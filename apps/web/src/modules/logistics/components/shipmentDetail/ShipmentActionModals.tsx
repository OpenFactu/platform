import React, { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Input, Modal, SearchableSelect, Textarea } from '@openfactu/ui';
import { logisticsApi } from '../../api';
import type { CarrierAccountOption } from '../../domain/carrier';
import { warehousesApi } from '@/modules/inventory/api';
import type { Warehouse } from '@/modules/inventory/domain/warehouse';
import { useI18n } from '@/i18n/I18nContext';
import { routesApi } from '../../api';
import type { Route } from '../../domain/route';
import type { Shipment } from '../../domain/shipment';
import { RoutePicker } from '../RoutePicker';

export type ShipmentModal =
  | 'cancel'
  | 'return'
  | 'pickup'
  | 'dispatch'
  | 'carrier'
  | 'postpone'
  | 'incident';

export interface ModalSubmit {
  reason: string | null;
  cancelDeliveryNote: boolean;
  warehouseId: string | null;
  routeId: string | null;
  carrierAccountId: string | null;
  trackingNumber: string | null;
}

interface Props {
  modal: ShipmentModal | null;
  shipment: Shipment;
  onClose: () => void;
  onSubmit: (modal: ShipmentModal, values: ModalSubmit) => void;
}

const REASON_REQUIRED: readonly ShipmentModal[] = ['incident'];

/** Las acciones que piden algo antes de hacerse: un motivo, un almacén o una ruta. */
export const ShipmentActionModals: React.FC<Props> = ({ modal, shipment, onClose, onSubmit }) => {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [cancelDeliveryNote, setCancelDeliveryNote] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [accounts, setAccounts] = useState<CarrierAccountOption[]>([]);
  const [accountId, setAccountId] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');

  useEffect(() => {
    setReason('');
    setCancelDeliveryNote(false);
    setWarehouseId('');
    setRouteId('');
    setAccountId('');
    setTrackingNumber('');
    if (modal === 'carrier') {
      logisticsApi
        .carrierAccounts()
        .then((d) => {
          const list = Array.isArray(d) ? d : [];
          setAccounts(list);
          setAccountId(list.find((a) => a.isDefault)?.id || '');
        })
        .catch(() => setAccounts([]));
    }
    if (modal === 'pickup') {
      warehousesApi
        .list()
        .then((d) => setWarehouses(Array.isArray(d) ? d : []))
        .catch(() => setWarehouses([]));
    }
    if (modal === 'dispatch') {
      routesApi
        .list()
        .then((d) => setRoutes(Array.isArray(d) ? d : []))
        .catch(() => setRoutes([]));
    }
  }, [modal]);

  if (!modal) return null;

  const submit = () =>
    onSubmit(modal, {
      reason: reason.trim() || null,
      cancelDeliveryNote,
      warehouseId: warehouseId || null,
      routeId: routeId || null,
      carrierAccountId: accountId || null,
      trackingNumber: trackingNumber.trim() || null,
    });

  const title = t(`logistics.shipmentDetail.modals.${modal}.title`);
  const account = accounts.find((a) => a.id === accountId);
  const canSubmit =
    (modal !== 'dispatch' || !!routeId) &&
    (modal !== 'carrier' || (!!account && (!account.manual || !!trackingNumber.trim()))) &&
    (!REASON_REQUIRED.includes(modal) || !!reason.trim());
  const offersNoteCancel = (modal === 'cancel' || modal === 'return') && !!shipment.deliveryNoteId;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      subtitle={t(`logistics.shipmentDetail.modals.${modal}.subtitle`)}
    >
      <div className="space-y-4">
        {modal === 'pickup' && (
          <p className="text-xs text-fg-body rounded-lg bg-bg-muted px-3 py-2">
            {t('logistics.shipmentDetail.pickupModal.collectAt')}{' '}
            <b>{shipment.destinationAddress || '—'}</b>
          </p>
        )}
        {modal === 'carrier' ? (
          <>
            {accounts.length === 0 && (
              <Alert tone="warning">
                {t('logistics.shipmentDetail.modals.carrier.noAccounts')}
              </Alert>
            )}
            <SearchableSelect
              label={t('logistics.shipmentDetail.modals.carrier.account')}
              required
              options={accounts.map((a) => ({
                value: a.id,
                label: `${a.carrierName} · ${a.name}`,
              }))}
              value={accountId}
              onChange={setAccountId}
              placeholder={t('logistics.common.selectPlaceholder')}
            />
            {account?.manual && (
              <Input
                label={t('logistics.shipmentDetail.modals.carrier.trackingNumber')}
                requiredMark
                helperText={t('logistics.shipmentDetail.modals.carrier.manualHint')}
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
              />
            )}
          </>
        ) : modal === 'dispatch' ? (
          <RoutePicker
            value={routeId}
            onChange={setRouteId}
            routes={routes}
            filterStatuses={['planned', 'active']}
            placeholder={t('logistics.shipmentDetail.modals.dispatch.choose')}
          />
        ) : modal === 'incident' ? (
          <Textarea
            label={t('logistics.shipmentDetail.reason')}
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        ) : (
          <Input
            label={t('logistics.shipmentDetail.reason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        {modal === 'pickup' && (
          <SearchableSelect
            label={t('logistics.shipmentDetail.pickupModal.returnWarehouse')}
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            value={warehouseId}
            onChange={setWarehouseId}
            placeholder={
              shipment.deliveryNoteId
                ? t('logistics.shipmentDetail.pickupModal.autoWarehouse')
                : t('logistics.shipmentDetail.pickupModal.chooseWarehouse')
            }
            clearable
          />
        )}
        {offersNoteCancel && (
          <Checkbox
            checked={cancelDeliveryNote}
            onChange={setCancelDeliveryNote}
            label={t(`logistics.shipmentDetail.${modal}Modal.cancelDn`)}
            description={t(`logistics.shipmentDetail.${modal}Modal.cancelDnHint`)}
          />
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {t('logistics.shipmentDetail.back')}
          </Button>
          <Button
            variant={modal === 'cancel' ? 'danger' : 'primary'}
            onClick={submit}
            disabled={!canSubmit}
          >
            {title}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
