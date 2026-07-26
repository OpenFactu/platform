import React from 'react';
import { NumberInput, RadioGroup, SearchableSelect } from '@openfactu/ui';
import type { ItemFormValues } from '../hooks/useItemForm';
import type { Warehouse, Zone } from '../domain/warehouse';

interface Props {
  values: ItemFormValues;
  set: <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) => void;
  warehouses: Warehouse[];
  zones: Zone[];
}

/** Producto normal o caja de embalaje (las cajas salen en Logística → Paquetes). */
const KIND_OPTIONS = [
  { value: 'product', label: 'Producto', description: 'Artículo normal de stock' },
  { value: 'box', label: 'Caja', description: 'Embalaje usado en Logística → Paquetes' },
];

const MANAGE_BY_OPTIONS = [
  { value: 'N', label: 'Gestión Estándar', description: 'Sin control de lotes ni series.' },
  { value: 'B', label: 'Control por Lotes', description: 'Obligatorio en cada movimiento.' },
  { value: 'S', label: 'Control por Series', description: 'Identificación única del producto.' },
];

/** Dimensiones en mm (enteras) y pesos en kg (2 decimales) de la caja. */
const BOX_MM_FIELDS = [
  ['boxLengthMm', 'Largo (mm)'],
  ['boxWidthMm', 'Ancho (mm)'],
  ['boxHeightMm', 'Alto (mm)'],
] as const;

const BOX_KG_FIELDS = [
  ['boxMaxWeightKg', 'Peso máx. (kg)'],
  ['boxTareWeightKg', 'Tara (kg)'],
] as const;

/**
 * Sección "Logística": tipo de artículo (producto/caja con dimensiones),
 * trazabilidad y ubicación por defecto. JSX extraído del antiguo modal.
 */
export const ItemLogisticsFields: React.FC<Props> = ({ values, set, warehouses, zones }) => {
  const warehouseOptions = warehouses.map((w) => ({ value: w.id, label: w.name }));
  const zoneOptions = zones
    .filter((z) => !values.defaultWarehouseId || z.warehouseId === values.defaultWarehouseId)
    .map((z) => ({ value: z.id, label: z.name }));

  return (
    <div className="space-y-6">
      {/* Tipo de artículo y trazabilidad: elegir uno de N con descripción, es
          decir RadioGroup — antes eran tarjetas pintadas a mano. */}
      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50">
        <RadioGroup
          label="Tipo de artículo"
          orientation="horizontal"
          options={KIND_OPTIONS}
          value={values.kind}
          onChange={(v) => set('kind', v as 'product' | 'box')}
        />

        {values.kind === 'box' && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700/50 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Dimensiones de la caja (opcional)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {BOX_MM_FIELDS.map(([key, label]) => (
                <NumberInput
                  key={key}
                  label={label}
                  value={values[key]}
                  onChange={(v) => set(key, v)}
                  min={0}
                  inputSize="sm"
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {BOX_KG_FIELDS.map(([key, label]) => (
                <NumberInput
                  key={key}
                  label={label}
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

      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50">
        <RadioGroup
          label="Trazabilidad obligatoria"
          options={MANAGE_BY_OPTIONS}
          value={values.manageBy}
          onChange={(v) => set('manageBy', v)}
        />
      </div>

      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50">
        <label className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest mb-3 block">
          Ubicación por defecto
        </label>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">
          Cuando selecciones este artículo en un pedido o albarán se rellenará automáticamente su
          almacén y ubicación. Puedes cambiarlo por línea.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
              Almacén
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
              placeholder="(Sin almacén)"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
              Ubicación / Bin
            </label>
            <SearchableSelect
              options={zoneOptions}
              value={values.defaultZoneId}
              onChange={(v) => set('defaultZoneId', v)}
              disabled={!values.defaultWarehouseId}
              clearable
              placeholder="(Sin ubicación)"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
