import { apiClient } from '@/shared/http';
import type {
  CreditStatus,
  DunningLetter,
  DunningLetterDetail,
  LetterPreview,
  OverdueCustomer,
  RecurringDetail,
  RecurringDocument,
  SalesSettings,
} from '../domain/sales';

export const creditApi = {
  status: (partnerId: string, amount = 0) =>
    apiClient.get<CreditStatus>(`/api/partner-credit/${partnerId}?amount=${amount}`),
};

export const salesSettingsApi = {
  get: () => apiClient.get<SalesSettings>('/api/sales-settings'),
  save: (patch: Partial<SalesSettings>) =>
    apiClient.put<SalesSettings>('/api/sales-settings', patch),
};

export const dunningApi = {
  overdue: () => apiClient.get<OverdueCustomer[]>('/api/dunning/overdue'),
  letters: (partnerId?: string) =>
    apiClient.get<DunningLetter[]>(
      `/api/dunning/letters${partnerId ? `?partnerId=${partnerId}` : ''}`,
    ),
  letter: (id: string) => apiClient.get<DunningLetterDetail>(`/api/dunning/letters/${id}`),
  preview: (partnerId: string) => apiClient.get<LetterPreview>(`/api/dunning/preview/${partnerId}`),
  send: (partnerId: string, to?: string) =>
    apiClient.post<{ id: string; level: number; to: string }>(`/api/dunning/send/${partnerId}`, {
      to,
    }),
  setExcluded: (partnerId: string, excluded: boolean) =>
    apiClient.patch<{ partnerId: string; excluded: boolean }>(
      `/api/dunning/partners/${partnerId}`,
      { excluded },
    ),
};

export const recurringApi = {
  list: () => apiClient.get<RecurringDocument[]>('/api/recurring-documents'),
  get: (id: string) => apiClient.get<RecurringDetail>(`/api/recurring-documents/${id}`),
  create: (body: unknown) => apiClient.post<RecurringDocument>('/api/recurring-documents', body),
  update: (id: string, body: unknown) =>
    apiClient.put<RecurringDocument>(`/api/recurring-documents/${id}`, body),
  action: (id: string, action: 'pause' | 'resume' | 'finish') =>
    apiClient.post<RecurringDocument>(`/api/recurring-documents/${id}/${action}`),
  run: (id: string) =>
    apiClient.post<{
      generated: Array<{ documentId: string; docNum: number; periodDate: string }>;
    }>(`/api/recurring-documents/${id}/run`),
  remove: (id: string) => apiClient.delete<unknown>(`/api/recurring-documents/${id}`),
};
