import React from 'react';
import type { ItemFormValues } from '../hooks/useItemForm';
import type { Warehouse, Zone } from '../domain/warehouse';

interface Props {
  values: ItemFormValues;
  set: <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) => void;
  warehouses: Warehouse[];
  zones: Zone[];
}

const boxInputCls =
  'w-full h-9 px-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10';

/**
 * Sección "Logística": tipo de artículo (producto/caja con dimensiones),
 * trazabilidad y ubicación por defecto. JSX extraído del antiguo modal.
 */
export const ItemLogisticsFields: React.FC<Props> = ({ values, set, warehouses, zones }) => {
  return (
    <div className="space-y-6">
      {/* Tipo de artículo — producto normal o caja de embalaje. Las cajas se
          muestran en el selector "Caja" del modal de Paquetes. */}
      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50">
        <label className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest mb-3 block">
          Tipo de artículo
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'product', label: 'Producto', desc: 'Artículo normal de stock' },
            { id: 'box', label: 'Caja', desc: 'Embalaje usado en Logística → Paquetes' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => set('kind', opt.id as 'product' | 'box')}
              className={`p-3 rounded-lg border text-left transition-all ${
                values.kind === opt.id
                  ? 'bg-emerald-600 border-emerald-700 text-white shadow-md'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400'
              }`}
            >
              <p className="text-xs font-bold leading-none">{opt.label}</p>
              <p
                className={`text-[10px] mt-1 ${
                  values.kind === opt.id
                    ? 'text-emerald-100'
                    : 'text-slate-400 dark:text-slate-500 font-medium'
                }`}
              >
                {opt.desc}
              </p>
            </button>
          ))}
        </div>

        {values.kind === 'box' && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700/50 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Dimensiones de la caja (opcional)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['boxLengthMm', 'Largo (mm)'],
                  ['boxWidthMm', 'Ancho (mm)'],
                  ['boxHeightMm', 'Alto (mm)'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                    {label}
                  </label>
                  <input
                    type="number"
                    value={values[key]}
                    onChange={(e) => set(key, e.target.value)}
                    className={boxInputCls}
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['boxMaxWeightKg', 'Peso máx. (kg)'],
                  ['boxTareWeightKg', 'Tara (kg)'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                    {label}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={values[key]}
                    onChange={(e) => set(key, e.target.value)}
                    className={boxInputCls}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50">
        <label className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest mb-4 block">
          Trazabilidad Obligatoria
        </label>
        <div className="space-y-2">
          {[
            { id: 'N', label: 'Gestión Estándar', desc: 'Sin control de lotes ni series.' },
            { id: 'B', label: 'Control por Lotes', desc: 'Obligatorio en cada movimiento.' },
            { id: 'S', label: 'Control por Series', desc: 'Identificación única del producto.' },
          ].map((opt) => (
            <div
              key={opt.id}
              onClick={() => set('manageBy', opt.id)}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${values.manageBy === opt.id ? 'bg-blue-600 border-blue-700 text-white shadow-md' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400'}`}
            >
              <p className="text-xs font-bold leading-none">{opt.label}</p>
              <p
                className={`text-[10px] mt-1 ${values.manageBy === opt.id ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500 font-medium'}`}
              >
                {opt.desc}
              </p>
            </div>
          ))}
        </div>
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
            <select
              value={values.defaultWarehouseId}
              onChange={(e) => {
                set('defaultWarehouseId', e.target.value);
                // Si la zona guardada no pertenece al nuevo almacén, limpiarla
                const stillValid = zones.find(
                  (z) => z.id === values.defaultZoneId && z.warehouseId === e.target.value,
                );
                if (!stillValid) set('defaultZoneId', '');
              }}
              className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold px-3 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
            >
              <option value="">(Sin almacén)</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
              Ubicación / Bin
            </label>
            <select
              value={values.defaultZoneId}
              onChange={(e) => set('defaultZoneId', e.target.value)}
              disabled={!values.defaultWarehouseId}
              className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold px-3 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-50"
            >
              <option value="">(Sin ubicación)</option>
              {zones
                .filter(
                  (z) => !values.defaultWarehouseId || z.warehouseId === values.defaultWarehouseId,
                )
                .map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
