import { apiClient } from '@/shared/http';
import type {
  Account,
  AccountingPeriod,
  JournalEntry,
  LedgerRow,
  Tax,
} from '../domain/accounting';

export const chartOfAccountsApi = {
  list: () => apiClient.get<Account[]>('/api/chart-of-accounts'),
  create: (data: Record<string, unknown>) =>
    apiClient.post<Account>('/api/chart-of-accounts', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<Account>(`/api/chart-of-accounts/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/chart-of-accounts/${id}`),
  bulkImport: (rows: unknown[]) =>
    apiClient.post<unknown>('/api/chart-of-accounts/bulk', { rows }),
  /** Siembra el plan contable + datos maestros de contabilidad (solo admin). */
  seed: () =>
    apiClient.post<{ accountsCreated: number; mappingsCreated: number }>(
      '/api/admin/seed-accounting',
    ),
};

export const periodsApi = {
  list: () => apiClient.get<AccountingPeriod[]>('/api/periods'),
  create: (data: Record<string, unknown>) =>
    apiClient.post<AccountingPeriod>('/api/periods', data),
  remove: (id: string) => apiClient.delete<void>(`/api/periods/${id}`),
  closePreview: (id: string) => apiClient.get<unknown>(`/api/periods/${id}/close-preview`),
  close: (id: string) => apiClient.post<unknown>(`/api/periods/${id}/close`),
};

export const journalEntriesApi = {
  list: () => apiClient.get<JournalEntry[]>('/api/journal-entries'),
  get: (id: string) => apiClient.get<JournalEntry>(`/api/journal-entries/${id}`),
  create: (data: Record<string, unknown>) =>
    apiClient.post<JournalEntry>('/api/journal-entries', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<JournalEntry>(`/api/journal-entries/${id}`, data),
  post: (id: string) => apiClient.post<JournalEntry>(`/api/journal-entries/${id}/post`),
  reverse: (id: string) => apiClient.post<JournalEntry>(`/api/journal-entries/${id}/reverse`, {}),
  ledger: (accountId: string) =>
    apiClient.get<LedgerRow[]>(`/api/journal-entries/ledger/${accountId}`),
};

export const taxesApi = {
  list: () => apiClient.get<Tax[]>('/api/taxes'),
  create: (data: Record<string, unknown>) => apiClient.post<Tax>('/api/taxes', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<Tax>(`/api/taxes/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/taxes/${id}`),
};
