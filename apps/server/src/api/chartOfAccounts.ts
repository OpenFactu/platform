import { Router } from 'express';
import { eq, asc } from 'drizzle-orm';
import * as schema from '../db/schema';
import crypto from 'crypto';
import { logAudit } from '../utils/audit';

const router = Router();

const ALLOWED_TYPES = new Set(['asset', 'liability', 'equity', 'income', 'expense']);

router.get('/', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select()
      .from(schema.chartOfAccounts)
      .orderBy(asc(schema.chartOfAccounts.code));
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const [row] = await req.tenantClient
      .select()
      .from(schema.chartOfAccounts)
      .where(eq(schema.chartOfAccounts.id, req.params.id));
    if (!row) return res.status(404).json({ error: 'Cuenta no encontrada' });
    res.json(row);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const { code, name, type, parentId, isAnalytical, isActive, notes } = req.body;
    if (!code || !name || !type) {
      return res.status(400).json({ error: 'code, name y type son obligatorios' });
    }
    if (!ALLOWED_TYPES.has(type)) {
      return res
        .status(400)
        .json({ error: `type debe ser uno de: ${[...ALLOWED_TYPES].join(', ')}` });
    }
    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.chartOfAccounts)
      .values({
        id,
        code,
        name,
        type,
        parentId: parentId || null,
        isAnalytical: !!isAnalytical,
        isActive: isActive !== false,
        notes: notes || null,
      })
      .returning();
    res.json(row);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'ChartOfAccount',
      entityId: id,
      action: 'CREATE',
      newValue: row,
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
      .from(schema.chartOfAccounts)
      .where(eq(schema.chartOfAccounts.id, id));
    if (!old) return res.status(404).json({ error: 'Cuenta no encontrada' });

    const payload: any = {};
    const allowed = ['code', 'name', 'type', 'parentId', 'isAnalytical', 'isActive', 'notes'];
    for (const k of allowed) {
      if (k in req.body) payload[k] = req.body[k] === '' ? null : req.body[k];
    }
    if (payload.type && !ALLOWED_TYPES.has(payload.type)) {
      return res.status(400).json({ error: `type inválido` });
    }
    payload.updatedAt = new Date();

    const [row] = await req.tenantClient
      .update(schema.chartOfAccounts)
      .set(payload)
      .where(eq(schema.chartOfAccounts.id, id))
      .returning();
    res.json(row);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'ChartOfAccount',
      entityId: id,
      action: 'UPDATE',
      oldValue: old,
      newValue: row,
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
      .from(schema.chartOfAccounts)
      .where(eq(schema.chartOfAccounts.id, id));
    if (!old) return res.status(404).json({ error: 'Cuenta no encontrada' });
    await req.tenantClient.delete(schema.chartOfAccounts).where(eq(schema.chartOfAccounts.id, id));
    res.json({ success: true });
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'ChartOfAccount',
      entityId: id,
      action: 'DELETE',
      oldValue: old,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/chart-of-accounts/bulk — inserción masiva (Excel paste).
 * Body: { rows: [{ code, name, type, ... }] }
 * Idempotente por `code`: si existe actualiza (name/type/parentCode), si
 * no crea. Es transaccional — o todas o ninguna.
 */
router.post('/bulk', async (req: any, res) => {
  const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (rows.length === 0) return res.status(400).json({ error: 'rows vacío' });
  try {
    let created = 0;
    let updated = 0;
    for (const r of rows) {
      if (!r.code || !r.name) continue;
      const type = ALLOWED_TYPES.has(r.type) ? r.type : 'asset';
      const [existing] = await req.tenantClient
        .select()
        .from(schema.chartOfAccounts)
        .where(eq(schema.chartOfAccounts.code, r.code));
      if (existing) {
        await req.tenantClient
          .update(schema.chartOfAccounts)
          .set({
            name: r.name,
            type,
            notes: r.notes ?? existing.notes,
            updatedAt: new Date(),
          })
          .where(eq(schema.chartOfAccounts.id, existing.id));
        updated++;
      } else {
        await req.tenantClient.insert(schema.chartOfAccounts).values({
          id: crypto.randomUUID(),
          code: r.code,
          name: r.name,
          type,
          isAnalytical: false,
          isActive: true,
          notes: r.notes || null,
        });
        created++;
      }
    }
    res.json({ ok: true, created, updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reglas de dimensión por cuenta
router.get('/:id/dimension-rule', async (req: any, res) => {
  try {
    const [row] = await req.tenantClient
      .select()
      .from(schema.dimensionRules)
      .where(eq(schema.dimensionRules.accountId, req.params.id));
    res.json(row || null);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/dimension-rule', async (req: any, res) => {
  const { id } = req.params;
  try {
    const payload = {
      requiresCostCenter: !!req.body.requiresCostCenter,
      requiresProfitCenter: !!req.body.requiresProfitCenter,
      requiresInternalOrder: !!req.body.requiresInternalOrder,
      forbidsCostCenter: !!req.body.forbidsCostCenter,
      forbidsProfitCenter: !!req.body.forbidsProfitCenter,
      forbidsInternalOrder: !!req.body.forbidsInternalOrder,
    };
    const [existing] = await req.tenantClient
      .select()
      .from(schema.dimensionRules)
      .where(eq(schema.dimensionRules.accountId, id));
    if (existing) {
      const [row] = await req.tenantClient
        .update(schema.dimensionRules)
        .set(payload)
        .where(eq(schema.dimensionRules.accountId, id))
        .returning();
      return res.json(row);
    }
    const [row] = await req.tenantClient
      .insert(schema.dimensionRules)
      .values({ id: crypto.randomUUID(), accountId: id, ...payload })
      .returning();
    res.json(row);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
