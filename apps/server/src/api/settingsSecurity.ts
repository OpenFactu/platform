/** GET y PUT /api/settings/security — la política de acceso de la empresa activa. */
import { Router } from 'express';
import { ZodError } from 'zod';
import {
  hasEnabledSsoProvider,
  parsePolicy,
  policyGate,
  readPolicy,
  writePolicy,
} from '../core/auth/policy';

const router = Router();

router.get('/', async (req: any, res) => {
  if (!req.tenantId) return res.status(400).json({ error: 'No hay empresa activa' });
  res.json(await readPolicy(req.tenantId));
});

router.put('/', async (req: any, res) => {
  if (!req.tenantId) return res.status(400).json({ error: 'No hay empresa activa' });
  try {
    const policy = parsePolicy(req.body);
    // Exigir SSO sin ningún proveedor activo dejaría a todos fuera (también a un SUPERUSER).
    const onlySso = policy.allowedMethods.every((m) => m === 'sso');
    if ((policy.ssoRequired || onlySso) && !(await hasEnabledSsoProvider())) {
      return res.status(409).json({
        error: 'No hay ningún proveedor de acceso único (SSO) activo',
        code: 'POLICY_LOCKOUT',
      });
    }
    // Un administrador no puede dejarse fuera a sí mismo: su forma de entrar actual tiene que valer.
    if (req.session && req.user?.role !== 'SUPERUSER') {
      const gate = policyGate(policy, { role: req.user.role, hasMfa: true }, req.session.method);
      if (!gate.allowed) {
        return res.status(409).json({
          error: 'Esa política te dejaría fuera: tu forma de entrar actual dejaría de valer',
          code: 'POLICY_LOCKOUT',
        });
      }
    }
    await writePolicy(req.tenantClient, policy);
    res.json(policy);
  } catch (e: any) {
    if (e instanceof ZodError) {
      return res.status(400).json({ error: 'Política no válida', code: 'POLICY_INVALID' });
    }
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

export default router;
