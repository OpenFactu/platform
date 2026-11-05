import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Input,
  Modal,
  SearchableSelect,
  SegmentedControl,
  Textarea,
  useToast,
} from '@openfactu/ui';
import { warehousesApi } from '@/modules/inventory/api';
import type { Warehouse } from '@/modules/inventory/domain/warehouse';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import { carriersApi, shipmentsApi } from '../api';
import type { Carrier } from '../domain/carrier';
import { AddressAutocomplete } from './maps/AddressAutocomplete';

const OWN_FLEET = 'propio';
const OTHER_CARRIER = '__custom__';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const emptyForm = () => ({ kind: 'delivery', carrier: OWN_FLEET }) as Record<string, any>;

/** Alta manual de un envío: una entrega o una recogida sin pasar por un albarán. */
export const ShipmentCreateModal: React.FC<Props> = ({ open, onClose, onCreated }) => {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState(emptyForm);
  const [carrierMode, setCarrierMode] = useState(OWN_FLEET);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);

  useEffect(() => {
    if (!open) return;
    warehousesApi
      .list()
      .then((d) => setWarehouses(Array.isArray(d) ? d : []))
      .catch(() => setWarehouses([]));
    carriersApi
      .list()
      .then((d) => setCarriers(Array.isArray(d) ? d.filter((c) => c.isActive !== false) : []))
      .catch(() => setCarriers([]));
  }, [open]);

  const set = (patch: Record<string, unknown>) => setForm((current) => ({ ...current, ...patch }));
  const isPickup = form.kind === 'pickup_return';

  const carrierOptions = useMemo(
    () => [
      { value: OWN_FLEET, label: t('logistics.shipments.ownFleet') },
      ...carriers.map((c: any) => ({ value: c.code || c.id, label: c.name })),
      { value: OTHER_CARRIER, label: t('logistics.shipments.otherCarrier') },
    ],
    [carriers, t],
  );

  const create = async () => {
    if (!String(form.destinationAddress || '').trim()) {
      toast.error(
        isPickup
          ? t('logistics.shipments.pickupAddressRequired')
          : t('logistics.shipments.destinationAddressRequired'),
      );
      return;
    }
    if (isPickup && !form.returnWarehouseId) {
      toast.error(t('logistics.shipments.returnWarehouseRequired'));
      return;
    }
    try {
      const created = await shipmentsApi.create(form);
      toast.success(t('logistics.shipments.created', { code: created.code || '' }));
      setForm(emptyForm());
      setCarrierMode(OWN_FLEET);
      onClose();
      onCreated();
    } catch (err) {
      const message = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(message || t('logistics.common.error'));
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t('logistics.shipments.new')}
      subtitle={t('logistics.shipments.modal.subtitle')}
      maxWidth="md"
    >
      <div className="space-y-4 pt-4">
        <SegmentedControl
          value={form.kind}
          onChange={(kind: string) => set({ kind })}
          options={[
            { value: 'delivery', label: t('logistics.shipments.modal.delivery') },
            { value: 'pickup_return', label: t('logistics.shipments.modal.pickupReturn') },
          ]}
        />
        {isPickup && (
          <p className="text-xs text-fg-muted">{t('logistics.shipments.modal.pickupHint')}</p>
        )}

        <AddressAutocomplete
          label={
            isPickup
              ? t('logistics.shipments.modal.pickupAddress')
              : t('logistics.shipments.modal.destinationAddress')
          }
          required
          placeholder={
            isPickup
              ? t('logistics.shipments.modal.pickupPlaceholder')
              : t('logistics.shipments.modal.destinationPlaceholder')
          }
          value={form.destinationAddress || ''}
          // Al teclear libre se invalidan las coordenadas: solo vienen de una sugerencia.
          onTextChange={(text) =>
            set({ destinationAddress: text, destinationLat: null, destinationLng: null })
          }
          onSelect={(s) =>
            set({ destinationAddress: s.label, destinationLat: s.lat, destinationLng: s.lng })
          }
        />

        {isPickup && (
          <SearchableSelect
            label={t('logistics.shipments.modal.returnWarehouse')}
            required
            helperText={t('logistics.shipments.modal.returnWarehouseHint')}
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            value={form.returnWarehouseId || ''}
            onChange={(v) => set({ returnWarehouseId: v || null })}
            placeholder={t('logistics.common.selectPlaceholder')}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label={
              isPickup
                ? t('logistics.shipments.modal.pickupContact')
                : t('logistics.shipments.modal.recipient')
            }
            value={form.recipientName || ''}
            onChange={(e) => set({ recipientName: e.target.value })}
          />
          <Input
            label={t('logistics.shipments.modal.phone')}
            value={form.recipientPhone || ''}
            onChange={(e) => set({ recipientPhone: e.target.value })}
          />
          <Input
            label={t('logistics.shipments.modal.emailPlaceholder')}
            type="email"
            value={form.recipientEmail || ''}
            onChange={(e) => set({ recipientEmail: e.target.value })}
            containerClassName="sm:col-span-2"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SearchableSelect
            label={t('logistics.shipments.modal.operator')}
            options={carrierOptions}
            value={carrierMode}
            onChange={(v) => {
              setCarrierMode(v);
              set({ carrier: v === OTHER_CARRIER ? '' : v });
            }}
          />
          <Input
            label={t('logistics.shipments.modal.trackingNumber')}
            value={form.trackingNumber || ''}
            onChange={(e) => set({ trackingNumber: e.target.value })}
            placeholder={t('logistics.shipments.modal.optional')}
          />
          {carrierMode === OTHER_CARRIER && (
            <Input
              label={t('logistics.shipments.modal.carrierName')}
              value={form.carrier || ''}
              onChange={(e) => set({ carrier: e.target.value })}
              containerClassName="sm:col-span-2"
            />
          )}
        </div>

        {/* datetime-local: la librería no tiene selector de fecha y hora. */}
        <Input
          label={t('logistics.shipments.modal.estimatedDelivery')}
          type="datetime-local"
          value={form.estimatedDelivery || ''}
          onChange={(e) => set({ estimatedDelivery: e.target.value || null })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('logistics.shipments.modal.windowFrom')}
            type="time"
            value={form.timeWindowFrom || ''}
            onChange={(e) => set({ timeWindowFrom: e.target.value || null })}
          />
          <Input
            label={t('logistics.shipments.modal.windowTo')}
            type="time"
            value={form.timeWindowTo || ''}
            onChange={(e) => set({ timeWindowTo: e.target.value || null })}
          />
        </div>
        <Textarea
          label={t('logistics.shipments.modal.internalNotes')}
          rows={2}
          value={form.notes || ''}
          onChange={(e) => set({ notes: e.target.value || null })}
          placeholder={t('logistics.shipments.modal.notesPlaceholder')}
        />

        <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
          <Button variant="secondary" onClick={onClose}>
            {t('logistics.common.cancel')}
          </Button>
          <Button onClick={create}>{t('logistics.common.create')}</Button>
        </div>
      </div>
    </Modal>
  );
};
