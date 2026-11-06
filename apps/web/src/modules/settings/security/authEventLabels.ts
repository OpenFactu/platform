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
  'passkey_add',
  'passkey_remove',
  'policy_block',
];
const METHODS = ['password', 'passkey', 'email_code', 'handoff', 'factuapi', 'totp', 'backup'];

/** Eventos que son avisos, no accesos: su `ok: false` no es un intento fallido. */
const NOTICES = ['new_device_notice'];

type Tr = (key: string, params?: Record<string, string | number>) => string;

/** Texto del tipo de evento; si no lo conocemos, el valor tal cual. */
export function eventKindLabel(t: Tr, kind: string, ok = true): string {
  if (!KINDS.includes(kind)) return kind;
  // Aviso que no salió (sin SMTP de confianza): se dice, en vez de pintarlo como un fallo.
  if (NOTICES.includes(kind) && !ok) return t(`auth.events.${kind}_skipped`);
  return t(`auth.events.${kind}`);
}

/** `ok`, `failed` o `notice`: qué icono le toca al evento. */
export function eventTone(kind: string, ok: boolean): 'ok' | 'failed' | 'notice' {
  if (NOTICES.includes(kind)) return 'notice';
  return ok ? 'ok' : 'failed';
}

/** Texto del método de acceso («sso:google» → «Single sign-on (google)»); null si no hay. */
export function eventMethodLabel(t: Tr, method: string | null | undefined): string | null {
  if (!method) return null;
  if (method.startsWith('sso:')) return t('auth.methods.sso', { provider: method.slice(4) });
  return METHODS.includes(method) ? t(`auth.methods.${method}`) : method;
}
