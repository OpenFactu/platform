import { apiClient } from '@/shared/http';
import type { Platform } from '../domain/platform';

export type PlatformInput = Record<string, unknown>;

export const platformsApi = {
  list: (params?: { includeArchived?: boolean }) =>
    apiClient.get<Platform[]>('/api/logistics/platforms', { query: params }),
  create: (data: PlatformInput) => apiClient.post<Platform>('/api/logistics/platforms', data),
  update: (id: string, data: PlatformInput) =>
    apiClient.patch<Platform>(`/api/logistics/platforms/${id}`, data),
  archive: (id: string) => apiClient.delete<void>(`/api/logistics/platforms/${id}`),
  restore: (id: string) => apiClient.post<void>(`/api/logistics/platforms/${id}/restore`),
};
