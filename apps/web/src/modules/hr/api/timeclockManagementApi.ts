import { apiClient } from '@/shared/http';
export interface Credential {
  id: string;
  kind: 'qr' | 'rfid';
  label: string;
  createdAt: string;
  revokedAt: string | null;
}
export interface Reader {
  id: string;
  name: string;
  location: string | null;
  mode: 'paired' | 'standalone';
  kioskId: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
}
export const timeclockManagementApi = {
  credentials: (employeeId: string) =>
    apiClient.get<Credential[]>('/api/hr/timeclock-credentials', { query: { employeeId } }),
  issue: (data: { employeeId: string; kind: 'qr' | 'rfid'; uid?: string; label: string }) =>
    apiClient.post('/api/hr/timeclock-credentials', data),
  revoke: (id: string) => apiClient.post(`/api/hr/timeclock-credentials/${id}/revoke`),
  qr: (employeeId: string) =>
    apiClient.get<{ qrDataUrl: string; label: string }>(
      `/api/hr/timeclock-credentials/${employeeId}/qr`,
    ),
  readers: () => apiClient.get<Reader[]>('/api/hr/timeclock-devices'),
  createReader: (data: Partial<Reader>) =>
    apiClient.post<Reader & { token: string }>('/api/hr/timeclock-devices', data),
  updateReader: (id: string, data: Partial<Reader>) =>
    apiClient.patch<Reader>(`/api/hr/timeclock-devices/${id}`, data),
  rotateReader: (id: string) =>
    apiClient.post<Reader & { token: string }>(`/api/hr/timeclock-devices/${id}/regenerate-token`),
};
