import { Router } from 'express';
import { and, eq, asc, gte, lte } from 'drizzle-orm';
import * as schema from '../../db/schema';
import crypto from 'crypto';

const router = Router();

router.get('/', async (req: any, res) => {
  try {
    const { employeeId, from, to } = req.query;
    const conds: any[] = [];
    if (employeeId) conds.push(eq(schema.shiftAssignments.employeeId, String(employeeId)));
    if (from) conds.push(gte(schema.shiftAssignments.date, String(from)));
    if (to) conds.push(lte(schema.shiftAssignments.date, String(to)));
    const rows = await req.tenantClient
      .select()
      .from(schema.shiftAssignments)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(schema.shiftAssignments.date), asc(schema.shiftAssignments.startAt));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const { employeeId, date, startAt, endAt, shiftTemplateId, breakMinutes, notes } = req.body;
    if (!employeeId || !date || !startAt || !endAt)
      return res.status(400).json({ error: 'employeeId, date, startAt y endAt son obligatorios' });
    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.shiftAssignments)
      .values({
        id,
        employeeId,
        date,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        breakMinutes: breakMinutes ?? 0,
        shiftTemplateId: shiftTemplateId || null,
        status: 'scheduled',
        notes: notes || null,
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
      'date',
      'startAt',
      'endAt',
      'breakMinutes',
      'shiftTemplateId',
      'status',
      'notes',
    ];
    const patch: Record<string, any> = {};
    for (const k of allow) if (k in req.body) patch[k] = req.body[k];
    if (patch.startAt) patch.startAt = new Date(patch.startAt);
    if (patch.endAt) patch.endAt = new Date(patch.endAt);
    const [row] = await req.tenantClient
      .update(schema.shiftAssignments)
      .set(patch)
      .where(eq(schema.shiftAssignments.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    await req.tenantClient
      .delete(schema.shiftAssignments)
      .where(eq(schema.shiftAssignments.id, req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
