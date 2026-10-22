import { apiClient } from '@/shared/http';
import type { Kiosk } from '../domain/kiosk';
import type { KioskAppearance } from '../domain/kioskAppearance';

export const kiosksApi = {
  appearance: (id: string) =>
    apiClient.get<KioskAppearance>(`/api/hr/kiosks/${encodeURIComponent(id)}/appearance`),
  saveAppearance: (id: string, data: KioskAppearance) =>
    apiClient.put<KioskAppearance>(`/api/hr/kiosks/${encodeURIComponent(id)}/appearance`, data),
  list: () => apiClient.get<Kiosk[]>('/api/hr/kiosks'),
  create: (data: Record<string, unknown>) => apiClient.post<Kiosk>('/api/hr/kiosks', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<Kiosk>(`/api/hr/kiosks/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/hr/kiosks/${id}`),
  regenerateToken: (id: string) => apiClient.post<Kiosk>(`/api/hr/kiosks/${id}/regenerate-token`),
};
