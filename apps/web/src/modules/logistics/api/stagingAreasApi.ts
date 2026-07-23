import { apiClient, type BlobResult } from '@/shared/http';
import type { StagingArea, StagingAreaItem, StagingAreaPayload } from '../domain/stagingArea';

export type StagingAreaInput = Record<string, unknown>;

export const stagingAreasApi = {
  list: () => apiClient.get<StagingArea[]>('/api/logistics/staging-areas'),
  create: (data: StagingAreaInput) => apiClient.post<StagingArea>('/api/logistics/staging-areas', data),
  update: (id: string, data: StagingAreaInput) =>
    apiClient.patch<StagingArea>(`/api/logistics/staging-areas/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/logistics/staging-areas/${id}`),

  /** Payload compartido por el QR, el packing list y las etiquetas imprimibles. */
  payload: (id: string) => apiClient.get<StagingAreaPayload>(`/api/logistics/staging-areas/${id}/payload`),
  /** Binario del QR — autenticado, por eso se pide como blob y no un <img src>. */
  qrPng: (id: string): Promise<BlobResult> => apiClient.getBlob(`/api/logistics/staging-areas/${id}/qr.png`),

  listItems: (id: string) =>
    apiClient.get<StagingAreaItem[]>(`/api/logistics/staging-areas/${id}/items`),
  addItem: (id: string, data: { itemId: string; expectedQty: number | null }) =>
    apiClient.post<StagingAreaItem>(`/api/logistics/staging-areas/${id}/items`, data),
  removeItem: (id: string, rowId: string) =>
    apiClient.delete<void>(`/api/logistics/staging-areas/${id}/items/${rowId}`),
};
