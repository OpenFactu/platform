import { apiClient } from '@/shared/http';
import type { CollectiveAgreement } from '../domain/collectiveAgreement';

export const collectiveAgreementsApi = {
  list: () => apiClient.get<CollectiveAgreement[]>('/api/hr/collective-agreements'),
  create: (data: Record<string, unknown>) =>
    apiClient.post<CollectiveAgreement>('/api/hr/collective-agreements', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<CollectiveAgreement>(`/api/hr/collective-agreements/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/hr/collective-agreements/${id}`),
};
