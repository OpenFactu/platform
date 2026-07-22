import { apiClient } from '@/shared/http';
import type { IncidentType } from '../domain/incident';

export const incidentTypesApi = {
  list: () => apiClient.get<IncidentType[]>('/api/hr/incident-types'),
  create: (data: Record<string, unknown>) =>
    apiClient.post<IncidentType>('/api/hr/incident-types', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<IncidentType>(`/api/hr/incident-types/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/hr/incident-types/${id}`),
};
