/** Llamadas del inicio de sesión (sin sesión previa). */
import { apiClient } from '@/shared/http';

export interface LoginUserInfo {
  name?: string;
  email?: string;
  avatarImageUrl?: string | null;
}

export interface LoginBody {
  email: string;
  password: string;
  selectedTenantId?: string;
}

/** Respuesta de `/login` y `/mfa`: o sesión, o un reto del segundo paso. */
export interface LoginResult {
  token?: string;
  user?: {
    username?: string;
    avatarImageUrl?: string | null;
    tenantId?: string;
    tenantName?: string;
    [key: string]: unknown;
  } & LoginUserInfo;
  mfaRequired?: boolean;
  twoFactorRequired?: boolean;
  challenge?: string;
  methods?: string[];
}

export const login = (body: LoginBody) =>
  apiClient.post<LoginResult>('/api/auth/login', body, { auth: false });

export const verifyMfa = (body: { challenge: string; code: string }) =>
  apiClient.post<LoginResult>('/api/auth/mfa', body, { auth: false });
