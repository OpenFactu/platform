import { apiClient, buildQuery } from '@/shared/http';
import type {
  Activity,
  Contact,
  CrmSettings,
  Member,
  Opportunity,
  OpportunityDocument,
  OpportunityLine,
  OpportunityStage,
  PartnerSummary,
  TimelineEntry,
} from '../domain/crm';

export type CrmInput = Record<string, unknown>;

/** board = abiertas + cerradas recientes; open / closed; sin valor = todas. */
export type OpportunityScope = 'board' | 'open' | 'closed';

export const opportunitiesApi = {
  list: (params: { partnerId?: string; stageId?: string; scope?: OpportunityScope } = {}) =>
    apiClient.get<Opportunity[]>(`/api/crm/opportunities${buildQuery(params)}`),
  create: (data: CrmInput) => apiClient.post<Opportunity>('/api/crm/opportunities', data),
  update: (id: string, data: CrmInput) =>
    apiClient.patch<Opportunity>(`/api/crm/opportunities/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/crm/opportunities/${id}`),
  get: (id: string) => apiClient.get<Opportunity>(`/api/crm/opportunities/${id}`),
  lines: (id: string) => apiClient.get<OpportunityLine[]>(`/api/crm/opportunities/${id}/lines`),
  saveLines: (id: string, lines: OpportunityLine[]) =>
    apiClient.put<OpportunityLine[]>(`/api/crm/opportunities/${id}/lines`, { lines }),
  documents: (id: string) =>
    apiClient.get<OpportunityDocument[]>(`/api/crm/opportunities/${id}/documents`),
  createQuote: (id: string, validDays?: number) =>
    apiClient.post<{ id: string; docNum: number }>(`/api/crm/opportunities/${id}/quote`, {
      validDays,
    }),
  prices: (partnerId: string | null, itemIds: string[]) =>
    apiClient.get<Record<string, number>>(
      `/api/crm/opportunities/prices${buildQuery({ partnerId: partnerId ?? undefined, itemIds: itemIds.join(',') })}`,
    ),
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

export const crmPartnersApi = {
  summary: (partnerId: string) =>
    apiClient.get<PartnerSummary>(`/api/crm/partners/${partnerId}/summary`),
  timeline: (partnerId: string, before?: string) =>
    apiClient.get<TimelineEntry[]>(
      `/api/crm/partners/${partnerId}/timeline${buildQuery({ before, limit: 30 })}`,
    ),
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
