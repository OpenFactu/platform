import { apiClient } from '@/shared/http';
import type { TimeclockEntry, TimeclockMeResponse, TimeclockExportRow } from '../domain/timeclock';

export const timeclockApi = {
  me: () => apiClient.get<TimeclockMeResponse>('/api/hr/timeclock/me'),
  qr: () => apiClient.get<{ qrDataUrl: string; label: string }>('/api/hr/timeclock/me/qr'),
  entries: (query: { employeeId?: string; from?: string; to?: string }) =>
    apiClient.get<TimeclockEntry[]>('/api/hr/timeclock/entries', { query }),
  punch: (data: {
    requestId?: string;
    kind: TimeclockEntry['kind'];
    latitude?: number;
    longitude?: number;
    device?: string;
  }) => apiClient.post<TimeclockEntry>('/api/hr/timeclock/punch', data),
  /** Export en JSON (para generar el .xlsx en cliente, ver Timeclock.tsx). */
  exportJson: (query: Record<string, string>) =>
    apiClient.get<TimeclockExportRow[]>('/api/hr/timeclock/export', {
      query: { ...query, format: 'json' },
    }),
};
