/** Llamadas del inicio de sesión (sin sesión previa). */
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
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
  /** Su passkey es de otro origen y no hay otro método: no hay nada que escribir aquí. */
  passkeyElsewhere?: boolean;
  passkeyRpIds?: string[];
  code?: string;
}

export const login = (body: LoginBody) =>
  apiClient.post<LoginResult>('/api/auth/login', body, { auth: false });

export const verifyMfa = (body: { challenge: string; code: string }) =>
  apiClient.post<LoginResult>('/api/auth/mfa', body, { auth: false });

/** Opciones WebAuthn: sin reto es el inicio sin contraseña; con el reto del 2FA, el segundo paso. */
export const passkeyOptions = (mfaChallenge?: string) =>
  apiClient.post<{ options: PublicKeyCredentialRequestOptionsJSON; challenge: string }>(
    '/api/auth/passkey/options',
    mfaChallenge ? { challenge: mfaChallenge } : {},
    { auth: false },
  );

export const passkeyVerify = (body: {
  challenge: string;
  response: AuthenticationResponseJSON;
  tenantId?: string;
}) => apiClient.post<LoginResult>('/api/auth/passkey/verify', body, { auth: false });

/** Cierra el segundo paso con una passkey. */
export const verifyMfaPasskey = (body: {
  challenge: string;
  passkey: { challenge: string; response: AuthenticationResponseJSON };
}) => apiClient.post<LoginResult>('/api/auth/mfa', body, { auth: false });
