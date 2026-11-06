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

export interface AuthEventInfo {
  id: string;
  at: string;
  kind: string;
  ok: boolean;
  method: string | null;
  ip: string | null;
  userAgent: string | null;
  clientKind: string | null;
}

/** Historial y sesiones de otro usuario de la empresa (acciones de administrador). */
export const userAccessApi = {
  events: async (userId: string): Promise<AuthEventInfo[]> =>
    (
      await apiClient.get<{ events: AuthEventInfo[] }>(
        `/api/users/${encodeURIComponent(userId)}/auth-events?limit=50`,
      )
    ).events,
  revokeAll: (userId: string) =>
    apiClient.delete<{ revoked: number }>(`/api/users/${encodeURIComponent(userId)}/sessions`),
};

export const myEventsApi = {
  events: async (): Promise<AuthEventInfo[]> =>
    (await apiClient.get<{ events: AuthEventInfo[] }>('/api/auth/events?limit=50')).events,
};

export const securityApi = {
  listSessions: async (): Promise<SessionInfo[]> =>
    (await apiClient.get<{ sessions: SessionInfo[] }>('/api/auth/sessions')).sessions,
  revokeSession: (id: string) =>
    apiClient.delete<void>(`/api/auth/sessions/${encodeURIComponent(id)}`),
  revokeOthers: () => apiClient.delete<{ revoked: number }>('/api/auth/sessions?others=1'),
};
