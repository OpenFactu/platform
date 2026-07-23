import { apiClient } from '@/shared/http';
import type { Warehouse, Zone } from '../domain/warehouse';

interface BinRange {
  start: number;
  end: number;
  padding: number;
}

export interface GenerateBinsInput {
  prefix: string;
  separator: string;
  aisleRange: BinRange;
  stackRange: BinRange;
  levelRange: BinRange;
}

export const warehousesApi = {
  list: () => apiClient.get<Warehouse[]>('/api/warehouses'),
  create: (data: { name: string; location?: string | null }) =>
    apiClient.post<Warehouse>('/api/warehouses', data),
  generateBins: (warehouseId: string, data: GenerateBinsInput) =>
    apiClient.post<{ message: string }>(`/api/warehouses/${warehouseId}/generate-bins`, data),
};

export const zonesApi = {
  list: (warehouseId?: string) => apiClient.get<Zone[]>('/api/zones', { query: { warehouseId } }),
  create: (data: { warehouseId: string; name: string; description?: string | null }) =>
    apiClient.post<Zone>('/api/zones', data),
  remove: (id: string) => apiClient.delete<void>(`/api/zones/${id}`),
};
