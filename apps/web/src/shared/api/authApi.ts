import { apiClient } from '../http';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: string;
  tenantId?: string;
  tenantName?: string;
  permissions?: Record<string, { read: boolean; write: boolean; delete: boolean }>;
  avatarImageUrl?: string | null;
  /** Idioma elegido en su perfil; null = el del navegador. */
  locale?: string | null;
  /** Tema personal; null = el de la empresa. */
  themePreset?: string | null;
  themeMode?: 'light' | 'dark' | null;
}

export const authApi = {
  me: () => apiClient.get<AuthUser>('/api/auth/me'),
  switchTenant: (tenantId: string) =>
    apiClient.post<{ token: string; user: AuthUser }>('/api/auth/switch-tenant', { tenantId }),
  /** Revoca la sesión actual en el servidor. Un 401 aquí no vuelve a cerrar sesión. */
  logout: () =>
    apiClient.post<void>('/api/auth/logout', undefined, { skipUnauthorizedHandler: true }),
  /** Misma sesión, token nuevo: la caducidad del servidor se desliza. */
  refresh: () =>
    apiClient.post<{ token: string }>('/api/auth/refresh', undefined, {
      skipUnauthorizedHandler: true,
    }),
  /** Guarda el idioma de la interfaz en el perfil del usuario. */
  saveLocale: (locale: string) => apiClient.patch('/api/profile/me', { locale }),
  /** Guarda el tema personal; con los dos a null vuelve el de la empresa. */
  saveTheme: (theme: { themePreset: string | null; themeMode: 'light' | 'dark' | null }) =>
    apiClient.patch('/api/profile/me', theme),
};
