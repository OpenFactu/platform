/**
 * Entrar con un código de 6 cifras o un enlace que llegan por correo.
 *
 * El correo NO es un segundo factor: quien lo usa sigue pasando por el MFA del usuario (ver
 * `startMfaOrComplete`). Nada de aquí dice si una cuenta existe: sin cuenta, sin SMTP o frenado,
 * `requestEmailCode` vuelve en silencio.
 *
 * Del código solo se guarda su hash (`data.codeHash`); del enlace, el del secreto del reto.
 */
import crypto from 'crypto';
import { and, eq, gt, isNull, lte, or, desc } from 'drizzle-orm';
import { ClientFactory } from '../tenant/ClientFactory';
import {
  authChallenges,
  authThrottles,
  globalUsers,
  tenants,
  userTenantMemberships,
} from '../../db/schema';
import { enqueueMail } from '../email/MailQueue';
import { readConfig } from '../email/Mailer';
import { tr } from '../../i18n';
import {
  consumeChallenge,
  createChallenge,
  failChallenge,
  findChallenge,
  parseData,
  reserveAttempt,
} from './challenges';
import type { ClientInfo } from './clientInfo';
import { checkThrottle, normalizeAccount, recordAttempt } from './throttle';

export const EMAIL_CODE_TTL_MS = 10 * 60_000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
/** Como mucho un correo por cuenta en este tiempo. */
export const EMAIL_CODE_RESEND_MS = 60_000;

const db = () => ClientFactory.getClient('public');
// sha256 propio, igual que el de `challenges.ts`: aquí el código son solo cifras.
const hashCode = (code: string) => crypto.createHash('sha256').update(code).digest('hex');

function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

async function findUser(account: string) {
  const [user] = await db()
    .select()
    .from(globalUsers)
    .where(or(eq(globalUsers.email, account), eq(globalUsers.username, account)));
  return user ?? null;
}

/** La empresa por la que sale el correo: la heredada del usuario o su primera pertenencia. */
async function userTenantId(user: { id: string; tenantId?: string | null }) {
  if (user.tenantId) return user.tenantId;
  const [m] = await db()
    .select({ tenantId: userTenantMemberships.tenantId })
    .from(userTenantMemberships)
    .where(eq(userTenantMemberships.userId, user.id))
    .limit(1);
  return m?.tenantId ?? null;
}

/** ¿Tiene esa empresa el correo saliente configurado y encendido? */
export async function tenantHasSmtp(tenantId: string): Promise<boolean> {
  try {
    const cfg = await readConfig(await ClientFactory.getTenantClient(tenantId));
    return !!(cfg.enabled && cfg.host);
  } catch {
    return false;
  }
}

/** ¿Hay SMTP en alguna empresa? Para ofrecer o no «código por correo» antes de saber quién entra. */
let smtpCache: { at: number; value: boolean } | null = null;
export function resetSmtpCache() {
  smtpCache = null;
}
export async function anyTenantHasSmtp(): Promise<boolean> {
  // En memoria 60 s: la pantalla de acceso lo pregunta sin sesión y recorre todas las empresas.
  if (smtpCache && Date.now() - smtpCache.at < 60_000) return smtpCache.value;
  const value = await computeAnySmtp();
  smtpCache = { at: Date.now(), value };
  return value;
}
async function computeAnySmtp(): Promise<boolean> {
  const rows = await db().select({ id: tenants.id }).from(tenants);
  for (const r of rows) {
    if (await tenantHasSmtp(r.id)) return true;
  }
  return false;
}

/**
 * Reserva el hueco de envío de una cuenta en UN solo `INSERT … ON CONFLICT … WHERE`: dos
 * peticiones a la vez (o en dos instancias) no pasan las dos. Reutiliza la tabla del freno
 * con una clave propia que `checkThrottle` no lee.
 */
async function claimSendSlot(userId: string): Promise<boolean> {
  const now = new Date();
  const until = new Date(now.getTime() + EMAIL_CODE_RESEND_MS);
  const rows = await db()
    .insert(authThrottles)
    .values({ key: `email_send:${userId}`, failures: 0, windowStart: now, lockedUntil: until })
    .onConflictDoUpdate({
      target: authThrottles.key,
      set: { lockedUntil: until },
      setWhere: or(isNull(authThrottles.lockedUntil), lte(authThrottles.lockedUntil, now)),
    })
    .returning({ key: authThrottles.key });
  return rows.length > 0;
}

export async function requestEmailCode(
  email: string,
  client: ClientInfo,
  handoffId?: string,
): Promise<void> {
  const origin = (process.env.WEB_ORIGIN || '').replace(/\/$/, '');
  if (!origin || !email || typeof email !== 'string') return;

  // Cada petición cuenta, exista o no la cuenta: lo único que acota el correo que se puede
  // mandar a alguien (además del hueco de 60 s) es el ritmo.
  const keys = { account: normalizeAccount(email) || undefined, ip: client.ip };
  // Acción aparte de la de los códigos malos: pedir códigos no puede bloquear a la víctima.
  if ((await checkThrottle('email_request', keys)).blocked) return;
  await recordAttempt('email_request', keys, false);

  const user = await findUser(email);
  if (!user?.email) return;
  const tenantId = await userTenantId(user);
  if (!tenantId || !(await tenantHasSmtp(tenantId))) return;
  if (!(await claimSendSlot(user.id))) return;

  // Un código nuevo anula los anteriores: solo vale el último correo.
  await db()
    .update(authChallenges)
    .set({ status: 'consumed' })
    .where(
      and(
        eq(authChallenges.kind, 'email_code'),
        eq(authChallenges.userId, user.id),
        eq(authChallenges.status, 'pending'),
      ),
    );

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const { secret } = await createChallenge('email_code', {
    userId: user.id,
    ttlMs: EMAIL_CODE_TTL_MS,
    maxAttempts: EMAIL_CODE_MAX_ATTEMPTS,
    data: {
      // Con handoff no hay código: la única vía es el enlace con su aprobación explícita.
      ...(handoffId && typeof handoffId === 'string' ? {} : { codeHash: hashCode(code) }),
      ...(handoffId && typeof handoffId === 'string' ? { handoffId } : {}),
    },
  });

  const locale = user.locale === 'en' ? 'en' : 'es';
  const t = (text: string) => tr(locale, text);
  const link = `${origin}/login/email?token=${secret}`;
  const handoff = !!(handoffId && typeof handoffId === 'string');
  const ignore = t('Si no lo has pedido tú, ignora este correo.');
  const btn = (label: string) =>
    `<p style="margin:24px 0;"><a href="${escapeHtml(link)}" style="background:#0D9488;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:700;display:inline-block;">${escapeHtml(label)}</a></p>`;
  const frame = (inner: string) =>
    `<div style="font-family:system-ui,sans-serif;padding:24px;max-width:520px;background:#FAFBFC;border:1px solid #E2E8F0;border-radius:4px;">${inner}<p style="color:#94A3B8;font-size:12px;">${escapeHtml(ignore)}</p></div>`;

  if (handoff) {
    // Cualquiera puede pedir esto para un correo ajeno: no se parece a un acceso normal.
    const subject = t('Keirost — Alguien quiere entrar en tu cuenta');
    const body = t(
      'Se está iniciando sesión en tu cuenta desde otro dispositivo. Abre el enlace solo si has sido tú y comprueba que el código que verás coincide con el de ese dispositivo.',
    );
    enqueueMail(tenantId, {
      to: user.email,
      subject,
      text: `${body}

${link}

${ignore}`,
      html: frame(
        `<h2 style="margin:0 0 12px 0;color:#0A1628;">${escapeHtml(t('Alguien quiere entrar en tu cuenta'))}</h2><p style="color:#2D3A4A;line-height:1.6;">${escapeHtml(body)}</p>${btn(t('Revisar la solicitud'))}`,
      ),
    });
    return;
  }

  const subject = t('Keirost — Tu código de acceso');
  const intro = t('Usa este código para entrar. Caduca en 10 minutos:');
  const linkIntro = t('O entra directamente con este enlace:');
  enqueueMail(tenantId, {
    to: user.email,
    subject,
    text: `${intro}

${code}

${linkIntro}
${link}

${ignore}`,
    html: frame(
      `<h2 style="margin:0 0 12px 0;color:#0A1628;">${escapeHtml(t('Tu código de acceso'))}</h2><p style="color:#2D3A4A;line-height:1.6;">${escapeHtml(intro)}</p><p style="font-size:28px;letter-spacing:6px;font-weight:700;color:#0A1628;margin:16px 0;">${escapeHtml(code)}</p><p style="color:#2D3A4A;line-height:1.6;">${escapeHtml(linkIntro)}</p>${btn(t('Entrar'))}`,
    ),
  });
}

/**
 * Comprueba el código y consume el reto. `null` por cualquier motivo (sin cuenta, sin reto,
 * agotado, caducado, código malo): quien llama no distingue uno de otro.
 */
export async function verifyEmailCode(
  email: string,
  code: string,
  client?: ClientInfo,
): Promise<{ userId: string } | null> {
  if (!email || typeof email !== 'string' || typeof code !== 'string') return null;
  const keys = client ? { account: normalizeAccount(email) || undefined, ip: client.ip } : null;
  if (keys && (await checkThrottle('email_code', keys)).blocked) return null;

  const user = await findUser(email);
  let ok = false;
  if (user) {
    const [row] = await db()
      .select()
      .from(authChallenges)
      .where(
        and(
          eq(authChallenges.kind, 'email_code'),
          eq(authChallenges.userId, user.id),
          eq(authChallenges.status, 'pending'),
          gt(authChallenges.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(authChallenges.expiresAt))
      .limit(1);
    // El intento se reserva antes de comparar: lo que acota las pruebas es el reto.
    const reserved = row ? await reserveAttempt(row.id) : null;
    if (reserved) {
      const a = Buffer.from(hashCode(code.trim()));
      const b = Buffer.from(String(parseData(reserved).codeHash ?? ''));
      if (
        a.length === b.length &&
        crypto.timingSafeEqual(a, b) &&
        (await consumeChallenge(row!.id))
      ) {
        ok = true;
      } else {
        await failChallenge(row!.id);
      }
    }
  }
  if (keys) {
    if (ok) await recordAttempt('email_code', keys, true);
    else void recordAttempt('email_code', keys, false).catch(() => {});
  }
  return ok && user ? { userId: user.id } : null;
}

/** Mira el enlace sin gastarlo: lo que hace falta para saber si va con un handoff. */
export async function peekEmailLink(
  secret: string,
): Promise<{ userId: string; handoffId?: string } | null> {
  const row = await findChallenge('email_code', secret);
  if (!row || !row.userId || row.status !== 'pending') return null;
  const d = parseData(row);
  return { userId: row.userId, ...(d.handoffId ? { handoffId: String(d.handoffId) } : {}) };
}

/** Gasta el enlace (una vez): el reto entero muere, también el código que iba con él. */
export async function redeemEmailLink(
  secret: string,
): Promise<{ userId: string; handoffId?: string } | null> {
  const row = await findChallenge('email_code', secret);
  if (!row || !row.userId || row.status !== 'pending') return null;
  if (!(await consumeChallenge(row.id))) return null;
  const d = parseData(row);
  return { userId: row.userId, ...(d.handoffId ? { handoffId: String(d.handoffId) } : {}) };
}
