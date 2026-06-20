/**
 * CRUD de automatizaciones por tenant + endpoint de ejecución manual
 * + listado de ejecuciones (logs).
 */
import { Router } from 'express';
import { and, eq, desc } from 'drizzle-orm';
import crypto from 'crypto';
import { ClientFactory } from '../core/tenant/ClientFactory';
import * as schema from '../db/schema';
import { AutomationRunner } from '../core/automations/AutomationRunner';
import { logAudit } from '../utils/audit';

const router = Router();

function requireAdmin(req: any, res: any, next: any) {
  const role = req.user?.role;
  if (role !== 'ADMIN' && role !== 'SUPERUSER') {
    return res.status(403).json({ error: 'Requiere ADMIN o SUPERUSER.' });
  }
  next();
}
router.use(requireAdmin);

const VALID_TRIGGERS = new Set(['schedule', 'event', 'manual']);
const VALID_ACTIONS = new Set(['email', 'webhook', 'notification']);

async function ensureTenant(req: any) {
  const db = ClientFactory.getClient('public');
  const tenantId = req.tenantId;
  if (!tenantId) throw new Error('Falta tenant.');
  return { db, tenantId };
}

// ── GET / ─────────────────────────────────────────────────────
router.get('/', async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    const rows = await db
      .select()
      .from(schema.automations)
      .where(eq(schema.automations.tenantId, tenantId))
      .orderBy(desc(schema.automations.updatedAt));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST / ────────────────────────────────────────────────────
router.post('/', async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ error: 'name requerido' });
    if (!VALID_TRIGGERS.has(body.triggerType))
      return res.status(400).json({ error: `triggerType inválido` });
    if (!VALID_ACTIONS.has(body.actionType))
      return res.status(400).json({ error: `actionType inválido` });

    const id = crypto.randomUUID();
    await db.insert(schema.automations).values({
      id,
      tenantId,
      name: body.name,
      description: body.description || null,
      enabled: body.enabled !== false,
      triggerType: body.triggerType,
      triggerConfig: body.triggerConfig || {},
      actionType: body.actionType,
      actionConfig: body.actionConfig || {},
    });
    logAudit({
      tenantClient: db,
      tenantId,
      userId: req.user?.id,
      entityType: 'Automation',
      entityId: id,
      action: 'CREATE',
      newValue: body,
    });
    res.json({ id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /:id ─────────────────────────────────────────────────
router.patch('/:id', async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    const body = req.body || {};
    const patch: any = {};
    for (const k of [
      'name',
      'description',
      'enabled',
      'triggerType',
      'triggerConfig',
      'actionType',
      'actionConfig',
    ]) {
      if (k in body) patch[k] = body[k];
    }
    patch.updatedAt = new Date();
    if (patch.triggerType && !VALID_TRIGGERS.has(patch.triggerType))
      return res.status(400).json({ error: 'triggerType inválido' });
    if (patch.actionType && !VALID_ACTIONS.has(patch.actionType))
      return res.status(400).json({ error: 'actionType inválido' });

    await db
      .update(schema.automations)
      .set(patch)
      .where(
        and(eq(schema.automations.id, req.params.id), eq(schema.automations.tenantId, tenantId)),
      );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /:id ────────────────────────────────────────────────
router.delete('/:id', async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    await db
      .delete(schema.automations)
      .where(
        and(eq(schema.automations.id, req.params.id), eq(schema.automations.tenantId, tenantId)),
      );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:id/run ──────────────────────────────────────────────
router.post('/:id/run', async (req: any, res) => {
  try {
    const { tenantId } = await ensureTenant(req);
    const result = await AutomationRunner.runNow(req.params.id, tenantId, req.body?.context || {});
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /:id/runs — logs ───────────────────────────────────────
router.get('/:id/runs', async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    const rows = await db
      .select()
      .from(schema.automationRuns)
      .where(
        and(
          eq(schema.automationRuns.automationId, req.params.id),
          eq(schema.automationRuns.tenantId, tenantId),
        ),
      )
      .orderBy(desc(schema.automationRuns.startedAt))
      .limit(100);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
