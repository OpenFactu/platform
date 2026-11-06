/**
 * Entrar con un proveedor externo (Google, Microsoft, OIDC). Sin sesión: `/api/auth` se monta
 * antes del contexto de empresa. Ver `core/auth/sso.ts`.
 *
 *   GET  /sso/:id/start?handoff=&return=  → 302 al proveedor
 *   GET  /sso/:id/callback                → handoff aprobado (HTML), enlace, o ticket para la web
 *   POST /sso/ticket { ticket, tenantId? } → como el resto de logins (`startMfaOrComplete`)
 */
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { ClientFactory } from '../../core/tenant/ClientFactory';
import * as schema from '../../db/schema';
import { clientInfo } from '../../core/auth/clientInfo';
import { checkThrottle, recordAttempt, sendThrottled } from '../../core/auth/throttle';
import { HandoffError, approveHandoff, handoffInfo } from '../../core/auth/handoff';
import {
  createSsoTicket,
  finishSso,
  loadProvider,
  redeemSsoTicket,
  safeReturnTo,
  ssoCookie,
  startSso,
  webOrigin,
} from '../../core/auth/sso';
import { parseLocale, tr } from '../../i18n';
import { startMfaOrComplete } from './mfaRoutes';

const router = Router();

export const notConfigured = (res: any) =>
  res.status(503).json({
    error: 'El acceso con proveedores externos no está configurado en este servidor',
    code: 'SSO_NOT_CONFIGURED',
  });

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

/** Página mínima, sin la SPA, para el navegador que aprobó un handoff. */
function handoffDonePage(req: any, res: any) {
  const locale = parseLocale(req.headers['accept-language']);
  const title = tr(locale, 'Ya puedes volver a Keirost');
  const body = tr(
    locale,
    'Has entrado correctamente. Cierra esta pestaña y vuelve a la aplicación.',
  );
  res
    .status(200)
    .set('Cache-Control', 'no-store')
    .set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
    .type('html')
    .send(
      `<!doctype html><html lang="${locale === 'en' ? 'en' : 'es'}"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>` +
        `<body style="font-family:system-ui,sans-serif;margin:0;padding:48px 16px;background:#FAFBFC;color:#0A1628;">` +
        `<main style="max-width:420px;margin:0 auto;text-align:center;">` +
        `<h1 style="font-size:22px;margin:0 0 12px 0;">${escapeHtml(title)}</h1>` +
        `<p style="color:#2D3A4A;line-height:1.6;margin:0;">${escapeHtml(body)}</p></main></body></html>`,
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
    let started: Awaited<ReturnType<typeof startSso>>;
    try {
      started = await startSso(provider, {
        ...(handoffId ? { handoffId } : {}),
        ...(safeReturnTo(req.query.return) ? { returnTo: safeReturnTo(req.query.return) } : {}),
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
      try {
        await approveHandoff(
          result.flow.handoffId,
          result.userId,
          'sso:' + provider.kind,
          result.mfaDone,
        );
      } catch (e) {
        if (e instanceof HandoffError) return redirectError(res, origin, 'HANDOFF_INVALID');
        throw e;
      }
      return handoffDonePage(req, res);
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
    res.status(500).json({ error: error.message });
  }
});

export default router;
