import { apiClient } from '@/shared/http';
import type { IdentificationView, TimeclockEntry } from '../domain/timeclock';
import type { KioskAppearance } from '../domain/kioskAppearance';
export interface KioskConfig {
  tenant: string;
  token: string;
}
export function timeclockTerminalApi(config: KioskConfig) {
  const options = {
    auth: false,
    headers: { 'x-tenant-id': config.tenant, 'x-kiosk-token': config.token },
  };
  const base = '/api/hr/timeclock/terminal/v1/kiosk';
  return {
    appearance: (signal?: AbortSignal) =>
      apiClient.get<KioskAppearance>(`${base}/appearance`, { ...options, signal }),
    feedback: (signal?: AbortSignal) =>
      apiClient.get<{ id: string; message: string; at: number } | null>(`${base}/feedback`, {
        ...options,
        signal,
      }),
    current: (signal?: AbortSignal) =>
      apiClient.get<IdentificationView | null>(`${base}/identification`, { ...options, signal }),
    identify: (method: 'pin' | 'qr', value: string, requestId: string) =>
      apiClient.post<IdentificationView>(`${base}/identify`, { method, value, requestId }, options),
    confirm: (identificationId: string, kind: TimeclockEntry['kind'], requestId: string) =>
      apiClient.post<{ entry: TimeclockEntry }>(
        `${base}/punch`,
        { identificationId, kind, requestId },
        options,
      ),
    cancel: (id: string) =>
      apiClient.delete<void>(`${base}/identification/${encodeURIComponent(id)}`, options),
  };
}
