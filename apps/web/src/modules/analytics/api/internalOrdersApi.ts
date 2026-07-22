import { apiClient } from '../../../shared/http';

export interface InternalOrder {
  id: string;
  code: string;
  name: string;
  status?: string;
  costCenterId?: string | null;
  [key: string]: unknown;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  [key: string]: unknown;
}

/** Lookup de centros de coste (el CRUD completo va vía DimensionCrudPage/crudApi). */
export const costCentersApi = {
  list: () => apiClient.get<CostCenter[]>('/api/cost-centers'),
};

export const internalOrdersApi = {
  list: () => apiClient.get<InternalOrder[]>('/api/internal-orders'),
  create: (data: Record<string, unknown>) =>
    apiClient.post<InternalOrder>('/api/internal-orders', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<InternalOrder>(`/api/internal-orders/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/internal-orders/${id}`),
};
