/** Preparación de pedidos y recepción de compras. */
import { Router } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import {
  resyncTasks,
  startPreparation,
  updatePickingTask,
} from '../../core/logistics/prepService';
import { action, contextOf } from './shared';

const router = Router();

router.post(
  '/prep/from-sdn/:id',
  action(async (req) => startPreparation(await contextOf(req), 'SDN', req.params.id)),
);

router.post(
  '/prep/from-pdn/:id',
  action(async (req) => startPreparation(await contextOf(req), 'PDN', req.params.id)),
);

router.get(
  '/prep/tasks',
  action(async (req, res) => {
    const conditions: any[] = [];
    if (req.query.shipmentId) {
      conditions.push(eq(schema.pickingTasks.shipmentId, req.query.shipmentId));
    }
    if (req.query.status) conditions.push(eq(schema.pickingTasks.status, req.query.status));
    if (req.query.assignedTo) {
      conditions.push(eq(schema.pickingTasks.assignedUserId, req.query.assignedTo));
    }
    if (req.query.docType && req.query.docId) {
      conditions.push(eq(schema.pickingTasks.docType, req.query.docType));
      conditions.push(eq(schema.pickingTasks.docId, req.query.docId));
    }
    const rows = await req.tenantClient
      .select()
      .from(schema.pickingTasks)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(schema.pickingTasks.createdAt));
    res.json(rows);
  }),
);

router.patch(
  '/prep/tasks/:id',
  action(async (req) => updatePickingTask(await contextOf(req), req.params.id, req.body || {})),
);

router.post(
  '/prep/shipments/:id/resync',
  action(async (req) => resyncTasks(await contextOf(req), req.params.id)),
);

router.post(
  '/prep/tasks/:id/assign',
  action(async (req) => {
    await req.tenantClient
      .update(schema.pickingTasks)
      .set({ assignedUserId: req.body?.assignedUserId || null })
      .where(eq(schema.pickingTasks.id, req.params.id));
  }),
);

export default router;
