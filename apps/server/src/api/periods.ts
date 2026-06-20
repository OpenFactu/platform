import { Router } from 'express';
import { eq, asc } from 'drizzle-orm';
import * as schema from '../db/schema';
import crypto from 'crypto';
import { logAudit } from '../utils/audit';
import { PeriodCloseEngine } from '../core/accounting/PeriodCloseEngine';

const router = Router();

router.get('/', async (req: any, res) => {
  try {
    const periods = await req.tenantClient
      .select()
      .from(schema.accountingPeriods)
      .orderBy(asc(schema.accountingPeriods.code));
    res.json(periods);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const id = crypto.randomUUID();
    const payload = { ...req.body };
    if (payload.startDate) payload.startDate = new Date(payload.startDate);
    if (payload.endDate) payload.endDate = new Date(payload.endDate);
    const [period] = await req.tenantClient
      .insert(schema.accountingPeriods)
      .values({ ...payload, id })
      .returning();
    res.json(period);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'AccountingPeriod',
      entityId: id,
      action: 'CREATE',
      newValue: period,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', async (req: any, res) => {
  const { id } = req.params;
  try {
    const [old] = await req.tenantClient
      .select()
      .from(schema.accountingPeriods)
      .where(eq(schema.accountingPeriods.id, id));
    const payload = { ...req.body };
    if (payload.startDate) payload.startDate = new Date(payload.startDate);
    if (payload.endDate) payload.endDate = new Date(payload.endDate);
    const [period] = await req.tenantClient
      .update(schema.accountingPeriods)
      .set(payload)
      .where(eq(schema.accountingPeriods.id, id))
      .returning();
    res.json(period);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'AccountingPeriod',
      entityId: id,
      action: 'UPDATE',
      oldValue: old,
      newValue: period,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req: any, res) => {
  const { id } = req.params;
  try {
    const [old] = await req.tenantClient
      .select()
      .from(schema.accountingPeriods)
      .where(eq(schema.accountingPeriods.id, id));
    await req.tenantClient
      .delete(schema.accountingPeriods)
      .where(eq(schema.accountingPeriods.id, id));
    res.json({ success: true });
    if (old)
      logAudit({
        tenantClient: req.tenantClient,
        tenantId: req.tenantId || '',
        userId: req.user?.id,
        entityType: 'AccountingPeriod',
        entityId: id,
        action: 'DELETE',
        oldValue: old,
      });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/periods/:id/close-preview — devuelve qué generaría el cierre
 * (asiento de regularización + apertura) sin ejecutarlo. Sirve para que
 * la UI muestre un preview antes de que el admin confirme.
 */
router.get('/:id/close-preview', async (req: any, res) => {
  try {
    const preview = await PeriodCloseEngine.preview(req.tenantClient, req.params.id);
    res.json(preview);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/periods/:id/close — ejecuta el cierre: genera asiento de
 * regularización, marca período como cerrado, crea siguiente período y
 * asiento de apertura.
 */
router.post('/:id/close', async (req: any, res) => {
  try {
    const result = await PeriodCloseEngine.close(req.tenantClient, req.params.id, req.user?.id);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'AccountingPeriod',
      entityId: req.params.id,
      action: 'CLOSE',
      newValue: result,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
