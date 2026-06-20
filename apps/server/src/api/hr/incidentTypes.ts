import { Router } from 'express';
import { eq, asc } from 'drizzle-orm';
import * as schema from '../../db/schema';
import crypto from 'crypto';

const router = Router();

router.get('/', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select()
      .from(schema.incidentTypes)
      .orderBy(asc(schema.incidentTypes.code));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const { code, name } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'code y name son obligatorios' });
    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.incidentTypes)
      .values({
        id,
        code,
        name,
        requiresSubstitution: req.body.requiresSubstitution ?? false,
        affectsPayroll: req.body.affectsPayroll ?? false,
        consumesLeaveBalance: req.body.consumesLeaveBalance ?? false,
        requiresDocument: req.body.requiresDocument ?? false,
        paid: req.body.paid ?? true,
        color: req.body.color || null,
        isActive: req.body.isActive ?? true,
      })
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req: any, res) => {
  try {
    const allow = [
      'code',
      'name',
      'requiresSubstitution',
      'affectsPayroll',
      'consumesLeaveBalance',
      'requiresDocument',
      'paid',
      'color',
      'isActive',
    ];
    const patch: Record<string, any> = {};
    for (const k of allow) if (k in req.body) patch[k] = req.body[k];
    const [row] = await req.tenantClient
      .update(schema.incidentTypes)
      .set(patch)
      .where(eq(schema.incidentTypes.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const [row] = await req.tenantClient
      .update(schema.incidentTypes)
      .set({ isActive: false })
      .where(eq(schema.incidentTypes.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
