/** Política de acceso de la empresa: forma y reglas puras (sin React). Repite `AuthPolicy` del servidor. */

export type AuthMethod = 'password' | 'passkey' | 'email_code' | 'sso';
export type MfaScope = 'off' | 'admins' | 'all';

export interface AuthPolicy {
  mfa: MfaScope;
  sessionMaxDays: number;
  idleHours: number;
  allowedMethods: AuthMethod[];
  ssoRequired: boolean;
  passwordRules: { enabled: boolean; minLength: number; blockCommon: boolean };
}

export const AUTH_METHODS: AuthMethod[] = ['password', 'passkey', 'email_code', 'sso'];
export const MFA_SCOPES: MfaScope[] = ['off', 'admins', 'all'];

/** Marca o desmarca un método; nunca deja la lista vacía (el servidor la rechaza). */
export function toggleMethod(methods: AuthMethod[], method: AuthMethod, on: boolean): AuthMethod[] {
  const without = methods.filter((m) => m !== method);
  if (!on) return without.length > 0 ? without : methods;
  return AUTH_METHODS.filter((m) => m === method || without.includes(m));
}

export function samePolicy(a: AuthPolicy | null, b: AuthPolicy | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Rangos que acepta el servidor (enteros). */
export const LIMITS = {
  sessionMaxDays: { min: 1, max: 365 },
  idleHours: { min: 1, max: 720 },
  minLength: { min: 6, max: 128 },
} as const;

export type PolicyErrorKind = 'invalid' | 'lockout' | 'other';

/** Clasifica el error de `PUT /api/settings/security` por su `code`. */
export function policyErrorKind(body: unknown): PolicyErrorKind {
  const code = (body as { code?: string } | null)?.code;
  if (code === 'POLICY_INVALID') return 'invalid';
  if (code === 'POLICY_LOCKOUT') return 'lockout';
  return 'other';
}

/** Clave de traducción del error de contraseña de la política de la empresa, si lo es. */
export function passwordErrorKey(body: unknown): string | null {
  const code = (body as { code?: string } | null)?.code;
  if (code === 'PASSWORD_TOO_SHORT') return 'auth.password.tooShort';
  if (code === 'PASSWORD_TOO_COMMON') return 'auth.password.tooCommon';
  return null;
}
