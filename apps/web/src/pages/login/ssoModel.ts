/** Reglas puras del acceso único (SSO): direcciones, ruta de vuelta y textos de error. */

/** Solo rutas relativas del propio origen: empiezan por `/` y no por `//` ni `/\`. */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || value.length > 2000) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(value)) return null;
  return value;
}

/** Dirección que arranca el SSO en el servidor. */
export function ssoStartUrl(
  providerId: string,
  opts: { returnTo?: string | null; handoffId?: string } = {},
): string {
  const q = new URLSearchParams();
  const ret = safeReturnPath(opts.returnTo);
  if (ret) q.set('return', ret);
  if (opts.handoffId) q.set('handoff', opts.handoffId);
  const qs = q.toString();
  return `/api/auth/sso/${encodeURIComponent(providerId)}/start${qs ? `?${qs}` : ''}`;
}

const KNOWN_ERRORS = [
  'NO_ACCOUNT',
  'EMAIL_UNVERIFIED',
  'DOMAIN_NOT_ALLOWED',
  'STATE_INVALID',
  'SSO_CANCELLED',
  'SSO_FAILED',
  'SSO_PROVIDER_NOT_FOUND',
  'SSO_UNAVAILABLE',
  'SSO_NOT_CONFIGURED',
  'HANDOFF_INVALID',
  'IDENTITY_IN_USE',
  'SESSION_INVALID',
  'METHOD_NOT_ALLOWED',
  'SSO_REQUIRED',
  'TICKET_INVALID',
] as const;

/** Clave de i18n del código de error del SSO; los desconocidos caen en el genérico. */
export function ssoErrorKey(code: string | null | undefined): string {
  return code && (KNOWN_ERRORS as readonly string[]).includes(code)
    ? `auth.sso.errors.${code}`
    : 'auth.sso.errors.generic';
}

/** Lee un parámetro de la URL (sin tocarla: sirve de valor inicial, que React puede repetir). */
export function readQueryParam(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

/** Quita de la URL los parámetros de un solo uso, para que un F5 no los repita. */
export function stripQueryParams(...names: string[]): void {
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const n of names) {
      if (url.searchParams.has(n)) {
        url.searchParams.delete(n);
        changed = true;
      }
    }
    if (changed) {
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  } catch {
    // Sin History API no hay nada que limpiar.
  }
}
