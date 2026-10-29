import { apiClient } from '@/shared/http';
import type { CrmForm, FieldResult, FormInvite, FormKind, FormResponse } from '../domain/forms';

export const formsApi = {
  list: () => apiClient.get<CrmForm[]>('/api/crm/forms'),
  get: (id: string) => apiClient.get<CrmForm>(`/api/crm/forms/${id}`),
  create: (name: string, kind: FormKind) =>
    apiClient.post<CrmForm>('/api/crm/forms', { name, kind }),
  update: (id: string, data: Partial<CrmForm>) =>
    apiClient.patch<CrmForm>(`/api/crm/forms/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/crm/forms/${id}`),
  responses: (id: string) => apiClient.get<FormResponse[]>(`/api/crm/forms/${id}/responses`),
  results: (id: string) =>
    apiClient.get<{ total: number; fields: FieldResult[] }>(`/api/crm/forms/${id}/results`),
  invites: (id: string) => apiClient.get<FormInvite[]>(`/api/crm/forms/${id}/invites`),
  invite: (id: string, contactIds: string[], send: boolean) =>
    apiClient.post<
      Array<{
        contactId: string;
        contactName: string;
        email: string | null;
        link: string;
        emailed: boolean;
        emailError?: string;
      }>
    >(`/api/crm/forms/${id}/invites`, { contactIds, send }),
};
