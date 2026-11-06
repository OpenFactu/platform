/** Facturas recurrentes. El trabajo de verdad está en `core/recurring`. */
import { Router } from 'express';
import { logAudit } from '../utils/audit';
import {
  createRecurring,
  deleteRecurring,
  generateDue,
  getRecurring,
  listRecurring,
  recordFailure,
  setRecurringStatus,
  todayIso,
  updateRecurring,
} from '../core/recurring/recurringDocuments';
import { requireScope } from './middleware/apiToken';

const router = Router();

// Un token de API no pasa por los permisos de usuario: lo acotan sus scopes.
router.use(requireScope('write:ventas'));

function fail(res: any, error: any) {
  if (!error.statusCode) console.error('[RecurringDocuments]', error);
  res.status(error.statusCode || 500).json({ error: error.message });
}

const audit = (req: any, id: string, action: 'CREATE' | 'UPDATE' | 'DELETE', newValue?: any) =>
  logAudit({
    tenantClient: req.tenantClient,
    tenantId: req.tenantId || '',
    userId: req.user?.id,
    entityType: 'RecurringDocument',
    entityId: id,
    action,
    newValue,
  });

router.get('/', async (req: any, res) => {
  try {
    res.json(await listRecurring(req.tenantClient));
  } catch (error: any) {
    fail(res, error);
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    res.json(await getRecurring(req.tenantClient, req.params.id));
  } catch (error: any) {
    fail(res, error);
  }
});

router.post('/', async (req: any, res) => {
  try {
    const row = await createRecurring(req.tenantClient, req.user, req.body);
    res.json(row);
    audit(req, row.id, 'CREATE', row);
  } catch (error: any) {
    fail(res, error);
  }
});

router.put('/:id', async (req: any, res) => {
  try {
    const row = await updateRecurring(req.tenantClient, req.params.id, req.body);
    res.json(row);
    audit(req, row.id, 'UPDATE', row);
  } catch (error: any) {
    fail(res, error);
  }
});

for (const action of ['pause', 'resume', 'finish'] as const) {
  router.post(`/:id/${action}`, async (req: any, res) => {
    try {
      const row = await setRecurringStatus(req.tenantClient, req.params.id, action);
      res.json(row);
      audit(req, row.id, 'UPDATE', { status: row.status, nextDate: row.nextDate });
    } catch (error: any) {
      fail(res, error);
    }
  });
}

/** Generar ya lo que toca, sin esperar a la siguiente pasada. Lo que no toca no se adelanta. */
router.post('/:id/run', async (req: any, res) => {
  const { id } = req.params;
  try {
    const generated = await generateDue(req.tenantClient, req.tenantId, id);
    res.json({
      generated: generated.map(({ documentId, docNum, periodDate }) => ({
        documentId,
        docNum,
        periodDate,
      })),
    });
  } catch (error: any) {
    await recordFailure(
      req.tenantClient,
      id,
      error?.message || 'Error al generar',
      todayIso(),
    ).catch(() => undefined);
    fail(res, error);
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    await deleteRecurring(req.tenantClient, req.params.id);
    res.json({ success: true });
    audit(req, req.params.id, 'DELETE');
  } catch (error: any) {
    fail(res, error);
  }
});

export default router;
