/**
 * Recuentos de inventario. Solo traduce HTTP: las reglas están en `core/inventory`.
 *
 * Contar pide `/inventory/counts`. Revisar diferencias y cerrar, `/inventory/count-review`, a
 * propósito aparte: en un recuento a ciegas, quien cuenta no tiene que poder ver lo esperado.
 */
import { Router } from 'express';
import { logAudit } from '../utils/audit';
import {
  addLine,
  cancelCount,
  closeCount,
  countDetail,
  countOptions,
  finishCount,
  listCounts,
  openCount,
  reopenCount,
  scanCode,
  searchItems,
  setLineAllocations,
  setLineCount,
  type CountViewer,
} from '../core/inventory/inventoryCounts';
import { requireScope } from './middleware/apiToken';
import { canSeeItemCosts } from './middleware/hideItemCosts';
import {
  grantsRead,
  permissionsForRequest,
  requirePermission,
} from './middleware/requirePermission';
import { invalidateDashboardCache } from './dashboard';

const REVIEW = '/inventory/count-review';

const router = Router();
router.use(requireScope('write:maestros'));

const handle =
  (fn: (req: any, res: any) => Promise<unknown>) =>
  async (req: any, res: any): Promise<void> => {
    try {
      await fn(req, res);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        error: error.message,
        ...(error.problems ? { problems: error.problems } : {}),
      });
    }
  };

const viewerOf = async (req: any): Promise<CountViewer> => ({
  canReview: grantsRead(await permissionsForRequest(req), REVIEW),
  canSeeCost: await canSeeItemCosts(req),
});

const actorOf = (req: any) => ({ userId: req.user?.id });

const audit = (
  req: any,
  id: string,
  action: Parameters<typeof logAudit>[0]['action'],
  newValue?: unknown,
) =>
  logAudit({
    tenantClient: req.tenantClient,
    tenantId: req.tenantId || '',
    userId: req.user?.id,
    entityType: 'InventoryCount',
    entityId: id,
    action,
    newValue,
  });

router.get(
  '/',
  handle(async (req, res) => res.json(await listCounts(req.tenantClient))),
);

router.get(
  '/options',
  handle(async (req, res) => res.json(await countOptions(req.tenantClient))),
);

router.post(
  '/',
  handle(async (req, res) => {
    const created = await openCount(req.tenantClient, req.body ?? {}, actorOf(req));
    res.json(created);
    audit(req, created.id, 'CREATE', {
      code: created.code,
      warehouseId: req.body?.warehouseId,
      zoneId: req.body?.zoneId ?? null,
      categoryId: req.body?.categoryId ?? null,
      blind: !!req.body?.blind,
      lines: created.lines,
    });
  }),
);

router.get(
  '/:id',
  handle(async (req, res) =>
    res.json(await countDetail(req.tenantClient, req.params.id, await viewerOf(req))),
  ),
);

router.get(
  '/:id/items',
  handle(async (req, res) =>
    res.json(await searchItems(req.tenantClient, req.params.id, String(req.query.q ?? ''))),
  ),
);

router.post(
  '/:id/lines',
  handle(async (req, res) =>
    res.json(
      await addLine(
        req.tenantClient,
        req.params.id,
        req.body ?? {},
        actorOf(req),
        await viewerOf(req),
      ),
    ),
  ),
);

router.patch(
  '/:id/lines/:lineId',
  handle(async (req, res) =>
    res.json(
      await setLineCount(
        req.tenantClient,
        req.params.id,
        req.params.lineId,
        req.body?.countedQty,
        actorOf(req),
        await viewerOf(req),
      ),
    ),
  ),
);

router.put(
  '/:id/lines/:lineId/allocations',
  requirePermission(REVIEW, 'write'),
  handle(async (req, res) =>
    res.json(
      await setLineAllocations(
        req.tenantClient,
        req.params.id,
        req.params.lineId,
        req.body?.allocations,
        await viewerOf(req),
      ),
    ),
  ),
);

router.post(
  '/:id/scan',
  handle(async (req, res) =>
    res.json(
      await scanCode(
        req.tenantClient,
        req.params.id,
        req.body ?? {},
        actorOf(req),
        await viewerOf(req),
      ),
    ),
  ),
);

router.post(
  '/:id/finish',
  handle(async (req, res) => res.json(await finishCount(req.tenantClient, req.params.id))),
);

router.post(
  '/:id/reopen',
  requirePermission(REVIEW, 'write'),
  handle(async (req, res) => res.json(await reopenCount(req.tenantClient, req.params.id))),
);

router.post(
  '/:id/close',
  requirePermission(REVIEW, 'write'),
  handle(async (req, res) => {
    const closed = await closeCount(req.tenantClient, req.params.id, actorOf(req));
    if (req.tenantId) invalidateDashboardCache(req.tenantId);
    res.json(closed);
    audit(req, req.params.id, 'CLOSE', {
      adjusted: closed.adjusted,
      receiptId: closed.receiptId,
      issueId: closed.issueId,
    });
  }),
);

router.post(
  '/:id/cancel',
  handle(async (req, res) => {
    const cancelled = await cancelCount(req.tenantClient, req.params.id, actorOf(req));
    res.json(cancelled);
    audit(req, req.params.id, 'CANCEL');
  }),
);

export default router;
