import { apiClient } from '@/shared/http';
import type { Objective } from '../domain/evaluation';

export const objectivesApi = {
  list: (query?: { employeeId?: string; status?: string }) =>
    apiClient.get<Objective[]>('/api/hr/evaluations/objectives/list', { query }),
  create: (data: Record<string, unknown>) =>
    apiClient.post<Objective>('/api/hr/evaluations/objectives', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<Objective>(`/api/hr/evaluations/objectives/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/hr/evaluations/objectives/${id}`),
};
