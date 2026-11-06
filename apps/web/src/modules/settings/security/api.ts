import { apiClient } from '@/shared/http';

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  clientKind: string;
  userAgent: string | null;
  ip: string | null;
  method: string;
  current: boolean;
}

export const securityApi = {
  listSessions: async (): Promise<SessionInfo[]> =>
    (await apiClient.get<{ sessions: SessionInfo[] }>('/api/auth/sessions')).sessions,
  revokeSession: (id: string) =>
    apiClient.delete<void>(`/api/auth/sessions/${encodeURIComponent(id)}`),
  revokeOthers: () => apiClient.delete<{ revoked: number }>('/api/auth/sessions?others=1'),
};
