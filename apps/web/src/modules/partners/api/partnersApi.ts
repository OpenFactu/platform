import { apiClient } from '../../../shared/http';
import type { Partner, PartnerGroup } from '../domain/partner';

export type PartnerInput = Record<string, unknown>;

export const partnersApi = {
  list: () => apiClient.get<Partner[]>('/api/partners'),
  create: (data: PartnerInput) => apiClient.post<Partner>('/api/partners', data),
  update: (id: string, data: PartnerInput) => apiClient.patch<Partner>(`/api/partners/${id}`, data),
};

export const partnerGroupsApi = {
  list: () => apiClient.get<PartnerGroup[]>('/api/partnerGroups'),
  create: (data: Record<string, unknown>) =>
    apiClient.post<PartnerGroup>('/api/partnerGroups', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<PartnerGroup>(`/api/partnerGroups/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/partnerGroups/${id}`),
};
