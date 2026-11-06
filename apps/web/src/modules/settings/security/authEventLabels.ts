/** Claves de i18n de los tipos de evento y de los métodos conocidos. */
const KINDS = [
  'login',
  'logout',
  'revoke',
  'lockout',
  'mfa',
  'mfa_change',
  'password_change',
  'new_device_notice',
  'sso_link',
  'sso_unlink',
];
const METHODS = ['password', 'passkey', 'email_code', 'handoff', 'factuapi', 'totp', 'backup'];

type Tr = (key: string, params?: Record<string, string | number>) => string;

/** Texto del tipo de evento; si no lo conocemos, el valor tal cual. */
export function eventKindLabel(t: Tr, kind: string): string {
  return KINDS.includes(kind) ? t(`auth.events.${kind}`) : kind;
}

/** Texto del método de acceso («sso:google» → «Single sign-on (google)»); null si no hay. */
export function eventMethodLabel(t: Tr, method: string | null | undefined): string | null {
  if (!method) return null;
  if (method.startsWith('sso:')) return t('auth.methods.sso', { provider: method.slice(4) });
  return METHODS.includes(method) ? t(`auth.methods.${method}`) : method;
}
