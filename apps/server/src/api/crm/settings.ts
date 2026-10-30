import { Router } from 'express';
import { requirePermission } from '../middleware/requirePermission';
import { getCrmSettings, setCrmSettings } from '../../core/crm/settings';
import { logAudit } from '../../utils/audit';
import { errorDetail } from './shared';

const router = Router();

// mountShared no exige sesión: los ajustes son de una empresa y de sus usuarios.
router.use((req: any, res, next) => {
  if (!req.user?.id || !req.tenantId) return res.status(401).json({ error: 'No autorizado' });
  next();
});

/**
 * GET /api/crm/settings — lo lee cualquier usuario del CRM: los formularios
 * necesitan los motivos de pérdida y los orígenes.
 */
router.get('/', async (req: any, res) => {
  try {
    res.json(await getCrmSettings(req.tenantClient));
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

/** PUT /api/crm/settings — solo con permiso de escritura en Ajustes del CRM. */
router.put('/', requirePermission('/crm/settings', 'write'), async (req: any, res) => {
  try {
    const before = await getCrmSettings(req.tenantClient);
    const after = await setCrmSettings(req.tenantClient, req.body || {});
    res.json(after);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'CrmSettings',
      entityId: 'crm',
      action: 'UPDATE',
      oldValue: before,
      newValue: after,
    });
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

export default router;
