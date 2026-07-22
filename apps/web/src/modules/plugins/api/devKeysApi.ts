import { apiClient } from '@/shared/http';
import type { DevKey } from '../domain/DevKeys';

export const devKeysApi = {
  list: () => apiClient.get<DevKey[]>('/api/dev-keys'),
  create: (name: string) =>
    apiClient.post<{ clientId: string; clientSecret: string }>('/api/dev-keys', { name }),
  remove: (id: string) => apiClient.delete<void>(`/api/dev-keys/${id}`),
  toggle: (id: string) => apiClient.patch<{ isActive: boolean }>(`/api/dev-keys/${id}/toggle`, {}),
};
