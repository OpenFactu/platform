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

/** Formas de entrar que ofrece el servidor (`GET /api/auth/methods`). */
export interface LoginMethods {
  password: boolean;
  passkey: boolean;
  emailCode: boolean;
  sso: Array<{ id: string; name: string; kind: string }>;
}

export const methods = (tenantId?: string) =>
  apiClient.get<LoginMethods>(
    `/api/auth/methods${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''}`,
    { auth: false },
  );

/** Pide el código y el enlace por correo; responde 202 exista o no la cuenta. */
export const requestEmailCode = (body: { email: string; handoffId?: string }) =>
  apiClient.post<{ sent: boolean }>('/api/auth/email-code', body, { auth: false });

export const verifyEmailCode = (body: { email: string; code: string; tenantId?: string }) =>
  apiClient.post<LoginResult>('/api/auth/email-code/verify', body, { auth: false });

/** Entrega de login entre dispositivos: el cliente que pide entrar y el que aprueba. */
export interface HandoffTicket {
  handoffId: string;
  pollSecret: string;
  confirmCode: string;
  expiresAt: string;
}

export interface HandoffInfo {
  confirmCode: string;
  clientKind: string;
  userAgent: string | null;
  ipHint: string | null;
  expiresAt: string;
}

/** Respuesta del sondeo: esperando, caducado, o ya el cuerpo normal del login. */
export type HandoffPoll = { status: 'pending' | 'expired' } | LoginResult;

export const createHandoff = () =>
  apiClient.post<HandoffTicket>('/api/auth/handoff', {}, { auth: false });

export const pollHandoff = (body: { handoffId: string; pollSecret: string }) =>
  apiClient.post<HandoffPoll>('/api/auth/handoff/poll', body, { auth: false });

export const handoffInfo = (id: string) =>
  apiClient.get<HandoffInfo>(`/api/auth/handoff/${encodeURIComponent(id)}`, { auth: false });

/** Sin handoff entra (cuerpo del login); con handoff devuelve qué se aprueba. */
export const redeemEmailLink = (token: string) =>
  apiClient.post<LoginResult & { handoff?: HandoffInfo }>(
    '/api/auth/email-link',
    { token },
    { auth: false },
  );

export const approveEmailLink = (token: string) =>
  apiClient.post<{ approved: boolean }>('/api/auth/email-link/approve', { token }, { auth: false });

/** Canjea el ticket con el que el servidor devuelve de un proveedor de acceso único. */
export const redeemSsoTicket = (body: { ticket: string; tenantId?: string }) =>
  apiClient.post<LoginResult>('/api/auth/sso/ticket', body, { auth: false });
