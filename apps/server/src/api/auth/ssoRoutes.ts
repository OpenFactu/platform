/**
 * Entrar con un proveedor externo (Google, Microsoft, OIDC). Sin sesión: `/api/auth` se monta
 * antes del contexto de empresa. Ver `core/auth/sso.ts`.
 *
 *   GET  /sso/:id/start?handoff=&return=  → 302 al proveedor
 *   GET  /sso/:id/callback                → con handoff, página para confirmarlo; si no,
 *                                           enlace o ticket para la web
 *   POST /sso/handoff/confirm             → formulario de esa página: el único que aprueba
 *   POST /sso/ticket { ticket, tenantId? } → como el resto de logins (`startMfaOrComplete`)
 */
import express, { Router } from 'express';
import { eq } from 'drizzle-orm';
import { ClientFactory } from '../../core/tenant/ClientFactory';
import * as schema from '../../db/schema';
import { clientInfo } from '../../core/auth/clientInfo';
import { checkThrottle, recordAttempt, sendThrottled } from '../../core/auth/throttle';
import { HandoffError, approveHandoff, handoffInfo } from '../../core/auth/handoff';
import { simplifyUserAgent } from '../../core/auth/newDeviceNotice';
import {
  confirmCookie,
  createHandoffConfirm,
  createSsoTicket,
  finishSso,
  loadProvider,
  redeemHandoffConfirm,
  redeemSsoTicket,
  safeReturnTo,
  ssoCookie,
  startSso,
  webOrigin,
} from '../../core/auth/sso';
import { parseLocale, tr, type Locale } from '../../i18n';
import { startMfaOrComplete } from './mfaRoutes';

const router = Router();

export const notConfigured = (res: any) =>
  res.status(503).json({
    error: 'El acceso con proveedores externos no está configurado en este servidor',
    code: 'SSO_NOT_CONFIGURED',
  });

import { internalError } from './internalError';

// identityRoutes y authProviders lo importan de aquí.
export { internalError };

/** Los errores del flujo vuelven a la web: es una navegación del navegador, no una llamada. */
function redirectError(res: any, origin: string, code: string, path = '/login') {
  res.redirect(302, `${origin}${path}?ssoError=${encodeURIComponent(code)}`);
}

function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** Página mínima, sin la SPA ni scripts, y que no se puede meter en un marco. */
function page(res: any, status: number, locale: Locale, title: string, inner: string) {
  res
    .status(status)
    .set('Cache-Control', 'no-store')
    .set(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    )
    .set('X-Frame-Options', 'DENY')
    .set('Referrer-Policy', 'no-referrer')
    .type('html')
    .send(
      `<!doctype html><html lang="${locale === 'en' ? 'en' : 'es'}"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>` +
        `<body style="font-family:system-ui,sans-serif;margin:0;padding:48px 16px;background:#FAFBFC;color:#0A1628;">` +
        `<main style="max-width:420px;margin:0 auto;">` +
        `<h1 style="font-size:22px;margin:0 0 12px 0;">${escapeHtml(title)}</h1>${inner}</main></body></html>`,
    );
}

const para = (text: string) =>
  `<p style="color:#2D3A4A;line-height:1.6;margin:0 0 16px 0;">${escapeHtml(text)}</p>`;

const localeOf = (req: any): Locale => parseLocale(req.headers['accept-language']);

function donePage(req: any, res: any) {
  const l = localeOf(req);
  page(
    res,
    200,
    l,
    tr(l, 'Ya puedes volver a Keirost'),
    para(tr(l, 'Has entrado correctamente. Cierra esta pestaña y vuelve a la aplicación.')),
  );
}

function invalidPage(req: any, res: any) {
  const l = localeOf(req);
  page(
    res,
    400,
    l,
    tr(l, 'La solicitud ya no es válida'),
    para(
      tr(
        l,
        'Ha caducado o ya se ha usado. Vuelve a empezar desde el dispositivo que quiere entrar.',
      ),
    ),
  );
}

/** Qué dispositivo pide entrar y con qué código, y los dos botones. */
function confirmPage(
  req: any,
  res: any,
  info: NonNullable<Awaited<ReturnType<typeof handoffInfo>>>,
  account: string,
  secret: string,
) {
  const l = localeOf(req);
  const t = (s: string) => tr(l, s);
  const kind = info.clientKind === 'desktop' ? t('Aplicación de escritorio') : t('Navegador');
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#64748B;">${escapeHtml(label)}</td>` +
    `<td style="padding:4px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`;
  const button = (value: string, label: string, primary: boolean) =>
    `<button type="submit" name="decision" value="${value}" style="display:block;width:100%;` +
    `margin:0 0 12px 0;padding:12px 16px;border-radius:6px;font-size:16px;font-weight:700;cursor:pointer;` +
    (primary
      ? 'background:#0D9488;color:#fff;border:1px solid #0D9488;'
      : 'background:#fff;color:#0A1628;border:1px solid #CBD5E1;') +
    `">${escapeHtml(label)}</button>`;
  page(
    res,
    200,
    l,
    t('Confirma que eres tú'),
    para(t('Vas a dejar entrar en tu cuenta a este dispositivo:')) +
      `<table style="border-collapse:collapse;margin:0 0 16px 0;color:#0A1628;">` +
      (account ? row(t('Cuenta'), account) : '') +
      row(t('Dispositivo'), `${kind} — ${simplifyUserAgent(info.userAgent)}`) +
      row(t('Red'), info.ipHint) +
      `</table>` +
      `<p style="margin:0 0 4px 0;color:#64748B;">${escapeHtml(t('Código de confirmación'))}</p>` +
      `<p style="font-size:28px;letter-spacing:4px;font-weight:700;margin:0 0 8px 0;">${escapeHtml(info.confirmCode)}</p>` +
      para(t('Comprueba que el código coincide con el que ves en ese dispositivo.')) +
      `<form method="post" action="/api/auth/sso/handoff/confirm">` +
      `<input type="hidden" name="confirm" value="${escapeHtml(secret)}">` +
      button('approve', t('Sí, soy yo, dejarle entrar'), true) +
      button('deny', t('No he sido yo'), false) +
      `</form>`,
  );
}

router.get('/sso/:id/start', async (req, res) => {
  const origin = webOrigin();
  if (!origin) return notConfigured(res);
  try {
    const provider = await loadProvider(req.params.id);
    if (!provider) return redirectError(res, origin, 'SSO_PROVIDER_NOT_FOUND');
    const handoffId = typeof req.query.handoff === 'string' ? req.query.handoff : '';
    // Un handoff que ya no espera no merece el viaje al proveedor.
    if (handoffId && !(await handoffInfo(handoffId))) {
      return redirectError(res, origin, 'HANDOFF_INVALID');
    }
    const returnTo = safeReturnTo(req.query.return);
    let started: Awaited<ReturnType<typeof startSso>>;
    try {
      started = await startSso(provider, {
        ...(handoffId ? { handoffId } : {}),
        ...(returnTo ? { returnTo } : {}),
      });
    } catch (e: any) {
      console.error(
        `[auth] SSO ${provider.id}: no se pudo contactar con el proveedor:`,
        e?.message,
      );
      return redirectError(res, origin, 'SSO_UNAVAILABLE');
    }
    res.setHeader('Set-Cookie', ssoCookie(started.binding));
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, started.url);
  } catch (error: any) {
    console.error('[auth] SSO start:', error?.message);
    redirectError(res, origin, 'SSO_FAILED');
  }
});

router.get('/sso/:id/callback', async (req, res) => {
  const origin = webOrigin();
  if (!origin) return notConfigured(res);
  // La atadura al navegador ya no sirve, salga bien o mal.
  res.setHeader('Set-Cookie', ssoCookie(null));
  res.setHeader('Cache-Control', 'no-store');
  try {
    const provider = await loadProvider(req.params.id);
    if (!provider) return redirectError(res, origin, 'SSO_PROVIDER_NOT_FOUND');
    const result = await finishSso(provider, req);
    const errorPath = result.flow.linkUserId ? '/profile/security' : '/login';
    if ('error' in result) return redirectError(res, origin, result.error, errorPath);

    if (result.flow.handoffId) {
      // Todavía no se aprueba: el usuario tiene que ver qué dispositivo entra y confirmarlo.
      const info = await handoffInfo(result.flow.handoffId);
      if (!info) return redirectError(res, origin, 'HANDOFF_INVALID');
      const confirm = await createHandoffConfirm({
        handoffId: result.flow.handoffId,
        userId: result.userId,
        method: 'sso:' + provider.kind,
        mfaDone: result.mfaDone,
      });
      res.setHeader('Set-Cookie', [ssoCookie(null), confirmCookie(confirm.binding)]);
      return confirmPage(req, res, info, result.email ?? '', confirm.secret);
    }
    if (result.flow.linkUserId) return res.redirect(302, `${origin}/profile/security?linked=1`);

    const ticket = await createSsoTicket(result.userId, provider, result.mfaDone);
    const ret = result.flow.returnTo ? `&return=${encodeURIComponent(result.flow.returnTo)}` : '';
    res.redirect(302, `${origin}/login/sso?ticket=${encodeURIComponent(ticket)}${ret}`);
  } catch (error: any) {
    console.error('[auth] SSO callback:', error?.message);
    redirectError(res, origin, 'SSO_FAILED');
  }
});

/**
 * POST /api/auth/sso/handoff/confirm (formulario `confirm`, `decision`) — solo aquí se aprueba
 * un handoff por SSO. Pide el secreto del formulario y la cookie de este navegador.
 */
router.post(
  '/sso/handoff/confirm',
  express.urlencoded({ extended: false, limit: '4kb' }),
  async (req, res) => {
    const ip = clientInfo(req).ip;
    try {
      const gate = await checkThrottle('sso', { ip });
      if (gate.blocked) return sendThrottled(res, gate.retryAfter);
      const used = await redeemHandoffConfirm(String(req.body?.confirm ?? ''), req);
      if (!used) {
        void recordAttempt('sso', { ip }, false).catch(() => {});
        return invalidPage(req, res);
      }
      res.setHeader('Set-Cookie', confirmCookie(null));
      if (req.body?.decision !== 'approve') {
        const l = localeOf(req);
        return page(
          res,
          200,
          l,
          tr(l, 'No se ha dado acceso'),
          para(tr(l, 'Nadie ha entrado en tu cuenta. Puedes cerrar esta pestaña.')),
        );
      }
      try {
        await approveHandoff(used.handoffId, used.userId, used.method, used.mfaDone);
      } catch (e) {
        if (e instanceof HandoffError) return invalidPage(req, res);
        throw e;
      }
      donePage(req, res);
    } catch (error: any) {
      internalError(res, 'SSO handoff confirm', error);
    }
  },
);

/** POST /api/auth/sso/ticket { ticket, tenantId? } — el ticket del callback por la sesión. */
router.post('/sso/ticket', async (req, res) => {
  const { ticket, tenantId } = req.body || {};
  const ip = clientInfo(req).ip;
  try {
    const gate = await checkThrottle('sso', { ip });
    if (gate.blocked) return sendThrottled(res, gate.retryAfter);
    const used = await redeemSsoTicket(String(ticket ?? ''));
    const [user] = used
      ? await ClientFactory.getClient('public')
          .select()
          .from(schema.globalUsers)
          .where(eq(schema.globalUsers.id, used.userId))
      : [];
    if (!used || !user) {
      void recordAttempt('sso', { ip }, false).catch(() => {});
      return res
        .status(401)
        .json({ error: 'El acceso ha caducado. Vuelve a intentarlo.', code: 'TICKET_INVALID' });
    }
    // El SSO es el primer factor: si el usuario tiene otro, se le pide (salvo `mfa: 'provider'`).
    await startMfaOrComplete(req, res, user, {
      method: 'sso:' + used.kind,
      mfa: used.mfaDone,
      tenantId: typeof tenantId === 'string' ? tenantId : null,
    });
  } catch (error: any) {
    internalError(res, 'SSO ticket', error);
  }
});

export default router;
