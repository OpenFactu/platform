import { apiClient } from '@/shared/http';
import type {
  CountDetail,
  CountItemOption,
  CountLine,
  CountOptions,
  CountRow,
  ScanOutcome,
} from '../domain/inventoryCount';
import type { CreatedOrder, ReplenishmentRow, SupplierOption } from '../domain/replenishment';

const BASE = '/api/inventory-counts';

export interface OpenCountInput {
  warehouseId: string;
  zoneId?: string | null;
  categoryId?: string | null;
  blind?: boolean;
  notes?: string | null;
}

export interface AddLineInput {
  itemId: string;
  zoneId?: string | null;
  batchNum?: string | null;
  countedQty?: number | null;
}

export const inventoryCountsApi = {
  list: () => apiClient.get<CountRow[]>(BASE),
  options: () => apiClient.get<CountOptions>(`${BASE}/options`),
  open: (data: OpenCountInput) =>
    apiClient.post<{ id: string; code: string; lines: number }>(BASE, data),
  get: (id: string) => apiClient.get<CountDetail>(`${BASE}/${id}`),
  searchItems: (id: string, q: string) =>
    apiClient.get<CountItemOption[]>(`${BASE}/${id}/items`, { query: { q } }),
  addLine: (id: string, data: AddLineInput) =>
    apiClient.post<CountLine>(`${BASE}/${id}/lines`, data),
  setCount: (id: string, lineId: string, countedQty: number | null) =>
    apiClient.patch<CountLine>(`${BASE}/${id}/lines/${lineId}`, { countedQty }),
  setAllocations: (
    id: string,
    lineId: string,
    allocations: Array<{ batchNum: string; quantity: number }>,
  ) => apiClient.put<CountLine>(`${BASE}/${id}/lines/${lineId}/allocations`, { allocations }),
  scan: (id: string, code: string) => apiClient.post<ScanOutcome>(`${BASE}/${id}/scan`, { code }),
  finish: (id: string) => apiClient.post<{ status: string }>(`${BASE}/${id}/finish`),
  reopen: (id: string) => apiClient.post<{ status: string }>(`${BASE}/${id}/reopen`),
  close: (id: string) =>
    apiClient.post<{ adjusted: number; receiptId: string | null; issueId: string | null }>(
      `${BASE}/${id}/close`,
    ),
  cancel: (id: string) => apiClient.post<{ status: string }>(`${BASE}/${id}/cancel`),
};

export const replenishmentApi = {
  list: () => apiClient.get<ReplenishmentRow[]>('/api/replenishment'),
  suppliers: () => apiClient.get<SupplierOption[]>('/api/replenishment/suppliers'),
  createOrders: (lines: Array<{ itemId: string; quantity: number; supplierId: string }>) =>
    apiClient.post<{ orders: CreatedOrder[] }>('/api/replenishment/orders', { lines }),
};
