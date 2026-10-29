import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  CurrencyInput,
  EmptyState,
  Input,
  NumberInput,
  PercentInput,
  SearchableSelect,
  useMediaQuery,
} from '@openfactu/ui';
import { PackagePlus, Plus, Trash2 } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { itemsApi } from '@/modules/inventory/api/itemsApi';
import type { Item } from '@/modules/inventory/domain/item';
import { lineNet, type OpportunityLine } from '../domain/crm';

interface Props {
  lines: OpportunityLine[];
  onAdd: () => void;
  onChange: (key: string, patch: Partial<OpportunityLine>) => void;
  onRemove: (key: string) => void;
  disabled?: boolean;
}

/** Columnas de escritorio: artículo, descripción, cantidad, precio, dto., importe, quitar. */
const DESKTOP_GRID =
  'grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_6.5rem_8.5rem_6rem_7.5rem_2.5rem] gap-2 items-center';

/**
 * Productos de interés: artículo, cantidad, precio (el de la tarifa del
 * cliente al elegirlo) y descuento. Sin artículo vale como línea de texto,
 * pero esas no pasan al presupuesto.
 *
 * En escritorio es una fila por producto con cabecera; en pantallas estrechas,
 * una tarjeta por producto con los campos apilados y sus etiquetas.
 */
export const OpportunityLinesEditor: React.FC<Props> = ({
  lines,
  onAdd,
  onChange,
  onRemove,
  disabled,
}) => {
  const fmt = useFormat();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    itemsApi
      .list()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  const itemOptions = useMemo(
    () => items.map((i) => ({ value: i.id, label: i.name, secondaryLabel: i.code })),
    [items],
  );
  const total = useMemo(() => lines.reduce((s, l) => s + lineNet(l), 0), [lines]);

  const addButton = !disabled && (
    <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
      <Plus size={14} /> Añadir producto
    </Button>
  );

  if (lines.length === 0) {
    return (
      <EmptyState
        variant="compact"
        icon={<PackagePlus size={18} />}
        title="Sin productos"
        hint="Sin productos, el importe de la oportunidad se teclea a mano."
        action={addButton || undefined}
      />
    );
  }

  /** En escritorio la cabecera hace de etiqueta; en móvil cada campo lleva la suya. */
  const label = (text: string) => (isDesktop ? undefined : text);

  return (
    <div className={isDesktop ? 'space-y-3' : 'space-y-0'}>
      {isDesktop && (
        <div
          className={`${DESKTOP_GRID} px-3 text-[11px] font-bold uppercase tracking-wider text-fg-muted`}
        >
          <span>Artículo</span>
          <span>Descripción</span>
          <span className="text-right">Cantidad</span>
          <span className="text-right">Precio</span>
          <span className="text-right">Dto.</span>
          <span className="text-right">Importe</span>
          <span />
        </div>
      )}

      <ul className={isDesktop ? 'space-y-2' : 'divide-y divide-border-subtle'}>
        {lines.map((l, idx) => {
          const key = l._key ?? l.id ?? '';
          const set = (patch: Partial<OpportunityLine>) => onChange(key, patch);
          const removeButton = !disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemove(key)}
              aria-label="Quitar producto"
              title="Quitar producto"
            >
              <Trash2 size={14} />
            </Button>
          );
          const fields = (
            <>
              <div className={isDesktop ? 'min-w-0' : 'col-span-2'}>
                <SearchableSelect
                  label={label('Artículo')}
                  ariaLabel="Artículo"
                  options={itemOptions}
                  value={l.itemId ?? ''}
                  onChange={(v) => set({ itemId: v || null, itemName: null })}
                  placeholder="Elige un artículo"
                  clearable
                  disabled={disabled}
                />
              </div>
              <div className={isDesktop ? 'min-w-0' : 'col-span-2'}>
                <Input
                  label={label('Descripción')}
                  aria-label="Descripción"
                  value={l.description ?? ''}
                  onChange={(e) => set({ description: e.target.value })}
                  placeholder="Opcional"
                  disabled={disabled}
                />
              </div>
              <NumberInput
                label={label('Cantidad')}
                aria-label="Cantidad"
                value={l.quantity}
                onChange={(v) => set({ quantity: v ?? 0 })}
                precision={2}
                min={0}
                align="right"
                disabled={disabled}
              />
              <CurrencyInput
                label={label('Precio')}
                aria-label="Precio"
                value={l.price}
                onChange={(v) => set({ price: v ?? 0 })}
                align="right"
                disabled={disabled}
              />
              <PercentInput
                label={label('Descuento')}
                aria-label="Descuento"
                value={l.discount}
                onChange={(v) => set({ discount: v ?? 0 })}
                precision={0}
                disabled={disabled}
              />
            </>
          );

          if (isDesktop) {
            return (
              <li key={key} className={`${DESKTOP_GRID} px-3`}>
                {fields}
                <span className="text-right text-sm tabular-nums text-fg-default">
                  {fmt.money(lineNet(l))}
                </span>
                <span>{removeButton}</span>
              </li>
            );
          }

          // Móvil: cabecera con número, importe y quitar; campos con aire entre ellos.
          return (
            <li key={key} className="py-5 first:pt-0 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-fg-muted">
                  Producto {idx + 1}
                </span>
                <span className="flex-1" />
                <span className="text-sm font-semibold tabular-nums text-fg-default">
                  {fmt.money(lineNet(l))}
                </span>
                {removeButton}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-4">{fields}</div>
            </li>
          );
        })}
      </ul>

      <div
        className={
          isDesktop
            ? 'flex items-center justify-between gap-3 px-3 pt-3 border-t border-border-subtle'
            : 'space-y-4 pt-4 border-t border-border-subtle'
        }
      >
        {isDesktop && (addButton || <span />)}
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-fg-muted">Total</span>
          <span className="text-base font-semibold tabular-nums text-fg-default">
            {fmt.money(total)}
          </span>
        </div>
        {!isDesktop && addButton && <div className="[&>button]:w-full">{addButton}</div>}
      </div>
    </div>
  );
};
