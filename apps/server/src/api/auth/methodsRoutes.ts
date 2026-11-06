/**
 * GET /api/auth/methods?tenantId= — qué formas de entrar ofrecer en la pantalla de acceso.
 * Sin sesión y sin decir nada de ningún usuario: solo lo que admite el servidor y, si se da la
 * empresa, lo que su política permite.
 */
import { Router } from 'express';
import { anyTenantHasSmtp } from '../../core/auth/emailCode';
import { rpFor } from '../../core/auth/passkeys';
import { readPolicy } from '../../core/auth/policy';
import { listEnabledProviders, webOrigin } from '../../core/auth/sso';

const router = Router();

router.get('/methods', async (req, res) => {
  try {
    let allowed: string[] | null = null;
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : '';
    if (tenantId) allowed = (await readPolicy(tenantId)).allowedMethods;
    const ok = (m: string) => !allowed || allowed.includes(m);

    // `startUrl` es absoluta, en el origen público: la cookie de atadura del SSO y el `redirect_uri`
    // viven ahí, y el escritorio (cuya web es un proxy local) tiene que abrir esa dirección.
    const origin = webOrigin();
    const sso =
      origin && ok('sso')
        ? (await listEnabledProviders()).map((p) => ({
            ...p,
            startUrl: `${origin}/api/auth/sso/${encodeURIComponent(p.id)}/start`,
          }))
        : [];
    const emailCode = !!process.env.WEB_ORIGIN && ok('email_code') && (await anyTenantHasSmtp());
    res.json({
      // Siempre: un SUPERUSER no depende de `allowedMethods` y el gate del login rechaza a los demás.
      password: true,
      passkey: rpFor(req.headers.origin as string | undefined) !== null && ok('passkey'),
      emailCode,
      // Sin secretos: lo justo para pintar el botón y llamar a `/sso/:id/start`.
      sso,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
