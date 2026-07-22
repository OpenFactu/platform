import { apiClient } from '@/shared/http';
import type { Item } from '../domain/item';
import type { ItemUomAlternative } from '../domain/uom';

/** El alta/edición admite además campos personalizados p_* (spread del formulario). */
export type ItemInput = Record<string, unknown>;

export const itemsApi = {
  list: () => apiClient.get<Item[]>('/api/items'),
  create: (data: ItemInput) => apiClient.post<Item>('/api/items', data),
  update: (id: string, data: ItemInput) => apiClient.patch<Item>(`/api/items/${id}`, data),
  /** Desglose de stock por almacén/zona/lote para el modal de detalle. */
  stockDetail: (id: string) => apiClient.get<unknown>(`/api/items/${id}/stock`),

  listUoms: (itemId: string) => apiClient.get<ItemUomAlternative[]>(`/api/items/${itemId}/uoms`),
  addUom: (itemId: string, data: { uomId: string; factor: number }) =>
    apiClient.post<ItemUomAlternative>(`/api/items/${itemId}/uoms`, data),
  removeUom: (itemId: string, id: string) =>
    apiClient.delete<void>(`/api/items/${itemId}/uoms/${id}`),
};
