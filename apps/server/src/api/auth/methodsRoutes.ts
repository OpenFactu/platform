/**
 * GET /api/auth/methods?tenantId= — qué formas de entrar ofrecer en la pantalla de acceso.
 * Sin sesión y sin decir nada de ningún usuario: solo lo que admite el servidor y, si se da la
 * empresa, lo que su política permite.
 */
import { Router } from 'express';
import { anyTenantHasSmtp } from '../../core/auth/emailCode';
import { rpFor } from '../../core/auth/passkeys';
import { readPolicy } from '../../core/auth/policy';

const router = Router();

router.get('/methods', async (req, res) => {
  try {
    let allowed: string[] | null = null;
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : '';
    if (tenantId) allowed = (await readPolicy(tenantId)).allowedMethods;
    const ok = (m: string) => !allowed || allowed.includes(m);

    const emailCode = !!process.env.WEB_ORIGIN && ok('email_code') && (await anyTenantHasSmtp());
    res.json({
      password: ok('password'),
      passkey: rpFor(req.headers.origin as string | undefined) !== null && ok('passkey'),
      emailCode,
      // Lo llena la tarea de SSO.
      sso: [] as Array<{ id: string; name: string; kind: string }>,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
