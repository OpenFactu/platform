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
}

export const authApi = {
  me: () => apiClient.get<AuthUser>('/api/auth/me'),
  switchTenant: (tenantId: string) =>
    apiClient.post<{ token: string; user: AuthUser }>('/api/auth/switch-tenant', { tenantId }),
};
