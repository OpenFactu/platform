/** Modelo del formulario de proveedores de acceso (puro: sin React ni red). */

export type ProviderKind = 'google' | 'microsoft' | 'oidc';

export const PROVIDER_KINDS: ProviderKind[] = ['google', 'microsoft', 'oidc'];

export interface AuthProvider {
  id: string;
  kind: ProviderKind;
  name: string;
  issuer: string | null;
  clientId: string;
  scopes: string | null;
  enabled: boolean;
  allowedDomains: string[];
  trustProviderMfa: boolean;
  hasSecret: boolean;
  redirectUri: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderForm {
  kind: ProviderKind;
  name: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Texto libre: dominios separados por comas, espacios o saltos de línea. */
  allowedDomains: string;
  trustProviderMfa: boolean;
  enabled: boolean;
}

export const emptyProviderForm = (): ProviderForm => ({
  kind: 'google',
  name: '',
  issuer: '',
  clientId: '',
  clientSecret: '',
  allowedDomains: '',
  trustProviderMfa: false,
  enabled: true,
});

export const formFromProvider = (p: AuthProvider): ProviderForm => ({
  kind: p.kind,
  name: p.name,
  issuer: p.issuer ?? '',
  clientId: p.clientId,
  clientSecret: '',
  allowedDomains: p.allowedDomains.join(', '),
  trustProviderMfa: p.trustProviderMfa,
  enabled: p.enabled,
});

/** «Acme.com, @foo.es» → ['acme.com', 'foo.es'] (sin arroba, en minúsculas, sin repetir). */
export function parseDomains(text: string): string[] {
  const list = text
    .split(/[\s,;]+/)
    .map((d) => d.trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean);
  return [...new Set(list)];
}

/** Qué falta por rellenar: claves de i18n de los campos. */
export function missingFields(f: ProviderForm): Array<'name' | 'clientId' | 'issuer'> {
  const out: Array<'name' | 'clientId' | 'issuer'> = [];
  if (!f.name.trim()) out.push('name');
  if (!f.clientId.trim()) out.push('clientId');
  if (f.kind === 'oidc' && !f.issuer.trim()) out.push('issuer');
  return out;
}

/** Cuerpo de `POST`/`PATCH`. Sin secreto escrito no se manda: el servidor conserva el que había. */
export function toPayload(f: ProviderForm, editing: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: f.name.trim(),
    clientId: f.clientId.trim(),
    enabled: f.enabled,
    allowedDomains: parseDomains(f.allowedDomains),
    trustProviderMfa: f.trustProviderMfa,
  };
  if (!editing) body.kind = f.kind;
  if (f.kind === 'oidc') body.issuer = f.issuer.trim();
  if (f.clientSecret) body.clientSecret = f.clientSecret;
  return body;
}

/** Dirección de retorno que se registra en el proveedor. El servidor manda la suya si tiene `WEB_ORIGIN`. */
export function callbackUrlFor(
  p: Pick<AuthProvider, 'id' | 'redirectUri'>,
  origin: string,
): string {
  return p.redirectUri ?? `${origin}/api/auth/sso/${encodeURIComponent(p.id)}/callback`;
}
