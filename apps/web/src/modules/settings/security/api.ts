import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
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

export interface PasskeyInfo {
  id: string;
  name: string;
  rpId: string;
  createdAt: string;
  lastUsedAt: string | null;
  /** La llave es de este origen: se puede usar desde aquí. */
  here: boolean;
}

export const passkeysApi = {
  list: async (): Promise<PasskeyInfo[]> => {
    const data = await apiClient.get<PasskeyInfo[] | { passkeys: PasskeyInfo[] }>(
      '/api/auth/passkeys',
    );
    return Array.isArray(data) ? data : data.passkeys;
  },
  registerOptions: () =>
    apiClient.post<PublicKeyCredentialCreationOptionsJSON>('/api/auth/passkeys/register/options'),
  registerVerify: (body: { response: RegistrationResponseJSON; name: string }) =>
    apiClient.post<PasskeyInfo>('/api/auth/passkeys/register/verify', body),
  rename: (id: string, name: string) =>
    apiClient.patch<unknown>(`/api/auth/passkeys/${encodeURIComponent(id)}`, { name }),
  remove: (id: string) => apiClient.delete<void>(`/api/auth/passkeys/${encodeURIComponent(id)}`),
};

export interface IdentityInfo {
  id: string;
  providerId: string;
  providerName: string;
  kind: string;
  email: string | null;
  linkedAt: string;
}

/** Cuentas externas (Google, Microsoft, OIDC) enlazadas a la cuenta propia. */
export const identitiesApi = {
  list: async (): Promise<IdentityInfo[]> =>
    (await apiClient.get<{ identities: IdentityInfo[] }>('/api/auth/identities')).identities,
  /** Devuelve la dirección del proveedor a la que hay que navegar. */
  link: async (providerId: string): Promise<string> =>
    (
      await apiClient.post<{ url: string }>(
        `/api/auth/identities/link/${encodeURIComponent(providerId)}`,
      )
    ).url,
  unlink: (id: string) => apiClient.delete<void>(`/api/auth/identities/${encodeURIComponent(id)}`),
};

export const securityApi = {
  listSessions: async (): Promise<SessionInfo[]> =>
    (await apiClient.get<{ sessions: SessionInfo[] }>('/api/auth/sessions')).sessions,
  revokeSession: (id: string) =>
    apiClient.delete<void>(`/api/auth/sessions/${encodeURIComponent(id)}`),
  revokeOthers: () => apiClient.delete<{ revoked: number }>('/api/auth/sessions?others=1'),
};
