import { Router } from 'express';
import { and, eq, asc, gte, lte } from 'drizzle-orm';
import * as schema from '../../db/schema';
import crypto from 'crypto';

const router = Router();

router.get('/', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select()
      .from(schema.shiftPatterns)
      .orderBy(asc(schema.shiftPatterns.name));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const [row] = await req.tenantClient
      .select()
      .from(schema.shiftPatterns)
      .where(eq(schema.shiftPatterns.id, req.params.id));
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    const assigns = await req.tenantClient
      .select()
      .from(schema.shiftPatternAssignments)
      .where(eq(schema.shiftPatternAssignments.patternId, row.id));
    res.json({ ...row, assignments: assigns });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const { name, cycleWeeks, slots } = req.body;
    if (!name) return res.status(400).json({ error: 'name obligatorio' });
    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.shiftPatterns)
      .values({
        id,
        name,
        cycleWeeks: cycleWeeks ?? 1,
        slots: slots ?? [],
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
    const allow = ['name', 'cycleWeeks', 'slots', 'isActive'];
    const patch: Record<string, any> = {};
    for (const k of allow) if (k in req.body) patch[k] = req.body[k];
    const [row] = await req.tenantClient
      .update(schema.shiftPatterns)
      .set(patch)
      .where(eq(schema.shiftPatterns.id, req.params.id))
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
      .update(schema.shiftPatterns)
      .set({ isActive: false })
      .where(eq(schema.shiftPatterns.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /:id/assignments — asignar el patrón a un empleado con offset y vigencia.
 */
router.post('/:id/assignments', async (req: any, res) => {
  try {
    const { employeeId, weekOffset, validFrom, validTo } = req.body;
    if (!employeeId || !validFrom)
      return res.status(400).json({ error: 'employeeId y validFrom obligatorios' });
    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.shiftPatternAssignments)
      .values({
        id,
        patternId: req.params.id,
        employeeId,
        weekOffset: weekOffset ?? 0,
        validFrom,
        validTo: validTo || null,
      })
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:patternId/assignments/:assignId', async (req: any, res) => {
  try {
    await req.tenantClient
      .delete(schema.shiftPatternAssignments)
      .where(eq(schema.shiftPatternAssignments.id, req.params.assignId));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /:id/expand — expande el patrón a ShiftAssignment para un rango.
 * Body: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }.
 *
 * Genera una fila por (empleado asignado × día × slot que coincide). Si la
 * asignación tiene `validFrom`/`validTo`, sólo expande dentro de esa
 * vigencia. Idempotente: borra antes las asignaciones generadas
 * previamente con este patternId en el rango.
 */
router.post('/:id/expand', async (req: any, res) => {
  try {
    const { from, to } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'from y to obligatorios' });

    const [pattern] = await req.tenantClient
      .select()
      .from(schema.shiftPatterns)
      .where(eq(schema.shiftPatterns.id, req.params.id));
    if (!pattern) return res.status(404).json({ error: 'Patrón no encontrado' });

    const assigns = await req.tenantClient
      .select()
      .from(schema.shiftPatternAssignments)
      .where(eq(schema.shiftPatternAssignments.patternId, req.params.id));
    if (assigns.length === 0) return res.json({ created: 0 });

    const templates = await req.tenantClient.select().from(schema.shiftTemplates);
    const tplMap = new Map(templates.map((t: any) => [t.id, t]));

    // Borrado previo de filas antes generadas en el rango (idempotencia).
    await req.tenantClient
      .delete(schema.shiftAssignments)
      .where(
        and(
          eq(schema.shiftAssignments.patternId, req.params.id),
          gte(schema.shiftAssignments.date, from),
          lte(schema.shiftAssignments.date, to),
        ),
      );

    const cycleWeeks = pattern.cycleWeeks || 1;
    const slots = (pattern.slots as any[]) || [];

    const fromDate = new Date(from);
    const toDate = new Date(to);
    const dayMs = 86400000;
    let created = 0;

    for (let d = new Date(fromDate); d <= toDate; d = new Date(d.getTime() + dayMs)) {
      const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay(); // 1=Lun..7=Dom
      const dateStr = d.toISOString().slice(0, 10);
      // Semana absoluta desde la "epoch" — usamos floor de días/7 para
      // tener un índice determinista que combina con weekOffset.
      const absWeek = Math.floor(d.getTime() / (dayMs * 7));

      for (const a of assigns) {
        if (a.validFrom && dateStr < String(a.validFrom)) continue;
        if (a.validTo && dateStr > String(a.validTo)) continue;
        const cycleWeek = (absWeek - (a.weekOffset || 0)) % cycleWeeks;
        const normalizedWeek = ((cycleWeek % cycleWeeks) + cycleWeeks) % cycleWeeks;
        const slot = slots.find((s: any) => s.week === normalizedWeek && s.dayOfWeek === dayOfWeek);
        if (!slot) continue;
        const tpl: any = tplMap.get(slot.shiftTemplateId);
        if (!tpl) continue;
        // Genera 1 ó 2 segmentos según si la plantilla tiene turno partido.
        const segments: Array<{ s: string; e: string }> = [{ s: tpl.startTime, e: tpl.endTime }];
        if (tpl.secondStartTime && tpl.secondEndTime) {
          segments.push({ s: tpl.secondStartTime, e: tpl.secondEndTime });
        }
        for (const seg of segments) {
          const [hS, mS] = String(seg.s).split(':').map(Number);
          const [hE, mE] = String(seg.e).split(':').map(Number);
          const startAt = new Date(d);
          startAt.setHours(hS, mS, 0, 0);
          const endAt = new Date(d);
          endAt.setHours(hE, mE, 0, 0);
          if (endAt <= startAt) endAt.setDate(endAt.getDate() + 1);
          await req.tenantClient.insert(schema.shiftAssignments).values({
            id: crypto.randomUUID(),
            employeeId: a.employeeId,
            date: dateStr,
            startAt,
            endAt,
            // breakMinutes solo en el primer segmento; el segundo es post-pausa
            breakMinutes: segments.length > 1 ? 0 : tpl.breakMinutes || 0,
            shiftTemplateId: tpl.id,
            patternId: pattern.id,
            status: 'scheduled',
          });
          created++;
        }
      }
    }

    res.json({ created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
