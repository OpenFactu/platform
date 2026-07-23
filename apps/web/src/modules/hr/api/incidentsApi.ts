import { apiClient } from '@/shared/http';
import type { Incident, SubstituteCandidate } from '../domain/incident';

export const incidentsApi = {
  list: () => apiClient.get<Incident[]>('/api/hr/incidents'),
  create: (data: Record<string, unknown>) => apiClient.post<Incident>('/api/hr/incidents', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<Incident>(`/api/hr/incidents/${id}`, data),
  suggestSubstitutes: (id: string) =>
    apiClient.post<SubstituteCandidate[]>(`/api/hr/incidents/${id}/suggest-substitutes`),
  assignSubstitute: (id: string, substituteEmployeeId: string) =>
    apiClient.post<Incident>(`/api/hr/incidents/${id}/assign-substitute`, { substituteEmployeeId }),
};
