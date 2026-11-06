/**
 * Aviso por correo de un acceso desde un dispositivo nuevo. Solo si el login ha salido bien
 * y el dispositivo no se conocía (`isKnownDevice`); el primer login de una cuenta no cuenta.
 *
 * Como mucho un correo cada 24 h por usuario + navegador (`userAgent` + `clientKind`): la app
 * de escritorio puede perder su `deviceId` y parecer nueva en cada arranque.
 */
import { and, eq, gt } from 'drizzle-orm';
import { ClientFactory } from '../tenant/ClientFactory';
import { authEvents, globalUsers } from '../../db/schema';
import { enqueueMail } from '../email/MailQueue';
import { tr } from '../../i18n';
import { recordAuthEvent } from './authEvents';
import type { ClientInfo } from './clientInfo';
import { soleMailTenantId } from './emailCode';

const DAY_MS = 24 * 60 * 60 * 1000;

function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** Resumen corto del navegador, sin el rastro entero del `User-Agent`. */
export function simplifyUserAgent(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : '';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return [browser, os].filter(Boolean).join(' · ') || ua.slice(0, 60) || '—';
}

export async function maybeNotifyNewDevice(
  user: { id: string; email?: string | null; locale?: string | null; tenantId?: string | null },
  client: ClientInfo,
  _loginTenantId?: string | null,
): Promise<void> {
  try {
    const db = ClientFactory.getClient('public');
    // La empresa del login no decide por dónde sale: el correo va por el SMTP de la
    // empresa, que controla su ADMIN. Solo a quien no es SUPERUSER y está en una sola empresa.
    const [row] = await db
      .select({ role: globalUsers.role, tenantId: globalUsers.tenantId })
      .from(globalUsers)
      .where(eq(globalUsers.id, user.id));
    const tenant = await soleMailTenantId({
      id: user.id,
      role: row?.role ?? null,
      tenantId: row?.tenantId ?? user.tenantId ?? null,
    });
    const origin = (process.env.WEB_ORIGIN || '').replace(/\/$/, '');
    if (!origin || !user.email) {
      console.warn(
        `[auth] Dispositivo nuevo de ${user.id}: sin correo o WEB_ORIGIN, no se envía el aviso.`,
      );
      return;
    }

    // Un solo aviso por día para el mismo navegador, tenga o no el mismo `deviceId`.
    const since = new Date(Date.now() - DAY_MS);
    const recent = await db
      .select({ id: authEvents.id })
      .from(authEvents)
      .where(
        and(
          eq(authEvents.userId, user.id),
          eq(authEvents.kind, 'new_device_notice'),
          eq(authEvents.userAgent, client.userAgent || ''),
          eq(authEvents.clientKind, client.clientKind),
          gt(authEvents.at, since),
        ),
      )
      .limit(1);
    if (recent.length) return;

    if (!tenant) {
      // SUPERUSER, varias empresas o ninguna: no hay SMTP de confianza. Queda en el historial.
      await recordAuthEvent({
        userId: user.id,
        kind: 'new_device_notice',
        ok: false,
        client,
        detail: { skipped: 'no_trusted_smtp' },
      });
      return;
    }

    const locale = user.locale === 'en' ? 'en' : 'es';
    const t = (text: string) => tr(locale, text);
    const when = new Date().toLocaleString(locale === 'en' ? 'en-GB' : 'es-ES', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const device = `${client.clientKind === 'desktop' ? t('Aplicación de escritorio') : t('Navegador')} — ${simplifyUserAgent(client.userAgent)}`;
    const link = `${origin}/profile/security`;
    const subject = t('Keirost — Nuevo acceso a tu cuenta');
    const intro = t(
      'Hemos detectado un acceso a tu cuenta desde un dispositivo que no habíamos visto antes.',
    );
    const warn = t('Si no has sido tú, cierra esa sesión y cambia la contraseña:');

    enqueueMail(tenant, {
      to: user.email,
      subject,
      text:
        `${intro}\n\n${t('Cuándo')}: ${when} UTC\n${t('Dispositivo')}: ${device}\n` +
        `${t('Dirección IP')}: ${client.ip || '—'}\n\n${warn}\n${link}`,
      html: `
        <div style="font-family:system-ui,sans-serif;padding:24px;max-width:520px;background:#FAFBFC;border:1px solid #E2E8F0;border-radius:4px;">
          <h2 style="margin:0 0 12px 0;color:#0A1628;">${escapeHtml(t('Nuevo acceso a tu cuenta'))}</h2>
          <p style="color:#2D3A4A;line-height:1.6;">${escapeHtml(intro)}</p>
          <table style="color:#2D3A4A;line-height:1.6;" cellpadding="2">
            <tr><td><b>${escapeHtml(t('Cuándo'))}</b></td><td>${escapeHtml(when)} UTC</td></tr>
            <tr><td><b>${escapeHtml(t('Dispositivo'))}</b></td><td>${escapeHtml(device)}</td></tr>
            <tr><td><b>${escapeHtml(t('Dirección IP'))}</b></td><td>${escapeHtml(client.ip || '—')}</td></tr>
          </table>
          <p style="color:#2D3A4A;line-height:1.6;">${escapeHtml(warn)}</p>
          <p style="margin:24px 0;"><a href="${escapeHtml(link)}" style="background:#0D9488;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:700;display:inline-block;">${escapeHtml(t('Revisar mi seguridad'))}</a></p>
        </div>`,
    });
    await recordAuthEvent({
      userId: user.id,
      kind: 'new_device_notice',
      ok: true,
      client,
    });
  } catch (e: any) {
    console.error('[auth] No se pudo enviar el aviso de dispositivo nuevo:', e?.message);
  }
}
