import { apiClient } from '@/shared/http';

export interface DocumentTemplate {
  id: string;
  name: string;
  docType?: string | null;
  isDefault?: boolean;
  [key: string]: unknown;
}

export const templatesApi = {
  list: (docType?: string) =>
    apiClient.get<DocumentTemplate[]>('/api/document-templates', { query: { docType } }),
  get: (id: string) => apiClient.get<DocumentTemplate>(`/api/document-templates/${id}`),
  create: (data: Record<string, unknown>) =>
    apiClient.post<DocumentTemplate>('/api/document-templates', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.put<DocumentTemplate>(`/api/document-templates/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/document-templates/${id}`),
  setDefault: (id: string) =>
    apiClient.post<unknown>(`/api/document-templates/${id}/set-default`),
  preview: (data: Record<string, unknown>) =>
    apiClient.post<unknown>('/api/document-templates/preview', data),
  /** Preview renderizada como PDF (blob). */
  previewPdf: (data: Record<string, unknown>) =>
    apiClient.postBlob('/api/document-templates/preview', data),
  testQuery: (data: Record<string, unknown>) =>
    apiClient.post<unknown>('/api/document-templates/test-query', data),
  /** Render libre de la plantilla (PDF); las queries fallidas van en la cabecera X-Render-Free-Errors. */
  renderFreePdf: (id: string, data: Record<string, unknown>) =>
    apiClient.postBlob(`/api/document-templates/${id}/render-free`, data),
  paramOptions: (id: string, param: string) =>
    apiClient.post<{ options?: unknown[] }>(`/api/document-templates/${id}/param-options`, {
      param,
    }),
  generate: (data: Record<string, unknown>) =>
    apiClient.post<unknown>('/api/document-templates/generate', data),
  resyncDefaults: () => apiClient.post<unknown>('/api/document-templates/resync-defaults'),
  schemaInfo: () => apiClient.get<unknown>('/api/document-templates/schema-info'),
};
