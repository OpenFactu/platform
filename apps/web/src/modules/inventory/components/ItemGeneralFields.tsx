import React from 'react';
import { Input } from '@openfactu/ui';
import { validateBarcode, generateEan13 } from '@/utils/barcodeValidation';
import type { ItemFormValues } from '../hooks/useItemForm';
import type { Category } from '../domain/category';
import type { Uom } from '../domain/uom';

interface Props {
  values: ItemFormValues;
  set: <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) => void;
  categories: Category[];
  uoms: Uom[];
  /** true al editar un artículo existente (el código no se cambia). */
  isEditing?: boolean;
}

/**
 * Sección "General" de la ficha de artículo: código (auto por prefijo de
 * categoría), nombre, barcode con validación/generación EAN-13, categoría,
 * unidad base y precio. JSX extraído tal cual del antiguo modal de Items.
 */
export const ItemGeneralFields: React.FC<Props> = ({
  values,
  set,
  categories,
  uoms,
  isEditing,
}) => {
  const categoryPrefix = categories.find((c) => c.id === values.categoryId)?.codePrefix;

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="flex-1">
          <Input
            label="Código"
            placeholder={categoryPrefix ? `Auto (Ej: ${categoryPrefix}-000001)` : 'ART-001'}
            value={categoryPrefix && !isEditing ? '' : values.code}
            disabled={!!isEditing || !!categoryPrefix}
            onChange={(e) => set('code', e.target.value)}
          />
        </div>
        <div className="flex-[2]">
          <Input
            label="Nombre del Producto"
            placeholder="Ej: Laptop Pro"
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />
        </div>
      </div>
      <div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label="Código de Barras (EAN / UPC / Code128)"
              placeholder="Ej: 8412345678905 — vacío si el artículo no tiene"
              value={values.barcode}
              onChange={(e) => set('barcode', e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              // Completa un parcial numérico o genera uno determinista desde
              // el código/nombre — misma lógica que el modal antiguo.
              const seed = values.barcode.trim() || values.code || values.name;
              set('barcode', generateEan13(seed));
            }}
            title="Generar EAN-13 válido (a partir del código del artículo si está vacío)"
            className="h-9 px-3 text-xs font-bold rounded-lg border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/50"
          >
            Generar
          </button>
        </div>
        {(() => {
          if (!values.barcode.trim()) {
            return (
              <div className="text-[10px] text-slate-400 mt-1 ml-1">
                Sin código de barras. Pulsa <strong>Generar</strong> para crear uno.
              </div>
            );
          }
          const v = validateBarcode(values.barcode);
          if (v.valid) {
            return (
              <div className="text-[10px] mt-1 ml-1 flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <span>✓</span>
                <span>Formato detectado: {v.format}</span>
              </div>
            );
          }
          return (
            <div className="text-[10px] mt-1 ml-1 text-rose-500 dark:text-rose-400 flex flex-wrap items-center gap-1">
              <span>⚠</span>
              <span>
                {v.format} inválido — {v.reason}
              </span>
              {v.suggested && (
                <button
                  type="button"
                  onClick={() => set('barcode', v.suggested!)}
                  className="ml-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 font-mono"
                >
                  Usar {v.suggested}
                </button>
              )}
            </div>
          );
        })()}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
          Categoría (Define Prefijo)
        </label>
        <select
          value={values.categoryId}
          onChange={(e) => set('categoryId', e.target.value)}
          className="flex h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-sm shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">-- Sin Categoría --</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.codePrefix ? `(${c.codePrefix}-)` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
          Unidad Base
        </label>
        <select
          value={values.uomId}
          onChange={(e) => set('uomId', e.target.value)}
          required
          className="flex h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-sm shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">-- Seleccionar --</option>
          {uoms.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.code})
            </option>
          ))}
        </select>
      </div>

      <Input
        label="Precio Base (€)"
        type="number"
        step="0.01"
        value={values.basePrice}
        onChange={(e) => set('basePrice', e.target.value)}
      />
    </div>
  );
};
