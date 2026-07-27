import React from 'react';
import { Button, CurrencyInput, Input, SearchableSelect } from '@openfactu/ui';
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
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              // Completa un parcial numérico o genera uno determinista desde
              // el código/nombre — misma lógica que el modal antiguo.
              const seed = values.barcode.trim() || values.code || values.name;
              set('barcode', generateEan13(seed));
            }}
            title="Generar EAN-13 válido (a partir del código del artículo si está vacío)"
          >
            Generar
          </Button>
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => set('barcode', v.suggested!)}
                  className="ml-1 font-mono"
                >
                  Usar {v.suggested}
                </Button>
              )}
            </div>
          );
        })()}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-bold text-fg-muted uppercase tracking-wider ml-1">
          Categoría (Define Prefijo)
        </label>
        <SearchableSelect
          options={categories.map((c) => ({
            value: c.id,
            label: c.name,
            secondaryLabel: c.codePrefix ? `${c.codePrefix}-` : undefined,
          }))}
          value={values.categoryId}
          onChange={(v) => set('categoryId', v)}
          clearable
          placeholder="-- Sin Categoría --"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-bold text-fg-muted uppercase tracking-wider ml-1">
          Unidad Base <span className="text-rose-500">*</span>
        </label>
        {/* El `required` del <select> nativo no llegaba a validar nada (no hay
            <form> alrededor): quien manda es `essentialsOk` del wizard, que
            exige uomId, y el guardado de la ficha usa el mismo valor. */}
        <SearchableSelect
          options={uoms.map((u) => ({ value: u.id, label: u.name, secondaryLabel: u.code }))}
          value={values.uomId}
          onChange={(v) => set('uomId', v)}
          placeholder="-- Seleccionar --"
        />
      </div>

      <CurrencyInput
        label="Precio Base"
        value={values.basePrice}
        onChange={(v) => set('basePrice', v ?? 0)}
        min={0}
        emptyValue="zero"
      />
    </div>
  );
};
