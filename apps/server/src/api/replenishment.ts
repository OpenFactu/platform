/**
 * Reposición. Solo traduce HTTP: las reglas están en `core/inventory/replenishment.ts`.
 * Crear pedidos pide también el permiso de pedidos de compra: es lo que hace por debajo.
 */
import { Router } from 'express';
import { logAudit } from '../utils/audit';
import {
  createDraftOrders,
  replenishmentRows,
  supplierOptions,
} from '../core/inventory/replenishment';
import { requireScope } from './middleware/apiToken';
import { requirePermission } from './middleware/requirePermission';

const router = Router();

const handle =
  (fn: (req: any, res: any) => Promise<unknown>) =>
  async (req: any, res: any): Promise<void> => {
    try {
      await fn(req, res);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  };

router.get(
  '/',
  requireScope('read:maestros'),
  handle(async (req, res) => res.json(await replenishmentRows(req.tenantClient))),
);

router.get(
  '/suppliers',
  requireScope('read:maestros'),
  handle(async (req, res) => res.json(await supplierOptions(req.tenantClient))),
);

router.post(
  '/orders',
  requireScope('write:compras'),
  requirePermission('/purchase-orders', 'write'),
  handle(async (req, res) => {
    const orders = await createDraftOrders(
      req.tenantId,
      req.tenantClient,
      req.user,
      req.body ?? {},
    );
    res.json({ orders });
    for (const order of orders) {
      logAudit({
        tenantClient: req.tenantClient,
        tenantId: req.tenantId || '',
        userId: req.user?.id,
        entityType: 'PurchaseOrder',
        entityId: order.id,
        action: 'CREATE',
        newValue: { docNum: order.docNum, partnerId: order.supplierId, source: 'replenishment' },
      });
    }
  }),
);

export default router;
