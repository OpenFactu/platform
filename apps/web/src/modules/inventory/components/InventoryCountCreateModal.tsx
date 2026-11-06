import React, { useEffect, useMemo, useState } from 'react';
import { Button, Modal, SearchableSelect, Select, Switch, Textarea, useToast } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { inventoryCountsApi } from '../api/inventoryCountsApi';
import type { CountOptions } from '../domain/inventoryCount';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

const EMPTY: CountOptions = { warehouses: [], zones: [], categories: [] };

/** Abrir un recuento: qué se cuenta y si se ve lo que dice el sistema. */
export const InventoryCountCreateModal: React.FC<Props> = ({ open, onClose, onCreated }) => {
  const { t } = useI18n();
  const toast = useToast();
  const [options, setOptions] = useState<CountOptions>(EMPTY);
  const [warehouseId, setWarehouseId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [blind, setBlind] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setZoneId('');
    setCategoryId('');
    setBlind(false);
    setNotes('');
    inventoryCountsApi
      .options()
      .then((data) => {
        setOptions(data);
        setWarehouseId(data.warehouses.length === 1 ? data.warehouses[0].id : '');
      })
      .catch(() => toast.error(t('inventory.counts.loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const zones = useMemo(
    () => options.zones.filter((zone) => zone.warehouseId === warehouseId),
    [options.zones, warehouseId],
  );

  const submit = async () => {
    setSaving(true);
    try {
      const created = await inventoryCountsApi.open({
        warehouseId,
        zoneId: zoneId || null,
        categoryId: categoryId || null,
        blind,
        notes: notes.trim() || null,
      });
      onCreated(created.id);
    } catch (error) {
      toast.error(
        (error instanceof Error ? error.message : undefined) || t('inventory.counts.saveError'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal noBodyPadding isOpen={open} onClose={onClose} title={t('inventory.counts.newTitle')}>
      <Modal.Body>
        <div className="space-y-4">
          <Select
            label={t('inventory.counts.warehouse')}
            required
            value={warehouseId}
            onChange={(value) => {
              setWarehouseId(value);
              setZoneId('');
            }}
            placeholder={t('inventory.counts.chooseWarehouse')}
            options={options.warehouses.map((row) => ({ value: row.id, label: row.name }))}
          />
          {zones.length > 0 && (
            <SearchableSelect
              label={t('inventory.counts.zone')}
              value={zoneId}
              onChange={setZoneId}
              clearable
              placeholder={t('inventory.counts.allZones')}
              options={zones.map((row) => ({ value: row.id, label: row.name }))}
            />
          )}
          {options.categories.length > 0 && (
            <SearchableSelect
              label={t('inventory.counts.category')}
              value={categoryId}
              onChange={setCategoryId}
              clearable
              placeholder={t('inventory.counts.allCategories')}
              options={options.categories.map((row) => ({ value: row.id, label: row.name }))}
            />
          )}
          <div>
            <Switch label={t('inventory.counts.blind')} checked={blind} onChange={setBlind} />
            <p className="mt-1 text-xs text-fg-muted">{t('inventory.counts.blindHint')}</p>
          </div>
          <Textarea
            label={t('inventory.counts.notes')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
          />
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t('inventory.counts.cancelAction')}
        </Button>
        <Button onClick={submit} disabled={!warehouseId} isLoading={saving}>
          {t('inventory.counts.openAction')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
