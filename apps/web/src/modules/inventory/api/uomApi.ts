import { apiClient } from '@/shared/http';
import type { Uom } from '../domain/uom';

export interface UomInput {
  code: string;
  name: string;
  /** @deprecated el servidor lo acepta como alias de code; usar code. */
  symbol?: string;
}

export const uomApi = {
  list: () => apiClient.get<Uom[]>('/api/uom'),
  create: (data: UomInput) => apiClient.post<Uom>('/api/uom', data),
  update: (id: string, data: Partial<UomInput>) => apiClient.patch<Uom>(`/api/uom/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/uom/${id}`),
};
