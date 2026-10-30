import React from 'react';
import { NumberInput, RadioGroup, SearchableSelect } from '@openfactu/ui';
import type { ItemFormValues } from '../hooks/useItemForm';
import type { Warehouse, Zone } from '../domain/warehouse';
import { useI18n } from '@/i18n/I18nContext';

interface Props {
  values: ItemFormValues;
  set: <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) => void;
  warehouses: Warehouse[];
  zones: Zone[];
}

/** Producto normal o caja de embalaje (las cajas salen en Logística → Paquetes). */
const KIND_OPTIONS = [
  {
    value: 'product',
    label: 'inventory.itemFields.kind.product',
    description: 'inventory.itemFields.kind.productDesc',
  },
  {
    value: 'box',
    label: 'inventory.itemFields.kind.box',
    description: 'inventory.itemFields.kind.boxDesc',
  },
];

const MANAGE_BY_OPTIONS = [
  {
    value: 'N',
    label: 'inventory.itemFields.manageBy.standard',
    description: 'inventory.itemFields.manageBy.standardDesc',
  },
  {
    value: 'B',
    label: 'inventory.itemFields.manageBy.batches',
    description: 'inventory.itemFields.manageBy.batchesDesc',
  },
  {
    value: 'S',
    label: 'inventory.itemFields.manageBy.serials',
    description: 'inventory.itemFields.manageBy.serialsDesc',
  },
];

/** Dimensiones en mm (enteras) y pesos en kg (2 decimales) de la caja. */
const BOX_MM_FIELDS = [
  ['boxLengthMm', 'inventory.itemFields.box.length'],
  ['boxWidthMm', 'inventory.itemFields.box.width'],
  ['boxHeightMm', 'inventory.itemFields.box.height'],
] as const;

const BOX_KG_FIELDS = [
  ['boxMaxWeightKg', 'inventory.itemFields.box.maxWeight'],
  ['boxTareWeightKg', 'inventory.itemFields.box.tare'],
] as const;

/**
 * Sección "Logística": tipo de artículo (producto/caja con dimensiones),
 * trazabilidad y ubicación por defecto. JSX extraído del antiguo modal.
 */
export const ItemLogisticsFields: React.FC<Props> = ({ values, set, warehouses, zones }) => {
  const { t } = useI18n();
  const translateOptions = (opts: { value: string; label: string; description: string }[]) =>
    opts.map((o) => ({ ...o, label: t(o.label), description: t(o.description) }));
  const warehouseOptions = warehouses.map((w) => ({ value: w.id, label: w.name }));
  const zoneOptions = zones
    .filter((z) => !values.defaultWarehouseId || z.warehouseId === values.defaultWarehouseId)
    .map((z) => ({ value: z.id, label: z.name }));

  return (
    <div className="space-y-6">
      {/* Tipo de artículo y trazabilidad: elegir uno de N con descripción, es
          decir RadioGroup — antes eran tarjetas pintadas a mano. */}
      <div className="p-4 bg-bg-muted border border-border-default">
        <RadioGroup
          label={t('inventory.itemFields.kindLabel')}
          orientation="horizontal"
          options={translateOptions(KIND_OPTIONS)}
          value={values.kind}
          onChange={(v) => set('kind', v as 'product' | 'box')}
        />

        {values.kind === 'box' && (
          <div className="mt-4 pt-4 border-t border-border-default space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">
              {t('inventory.itemFields.box.dimensions')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {BOX_MM_FIELDS.map(([key, label]) => (
                <NumberInput
                  key={key}
                  label={t(label)}
                  value={values[key]}
                  onChange={(v) => set(key, v)}
                  min={0}
                  inputSize="sm"
                />
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {BOX_KG_FIELDS.map(([key, label]) => (
                <NumberInput
                  key={key}
                  label={t(label)}
                  value={values[key]}
                  onChange={(v) => set(key, v)}
                  min={0}
                  precision={2}
                  inputSize="sm"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-bg-muted border border-border-default">
        <RadioGroup
          label={t('inventory.itemFields.manageByLabel')}
          options={translateOptions(MANAGE_BY_OPTIONS)}
          value={values.manageBy}
          onChange={(v) => set('manageBy', v)}
        />
      </div>

      <div className="p-4 bg-bg-muted border border-border-default">
        <label className="text-[11px] font-black text-fg-default uppercase tracking-widest mb-3 block">
          {t('inventory.itemFields.defaultLocation')}
        </label>
        <p className="text-[11px] text-fg-muted mb-4">
          {t('inventory.itemFields.defaultLocationHint')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-fg-muted block mb-1">
              {t('inventory.itemFields.warehouse')}
            </label>
            <SearchableSelect
              options={warehouseOptions}
              value={values.defaultWarehouseId}
              onChange={(v) => {
                set('defaultWarehouseId', v);
                // Si la zona guardada no pertenece al nuevo almacén, limpiarla
                const stillValid = zones.find(
                  (z) => z.id === values.defaultZoneId && z.warehouseId === v,
                );
                if (!stillValid) set('defaultZoneId', '');
              }}
              clearable
              placeholder={t('inventory.itemFields.noWarehouse')}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-fg-muted block mb-1">
              {t('inventory.itemFields.bin')}
            </label>
            <SearchableSelect
              options={zoneOptions}
              value={values.defaultZoneId}
              onChange={(v) => set('defaultZoneId', v)}
              disabled={!values.defaultWarehouseId}
              clearable
              placeholder={t('inventory.itemFields.noBin')}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
