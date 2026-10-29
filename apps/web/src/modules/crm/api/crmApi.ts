import { apiClient, buildQuery } from '@/shared/http';
import type {
  Activity,
  Contact,
  CrmSettings,
  Member,
  Opportunity,
  OpportunityStage,
} from '../domain/crm';

export type CrmInput = Record<string, unknown>;

export const opportunitiesApi = {
  list: (params: { partnerId?: string; stageId?: string } = {}) =>
    apiClient.get<Opportunity[]>(`/api/crm/opportunities${buildQuery(params)}`),
  create: (data: CrmInput) => apiClient.post<Opportunity>('/api/crm/opportunities', data),
  update: (id: string, data: CrmInput) =>
    apiClient.patch<Opportunity>(`/api/crm/opportunities/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/crm/opportunities/${id}`),
};

export const stagesApi = {
  list: () => apiClient.get<OpportunityStage[]>('/api/crm/stages'),
  create: (data: CrmInput) => apiClient.post<OpportunityStage>('/api/crm/stages', data),
  update: (id: string, data: CrmInput) =>
    apiClient.patch<OpportunityStage>(`/api/crm/stages/${id}`, data),
  reorder: (ids: string[]) => apiClient.put<void>('/api/crm/stages/order', { ids }),
  remove: (id: string) => apiClient.delete<void>(`/api/crm/stages/${id}`),
};

export const contactsApi = {
  list: (params: { partnerId?: string } = {}) =>
    apiClient.get<Contact[]>(`/api/crm/contacts${buildQuery(params)}`),
  create: (data: CrmInput) => apiClient.post<Contact>('/api/crm/contacts', data),
  update: (id: string, data: CrmInput) => apiClient.patch<Contact>(`/api/crm/contacts/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/crm/contacts/${id}`),
};

export interface ActivityFilter {
  partnerId?: string;
  opportunityId?: string;
  contactId?: string;
  status?: 'pending' | 'done';
  ownerUserId?: string;
}

export const crmSettingsApi = {
  get: () => apiClient.get<CrmSettings>('/api/crm/settings'),
  update: (data: Partial<CrmSettings>) => apiClient.put<CrmSettings>('/api/crm/settings', data),
};

export const membersApi = {
  list: () => apiClient.get<Member[]>('/api/members'),
};

export const activitiesApi = {
  list: (params: ActivityFilter = {}) =>
    apiClient.get<Activity[]>(`/api/crm/activities${buildQuery({ ...params })}`),
  create: (data: CrmInput) => apiClient.post<Activity>('/api/crm/activities', data),
  update: (id: string, data: CrmInput) =>
    apiClient.patch<Activity>(`/api/crm/activities/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/crm/activities/${id}`),
};
