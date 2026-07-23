import { apiClient } from '@/shared/http';
import type { Vehicle } from '../domain/vehicle';

export type VehicleInput = Record<string, unknown>;

export const vehiclesApi = {
  list: (params?: { includeArchived?: boolean }) =>
    apiClient.get<Vehicle[]>('/api/logistics/vehicles', { query: params }),
  create: (data: VehicleInput) => apiClient.post<Vehicle>('/api/logistics/vehicles', data),
  update: (id: string, data: VehicleInput) =>
    apiClient.patch<Vehicle>(`/api/logistics/vehicles/${id}`, data),
  archive: (id: string) => apiClient.delete<void>(`/api/logistics/vehicles/${id}`),
  restore: (id: string) => apiClient.post<void>(`/api/logistics/vehicles/${id}/restore`),
};
