/**
 * Entrar con Google, Microsoft u otro proveedor OIDC (flujo de código con PKCE, `state` y
 * `nonce`, de `openid-client` 5).
 *
 * - El `state` es el secreto de un reto `sso_state`: de él solo se guarda el hash. El `nonce`
 *   y el `code_verifier` viajan en `data` porque hay que mandarlos tal cual al proveedor.
 * - El reto va atado al navegador que empezó con una cookie (`keirost_sso`, solo su hash en
 *   `data`): sin ella, alguien podría hacer entrar a otro en SU cuenta mandándole su callback.
 * - Nunca se crea un usuario. La primera vez se enlaza por email verificado y único; después,
 *   por `subject`, aunque cambie el email.
 * - Microsoft `common`: `openid-client` sustituye `{tenantid}` del `issuer` descubierto por el
 *   `tid` del token cuando se descubre por la URL multiempresa, así que el `iss` se comprueba
 *   contra el directorio que firmó. Qué directorios valen lo dice `allowedDomains`.
 */
import crypto from 'crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { Issuer, generators, type Client } from 'openid-client';
import { ClientFactory } from '../tenant/ClientFactory';
import { authProviders, globalUsers, userIdentities, userSessions } from '../../db/schema';
import { consumeChallenge, createChallenge, findChallenge, parseData } from './challenges';
import { decryptSecret } from './totpCrypto';
import { recordAuthEvent } from './authEvents';
import { soleMailTenantId } from './emailCode';
import { clientInfo } from './clientInfo';
import { enqueueMail } from '../email/MailQueue';
import { tr } from '../../i18n';

export const ISSUERS = {
  google: 'https://accounts.google.com',
  microsoft: 'https://login.microsoftonline.com/common/v2.0',
} as const;

export const SSO_KINDS = ['google', 'microsoft', 'oidc'] as const;
export type SsoKind = (typeof SSO_KINDS)[number];

export const SSO_STATE_TTL_MS = 10 * 60_000;
export const SSO_TICKET_TTL_MS = 60_000;
export const SSO_COOKIE = 'keirost_sso';
/** Confirmar un handoff aprobado por SSO: 5 min, una vez, en el mismo navegador. */
export const SSO_CONFIRM_TTL_MS = 5 * 60_000;
export const SSO_CONFIRM_COOKIE = 'keirost_sso_confirm';
const DEFAULT_SCOPES = 'openid email profile';

export type ProviderRow = typeof authProviders.$inferSelect;

export type SsoErrorCode =
  | 'NO_ACCOUNT'
  | 'EMAIL_UNVERIFIED'
  | 'DOMAIN_NOT_ALLOWED'
  | 'STATE_INVALID'
  | 'IDENTITY_IN_USE'
  | 'SSO_CANCELLED'
  | 'SESSION_INVALID'
  | 'SSO_FAILED';

export interface SsoFlow {
  handoffId?: string;
  linkUserId?: string;
  /** Sesión desde la que se pidió el enlace: tiene que seguir viva en el callback. */
  linkSessionId?: string;
  returnTo?: string;
}

export type FinishResult =
  | { userId: string; mfaDone: 'provider' | null; email: string | null; flow: SsoFlow }
  | { error: SsoErrorCode; flow: SsoFlow };

const db = () => ClientFactory.getClient('public');
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** El origen público de la web, leído en cada llamada. Sin él no hay SSO. */
export function webOrigin(): string | null {
  const o = (process.env.WEB_ORIGIN || '').trim().replace(/\/$/, '');
  return o || null;
}

export function redirectUriFor(providerId: string, origin = webOrigin()): string {
  return `${origin}/api/auth/sso/${encodeURIComponent(providerId)}/callback`;
}

export function issuerFor(provider: Pick<ProviderRow, 'kind' | 'issuer'>): string | null {
  if (provider.kind === 'google' || provider.kind === 'microsoft') return ISSUERS[provider.kind];
  return provider.issuer || null;
}

/** `allowedDomains` guardado como JSON: lista de dominios (o `tid` de Microsoft), en minúsculas. */
export function parseDomains(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map((d) => String(d).trim().toLowerCase()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Solo una ruta de la propia web: sin `//otro.sitio`, URLs absolutas ni caracteres de control. */
export function safeReturnTo(v: unknown): string | undefined {
  if (
    typeof v !== 'string' ||
    !v.startsWith('/') ||
    v.startsWith('//') ||
    v.includes('\\') ||
    /[\x00-\x1f\x7f]/.test(v)
  ) {
    return undefined;
  }
  return v.slice(0, 500);
}

export async function loadProvider(id: string): Promise<ProviderRow | null> {
  if (!id || typeof id !== 'string') return null;
  const [row] = await db()
    .select()
    .from(authProviders)
    .where(and(eq(authProviders.id, id), eq(authProviders.enabled, true)));
  return row ?? null;
}

export async function listEnabledProviders(): Promise<
  Array<{ id: string; name: string; kind: string }>
> {
  return db()
    .select({ id: authProviders.id, name: authProviders.name, kind: authProviders.kind })
    .from(authProviders)
    .where(eq(authProviders.enabled, true))
    .orderBy(authProviders.name);
}

// Un cliente por proveedor y versión de su fila (y origen, que cambia el `redirect_uri`).
const clients = new Map<string, { key: string; client: Promise<Client> }>();

export function getClient(provider: ProviderRow): Promise<Client> {
  const origin = webOrigin();
  const key = `${new Date(provider.updatedAt).getTime()}|${origin}`;
  const hit = clients.get(provider.id);
  if (hit && hit.key === key) return hit.client;
  const client = (async () => {
    const url = issuerFor(provider);
    if (!url) throw new Error('Proveedor sin issuer');
    const issuer = await Issuer.discover(url);
    return new issuer.Client({
      client_id: provider.clientId || '',
      client_secret: provider.clientSecretEnc ? decryptSecret(provider.clientSecretEnc) : undefined,
      redirect_uris: [redirectUriFor(provider.id, origin)],
      response_types: ['code'],
    });
  })();
  // Un descubrimiento fallido no se queda en caché: el siguiente intento lo repite.
  client.catch(() => {
    if (clients.get(provider.id)?.client === client) clients.delete(provider.id);
  });
  clients.set(provider.id, { key, client });
  return client;
}

/**
 * Empieza el flujo. Devuelve la URL del proveedor y el valor de la cookie que ata el reto a
 * este navegador (`binding`), que quien llama pone con `ssoCookie`.
 */
export async function startSso(
  provider: ProviderRow,
  opts: SsoFlow,
): Promise<{ url: string; binding: string }> {
  const client = await getClient(provider);
  const nonce = generators.nonce();
  const codeVerifier = generators.codeVerifier();
  const binding = generators.random();
  const { secret } = await createChallenge('sso_state', {
    userId: opts.linkUserId,
    ttlMs: SSO_STATE_TTL_MS,
    maxAttempts: 1,
    data: {
      providerId: provider.id,
      nonce,
      codeVerifier,
      bindingHash: sha256(binding),
      ...(opts.handoffId ? { handoffId: opts.handoffId } : {}),
      ...(opts.linkUserId ? { linkUserId: opts.linkUserId } : {}),
      ...(opts.linkSessionId ? { linkSessionId: opts.linkSessionId } : {}),
      ...(opts.returnTo ? { returnTo: opts.returnTo } : {}),
    },
  });
  const url = client.authorizationUrl({
    scope: withOpenid(provider.scopes),
    state: secret,
    nonce,
    code_challenge: generators.codeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    redirect_uri: redirectUriFor(provider.id),
  });
  return { url, binding };
}

/** Sin `openid` no hay `id_token`: se añade si la configuración lo olvidó. */
export function withOpenid(scopes: string | null | undefined): string {
  const list = String(scopes || DEFAULT_SCOPES)
    .split(/\s+/)
    .filter(Boolean);
  return (list.includes('openid') ? list : ['openid', ...list]).join(' ');
}

function cookie(name: string, value: string | null, ttlMs: number): string {
  const secure = (webOrigin() || '').startsWith('https://') ? '; Secure' : '';
  const age = value ? Math.floor(ttlMs / 1000) : 0;
  return `${name}=${value ?? ''}; Path=/api/auth/sso; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`;
}

/** `Set-Cookie` de la atadura al navegador; sin valor, la borra. */
export function ssoCookie(binding: string | null): string {
  return cookie(SSO_COOKIE, binding, SSO_STATE_TTL_MS);
}

/** `Set-Cookie` de la confirmación de un handoff; sin valor, la borra. */
export function confirmCookie(binding: string | null): string {
  return cookie(SSO_CONFIRM_COOKIE, binding, SSO_CONFIRM_TTL_MS);
}

function readCookie(req: any, name: string): string {
  const raw = String(req?.headers?.cookie || '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const domainOf = (email: string | null) =>
  email && email.includes('@') ? email.split('@').pop()! : '';

/**
 * Qué dice el token de la cuenta, según el proveedor:
 * - `domainAllowed`: con `allowedDomains`, el dominio del email (o el `hd` de Google, o el
 *   `tid` de Microsoft) tiene que estar en la lista.
 * - `emailVerified`: Google y OIDC, `email_verified === true`. Microsoft no lo afirma (una
 *   cuenta personal o un directorio cualquiera pueden poner el email que quieran): solo cuenta
 *   como verificado si el `tid` del token es un directorio de `allowedDomains`.
 */
export function claimRules(
  provider: Pick<ProviderRow, 'kind' | 'allowedDomains'>,
  claims: Record<string, any>,
): { email: string | null; domainAllowed: boolean; emailVerified: boolean } {
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : null;
  const tid = typeof claims.tid === 'string' ? claims.tid.toLowerCase() : '';
  const domains = parseDomains(provider.allowedDomains);
  const tidAllowed = provider.kind === 'microsoft' && !!tid && domains.includes(tid);
  const domainAllowed =
    !domains.length ||
    domains.includes(domainOf(email)) ||
    tidAllowed ||
    (provider.kind === 'google' &&
      typeof claims.hd === 'string' &&
      domains.includes(claims.hd.toLowerCase()));
  const emailVerified = provider.kind === 'microsoft' ? tidAllowed : claims.email_verified === true;
  return { email, domainAllowed, emailVerified };
}

/** Termina el flujo con lo que el proveedor devuelve al callback. */
export async function finishSso(provider: ProviderRow, req: any): Promise<FinishResult> {
  const state = typeof req.query?.state === 'string' ? req.query.state : '';
  const row = await findChallenge('sso_state', state);
  const data = row ? parseData(row) : {};
  const flow: SsoFlow = {
    ...(data.handoffId ? { handoffId: String(data.handoffId) } : {}),
    ...(data.linkUserId ? { linkUserId: String(data.linkUserId) } : {}),
    ...(data.linkSessionId ? { linkSessionId: String(data.linkSessionId) } : {}),
    ...(data.returnTo ? { returnTo: String(data.returnTo) } : {}),
  };
  if (!row || data.providerId !== provider.id) return { error: 'STATE_INVALID', flow };
  // Se gasta antes de mirar nada más: un `state` vale una sola vez, salga bien o mal.
  if (!(await consumeChallenge(row.id))) return { error: 'STATE_INVALID', flow };
  const binding = readCookie(req, SSO_COOKIE);
  if (!binding || !sameHash(sha256(binding), String(data.bindingHash ?? ''))) {
    return { error: 'STATE_INVALID', flow };
  }
  if (req.query?.error) return { error: 'SSO_CANCELLED', flow };

  let claims: Record<string, any>;
  try {
    const client = await getClient(provider);
    const params = client.callbackParams(req);
    const tokens = await client.callback(redirectUriFor(provider.id), params, {
      state,
      nonce: String(data.nonce),
      code_verifier: String(data.codeVerifier),
    });
    claims = tokens.claims();
  } catch (e: any) {
    console.error(`[auth] SSO ${provider.id}: el proveedor no cerró el flujo:`, e?.message);
    return { error: 'SSO_FAILED', flow };
  }

  const subject = String(claims.sub || '');
  if (!subject) return { error: 'SSO_FAILED', flow };
  const { email, domainAllowed, emailVerified } = claimRules(provider, claims);
  // Qué cuentas del proveedor pueden entrar, en cada acceso y no solo al enlazar.
  if (!domainAllowed) return { error: 'DOMAIN_NOT_ALLOWED', flow };

  const mfaDone: 'provider' | null =
    provider.trustProviderMfa && Array.isArray(claims.amr) && claims.amr.includes('mfa')
      ? 'provider'
      : null;
  const done = (userId: string) => ({ userId, mfaDone, email, flow });

  const [linked] = await db()
    .select()
    .from(userIdentities)
    .where(and(eq(userIdentities.providerId, provider.id), eq(userIdentities.subject, subject)));

  // Enlazar a mano desde la pantalla de seguridad: la sesión ya dice quién es.
  if (flow.linkUserId) {
    // Si esa sesión se cerró mientras tanto (revocada, caducada), no se enlaza nada.
    if (!(await sessionAlive(flow.linkSessionId, flow.linkUserId))) {
      return { error: 'SESSION_INVALID', flow };
    }
    if (linked && linked.userId !== flow.linkUserId) return { error: 'IDENTITY_IN_USE', flow };
    if (linked) {
      await touchEmail(linked.id, email);
      return done(linked.userId);
    }
    const userId = await link(provider, flow.linkUserId, subject, email, req);
    if (userId !== flow.linkUserId) return { error: 'IDENTITY_IN_USE', flow };
    return done(userId);
  }

  if (linked) {
    await touchEmail(linked.id, email);
    return done(linked.userId);
  }

  // Primera vez: solo con un email que el proveedor garantice.
  if (!email || !emailVerified) return { error: 'EMAIL_UNVERIFIED', flow };

  const matches = await db()
    .select({ id: globalUsers.id, role: globalUsers.role })
    .from(globalUsers)
    .where(sql`lower(trim(${globalUsers.email})) = ${email}`)
    .limit(2);
  // Ninguna o más de una: no se adivina cuál. Un SUPERUSER nunca se enlaza solo por el email
  // (solo a mano, con su sesión), y la respuesta es la misma que sin cuenta.
  if (matches.length !== 1 || matches[0].role === 'SUPERUSER') {
    return { error: 'NO_ACCOUNT', flow };
  }
  return done(await link(provider, matches[0].id, subject, email, req));
}

async function sessionAlive(sid: string | undefined, userId: string): Promise<boolean> {
  if (!sid) return false;
  const now = new Date();
  const [row] = await db()
    .select({ id: userSessions.id })
    .from(userSessions)
    .where(
      and(
        eq(userSessions.id, sid),
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, now),
        gt(userSessions.absoluteExpiresAt, now),
      ),
    );
  return !!row;
}

async function touchEmail(identityId: string, email: string | null) {
  if (!email) return;
  await db().update(userIdentities).set({ email }).where(eq(userIdentities.id, identityId));
}

/** Crea el enlace (o devuelve el dueño si otra petición lo creó a la vez), con evento y correo. */
async function link(
  provider: ProviderRow,
  userId: string,
  subject: string,
  email: string | null,
  req: any,
): Promise<string> {
  const inserted = await db()
    .insert(userIdentities)
    .values({
      id: crypto.randomUUID(),
      userId,
      providerId: provider.id,
      subject,
      email,
      linkedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ userId: userIdentities.userId });
  if (!inserted.length) {
    const [row] = await db()
      .select({ userId: userIdentities.userId })
      .from(userIdentities)
      .where(and(eq(userIdentities.providerId, provider.id), eq(userIdentities.subject, subject)));
    return row?.userId ?? userId;
  }
  await recordAuthEvent({
    userId,
    kind: 'sso_link',
    ok: true,
    method: 'sso:' + provider.kind,
    client: clientInfo(req),
    detail: { providerId: provider.id, provider: provider.name },
  });
  await notifyLinked(userId, provider, email);
  return userId;
}

/** Correo «se ha enlazado una cuenta»: nunca rompe el acceso. */
async function notifyLinked(userId: string, provider: ProviderRow, linkedEmail: string | null) {
  try {
    const [user] = await db().select().from(globalUsers).where(eq(globalUsers.id, userId));
    const origin = webOrigin();
    if (!user?.email || !origin) return;
    // Solo a quien no es SUPERUSER y está en una sola empresa: el correo sale por el SMTP de la
    // empresa, que controla su ADMIN (ver `soleMailTenantId`). El evento `sso_link` ya quedó.
    const tenant = await soleMailTenantId(user);
    if (!tenant) {
      console.warn(
        `[auth] Cuenta enlazada a ${user.id}: SUPERUSER, varias empresas o ninguna; no se envía el aviso.`,
      );
      return;
    }
    const locale = user.locale === 'en' ? 'en' : 'es';
    const t = (text: string, vars?: Record<string, string>) => tr(locale, text, vars);
    const link = `${origin}/profile/security`;
    const intro = t('Se ha enlazado tu cuenta de {provider} para entrar en Keirost.', {
      provider: provider.name,
    });
    const account = linkedEmail ? `${t('Cuenta enlazada')}: ${linkedEmail}` : '';
    const warn = t('Si no has sido tú, desenlázala y cambia la contraseña:');
    enqueueMail(tenant, {
      to: user.email,
      subject: t('Keirost — Se ha enlazado una cuenta'),
      text: `${intro}\n${account}\n\n${warn}\n${link}`,
      html: `
        <div style="font-family:system-ui,sans-serif;padding:24px;max-width:520px;background:#FAFBFC;border:1px solid #E2E8F0;border-radius:4px;">
          <h2 style="margin:0 0 12px 0;color:#0A1628;">${escapeHtml(t('Se ha enlazado una cuenta'))}</h2>
          <p style="color:#2D3A4A;line-height:1.6;">${escapeHtml(intro)}</p>
          ${account ? `<p style="color:#2D3A4A;line-height:1.6;">${escapeHtml(account)}</p>` : ''}
          <p style="color:#2D3A4A;line-height:1.6;">${escapeHtml(warn)}</p>
          <p style="margin:24px 0;"><a href="${escapeHtml(link)}" style="background:#0D9488;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:700;display:inline-block;">${escapeHtml(t('Revisar mi seguridad'))}</a></p>
        </div>`,
    });
  } catch (e: any) {
    console.error('[auth] No se pudo enviar el aviso de cuenta enlazada:', e?.message);
  }
}

/** Ticket de un solo uso (60 s) que la web cambia por la sesión: el JWT no va en la URL. */
export async function createSsoTicket(
  userId: string,
  provider: ProviderRow,
  mfaDone: 'provider' | null,
): Promise<string> {
  const { secret } = await createChallenge('sso_ticket', {
    userId,
    ttlMs: SSO_TICKET_TTL_MS,
    maxAttempts: 1,
    data: { kind: provider.kind, providerId: provider.id, mfaDone },
  });
  return secret;
}

export async function redeemSsoTicket(
  secret: string,
): Promise<{ userId: string; kind: string; mfaDone: 'provider' | null } | null> {
  const row = await findChallenge('sso_ticket', secret);
  if (!row?.userId || row.status !== 'pending') return null;
  if (!(await consumeChallenge(row.id))) return null;
  const d = parseData(row);
  return {
    userId: row.userId,
    kind: String(d.kind || 'oidc'),
    mfaDone: d.mfaDone === 'provider' ? 'provider' : null,
  };
}

/**
 * Un handoff identificado por SSO todavía no está aprobado: el navegador tiene que confirmarlo
 * con un botón viendo qué dispositivo pide entrar (spec, punto 7). Sin esto, quien crea un
 * handoff y manda el `start` a otro se lleva su sesión con un login silencioso del proveedor.
 * El secreto va en el formulario y la atadura en una cookie de este navegador.
 */
export async function createHandoffConfirm(input: {
  handoffId: string;
  userId: string;
  method: string;
  mfaDone: 'provider' | null;
}): Promise<{ secret: string; binding: string }> {
  const binding = generators.random();
  const { secret } = await createChallenge('sso_handoff_confirm', {
    userId: input.userId,
    ttlMs: SSO_CONFIRM_TTL_MS,
    maxAttempts: 1,
    data: {
      handoffId: input.handoffId,
      method: input.method,
      mfaDone: input.mfaDone,
      bindingHash: sha256(binding),
    },
  });
  return { secret, binding };
}

/**
 * Gasta la confirmación (una vez) si la cookie es la de este navegador. Con la cookie mala no
 * se gasta: quien la tiene de verdad puede seguir. `null` si no vale.
 */
export async function redeemHandoffConfirm(
  secret: string,
  req: any,
): Promise<{ handoffId: string; userId: string; method: string; mfaDone: string | null } | null> {
  const row = await findChallenge('sso_handoff_confirm', String(secret ?? ''));
  if (!row?.userId || row.status !== 'pending') return null;
  const d = parseData(row);
  const binding = readCookie(req, SSO_CONFIRM_COOKIE);
  if (!binding || !sameHash(sha256(binding), String(d.bindingHash ?? ''))) return null;
  if (!(await consumeChallenge(row.id))) return null;
  return {
    handoffId: String(d.handoffId ?? ''),
    userId: row.userId,
    method: String(d.method ?? 'sso'),
    mfaDone: d.mfaDone === 'provider' ? 'provider' : null,
  };
}
