import { apiClient } from '@/shared/http';
import type {
  Carrier,
  CarrierAccount,
  CarrierAdapterInfo,
  CarrierTestResult,
} from '../domain/carrier';

export type CarrierInput = Record<string, unknown>;

/** Nota: /api/carriers vive fuera de /api/logistics — router propio en el server. */
export const carriersApi = {
  list: () => apiClient.get<Carrier[]>('/api/carriers'),
  listAdapters: () => apiClient.get<CarrierAdapterInfo[]>('/api/carriers/adapters'),
  create: (data: CarrierInput) => apiClient.post<Carrier>('/api/carriers', data),
  update: (id: string, data: CarrierInput) => apiClient.patch<Carrier>(`/api/carriers/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/carriers/${id}`),

  listAccounts: (carrierId: string) =>
    apiClient.get<CarrierAccount[]>(`/api/carriers/${carrierId}/accounts`),
  createAccount: (carrierId: string, data: Record<string, unknown>) =>
    apiClient.post<CarrierAccount>(`/api/carriers/${carrierId}/accounts`, data),
  removeAccount: (id: string) => apiClient.delete<void>(`/api/carriers/accounts/${id}`),
  testAccount: (id: string) => apiClient.post<CarrierTestResult>(`/api/carriers/accounts/${id}/test`),
};
