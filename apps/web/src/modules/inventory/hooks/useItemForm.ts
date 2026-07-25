import { useState } from 'react';
import { itemsApi } from '../api';
import type { Item } from '../domain/item';

/**
 * Estado + lógica del formulario de artículo, compartido por el wizard de
 * alta (ItemCreateWizard) y la ficha completa (ItemDetail). Nada de UI aquí
 * — las secciones presentacionales (ItemGeneralFields, ItemLogisticsFields,
 * ItemWebFields) reciben `values` y `set`.
 */

export interface ItemFormValues {
  code: string;
  barcode: string;
  name: string;
  uomId: string;
  categoryId: string;
  basePrice: string;
  manageBy: string;
  kind: 'product' | 'box';
  boxLengthMm: string;
  boxWidthMm: string;
  boxHeightMm: string;
  boxMaxWeightKg: string;
  boxTareWeightKg: string;
  defaultWarehouseId: string;
  defaultZoneId: string;
  webVisible: boolean;
  webDescription: string;
  webImages: string[];
  /** Campos personalizados p_* de plugins. */
  customValues: Record<string, unknown>;
}

export function emptyItemForm(): ItemFormValues {
  return {
    code: '',
    barcode: '',
    name: '',
    uomId: '',
    categoryId: '',
    basePrice: '0',
    manageBy: 'N',
    kind: 'product',
    boxLengthMm: '',
    boxWidthMm: '',
    boxHeightMm: '',
    boxMaxWeightKg: '',
    boxTareWeightKg: '',
    defaultWarehouseId: '',
    defaultZoneId: '',
    webVisible: false,
    webDescription: '',
    webImages: [],
    customValues: {},
  };
}

/** Pre-rellena el formulario desde un item de la API (edición/duplicado). */
export function itemToForm(item: any): ItemFormValues {
  const customValues: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item ?? {})) {
    if (k.startsWith('p_')) customValues[k] = v;
  }
  return {
    code: item.code || '',
    barcode: item.barcode || '',
    name: item.name || '',
    uomId: item.uomId || '',
    categoryId: item.categoryId || '',
    basePrice: item.basePrice?.toString() || '0',
    manageBy: item.manageBy || 'N',
    kind: item.kind === 'box' ? 'box' : 'product',
    boxLengthMm: item.boxLengthMm?.toString() || '',
    boxWidthMm: item.boxWidthMm?.toString() || '',
    boxHeightMm: item.boxHeightMm?.toString() || '',
    boxMaxWeightKg: item.boxMaxWeightKg?.toString() || '',
    boxTareWeightKg: item.boxTareWeightKg?.toString() || '',
    defaultWarehouseId: item.defaultWarehouseId || '',
    defaultZoneId: item.defaultZoneId || '',
    webVisible: !!item.webVisible,
    webDescription: item.webDescription || '',
    webImages: Array.isArray(item.webImages) ? item.webImages : [],
    customValues,
  };
}

/** Body para POST/PATCH /api/items — mismo shape que usaba el modal antiguo. */
export function buildItemPayload(v: ItemFormValues): Record<string, unknown> {
  return {
    code: v.code,
    barcode: v.barcode.trim() || null,
    name: v.name,
    uomId: v.uomId,
    categoryId: v.categoryId || null,
    basePrice: parseFloat(v.basePrice) || 0,
    manageBy: v.manageBy,
    kind: v.kind,
    boxLengthMm: v.kind === 'box' && v.boxLengthMm ? Number(v.boxLengthMm) : null,
    boxWidthMm: v.kind === 'box' && v.boxWidthMm ? Number(v.boxWidthMm) : null,
    boxHeightMm: v.kind === 'box' && v.boxHeightMm ? Number(v.boxHeightMm) : null,
    boxMaxWeightKg: v.kind === 'box' && v.boxMaxWeightKg ? Number(v.boxMaxWeightKg) : null,
    boxTareWeightKg: v.kind === 'box' && v.boxTareWeightKg ? Number(v.boxTareWeightKg) : null,
    defaultWarehouseId: v.defaultWarehouseId || null,
    defaultZoneId: v.defaultZoneId || null,
    webVisible: v.webVisible,
    webDescription: v.webDescription.trim() || null,
    webImages: v.webImages,
    ...v.customValues,
  };
}

export function useItemForm(initialItem?: any | null) {
  const [values, setValues] = useState<ItemFormValues>(() =>
    initialItem ? itemToForm(initialItem) : emptyItemForm(),
  );
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const setCustom = (key: string, value: unknown) =>
    setValues((v) => ({ ...v, customValues: { ...v.customValues, [key]: value } }));

  const reset = (item?: any | null) => setValues(item ? itemToForm(item) : emptyItemForm());

  /** Crea (sin id) o actualiza (con id). Lanza ApiError si el backend falla. */
  const submit = async (existingId?: string): Promise<Item> => {
    setSaving(true);
    try {
      const payload = buildItemPayload(values);
      return existingId
        ? await itemsApi.update(existingId, payload)
        : await itemsApi.create(payload);
    } finally {
      setSaving(false);
    }
  };

  return { values, set, setCustom, reset, submit, saving };
}
