/** GET y PUT /api/settings/security — la política de acceso de la empresa activa. */
import { Router } from 'express';
import { ZodError } from 'zod';
import { parsePolicy, readPolicy, writePolicy } from '../core/auth/policy';

const router = Router();

router.get('/', async (req: any, res) => {
  if (!req.tenantId) return res.status(400).json({ error: 'No hay empresa activa' });
  res.json(await readPolicy(req.tenantId));
});

router.put('/', async (req: any, res) => {
  if (!req.tenantId) return res.status(400).json({ error: 'No hay empresa activa' });
  try {
    const policy = parsePolicy(req.body);
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
