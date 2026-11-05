/** Cómo trata cada empresa el crédito de sus clientes y la reclamación de impagos. */
import { Router } from 'express';
import { CREDIT_MODES, getCreditMode } from '../core/partners/creditLimit';
import { setConfigSection } from '../core/config/systemConfigSection';
import { logAudit } from '../utils/audit';
import { getDunningSettings, saveDunningSettings } from '../core/dunning/settings';
import { requireScope } from './middleware/apiToken';

const router = Router();

// Un token de API no pasa por los permisos de usuario: lo acotan sus scopes.
router.use(requireScope('write:ventas'));

const readSettings = async (db: any) => ({
  creditMode: await getCreditMode(db),
  dunning: await getDunningSettings(db),
});

router.get('/', async (req: any, res) => {
  try {
    res.json(await readSettings(req.tenantClient));
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.put('/', async (req: any, res) => {
  try {
    const { creditMode, dunning } = req.body || {};
    if (creditMode !== undefined && !(CREDIT_MODES as readonly string[]).includes(creditMode)) {
      return res.status(400).json({ error: 'Modo de crédito no válido.' });
    }
    const before = await readSettings(req.tenantClient);
    if (creditMode !== undefined) {
      await setConfigSection(req.tenantClient, 'credit', { mode: 'warn' }, { mode: creditMode });
    }
    if (dunning !== undefined) await saveDunningSettings(req.tenantClient, dunning);
    const after = await readSettings(req.tenantClient);
    res.json(after);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'SalesSettings',
      entityId: req.tenantId || '',
      action: 'UPDATE',
      oldValue: before,
      newValue: after,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

export default router;
