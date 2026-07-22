import { apiClient } from '@/shared/http';

/**
 * Operaciones comunes del motor de documentos sobre su endpoint REST
 * (/api/sales, /api/sales/invoices, /api/purchases/orders, ...). Las seis
 * páginas legacy comparten flujo: list / get / create / post / cancel.
 */
export const docsApi = {
  list: <T = any>(endpoint: string) => apiClient.get<T[]>(endpoint),
  get: <T = any>(endpoint: string, id: string) => apiClient.get<T>(`${endpoint}/${id}`),
  create: <T = any>(endpoint: string, data: unknown) => apiClient.post<T>(endpoint, data),
  /** Asentar (post) el documento. */
  post: (endpoint: string, id: string) => apiClient.post<unknown>(`${endpoint}/${id}/post`),
  cancel: (endpoint: string, id: string) => apiClient.post<unknown>(`${endpoint}/${id}/cancel`),
};

/** Envío de documentos por email. */
export const documentEmailApi = {
  sendOne: (data: Record<string, unknown>) =>
    apiClient.post<unknown>('/api/email/send-document', data),
  sendMany: (data: Record<string, unknown>) =>
    apiClient.post<unknown>('/api/email/send-documents', data),
};

export interface DocumentSeries {
  id: string;
  code: string;
  name?: string | null;
  [key: string]: unknown;
}

export const seriesApi = {
  list: () => apiClient.get<DocumentSeries[]>('/api/series'),
  create: (data: Record<string, unknown>) => apiClient.post<DocumentSeries>('/api/series', data),
  remove: (id: string) => apiClient.delete<void>(`/api/series/${id}`),
};
