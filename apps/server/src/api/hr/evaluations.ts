import { Router } from 'express';
import { and, eq, asc } from 'drizzle-orm';
import * as schema from '../../db/schema';
import crypto from 'crypto';

const router = Router();

// ── Ciclos ─────────────────────────────────────────────────────────
router.get('/cycles', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select()
      .from(schema.evaluationCycles)
      .orderBy(asc(schema.evaluationCycles.startDate));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/cycles', async (req: any, res) => {
  try {
    const { name, startDate, endDate, status, notes } = req.body;
    if (!name || !startDate || !endDate) {
      return res.status(400).json({ error: 'name, startDate y endDate son obligatorios' });
    }
    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.evaluationCycles)
      .values({ id, name, startDate, endDate, status: status || 'draft', notes: notes || null })
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/cycles/:id', async (req: any, res) => {
  try {
    const allow = ['name', 'startDate', 'endDate', 'status', 'notes'];
    const patch: any = {};
    for (const k of allow) if (k in req.body) patch[k] = req.body[k];
    const [row] = await req.tenantClient
      .update(schema.evaluationCycles)
      .set(patch)
      .where(eq(schema.evaluationCycles.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Ciclo no encontrado' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/cycles/:id', async (req: any, res) => {
  try {
    await req.tenantClient
      .delete(schema.evaluationCycles)
      .where(eq(schema.evaluationCycles.id, req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Competencias (catálogo reutilizable) ──────────────────────────
router.get('/competencies', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select()
      .from(schema.evaluationCompetencies)
      .orderBy(asc(schema.evaluationCompetencies.code));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/competencies', async (req: any, res) => {
  try {
    const { code, name, description, weight, scaleMax, isActive } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'code y name obligatorios' });
    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.evaluationCompetencies)
      .values({
        id,
        code,
        name,
        description: description || null,
        weight: weight != null ? String(weight) : '1',
        scaleMax: scaleMax || 5,
        isActive: isActive ?? true,
      })
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/competencies/:id', async (req: any, res) => {
  try {
    const allow = ['code', 'name', 'description', 'weight', 'scaleMax', 'isActive'];
    const patch: any = {};
    for (const k of allow) if (k in req.body) patch[k] = req.body[k];
    if ('weight' in patch) patch.weight = String(patch.weight);
    const [row] = await req.tenantClient
      .update(schema.evaluationCompetencies)
      .set(patch)
      .where(eq(schema.evaluationCompetencies.id, req.params.id))
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/competencies/:id', async (req: any, res) => {
  try {
    await req.tenantClient
      .delete(schema.evaluationCompetencies)
      .where(eq(schema.evaluationCompetencies.id, req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Evaluaciones (un empleado en un ciclo) ────────────────────────
router.get('/', async (req: any, res) => {
  try {
    const { cycleId, employeeId } = req.query;
    const conds: any[] = [];
    if (cycleId) conds.push(eq(schema.employeeEvaluations.cycleId, String(cycleId)));
    if (employeeId) conds.push(eq(schema.employeeEvaluations.employeeId, String(employeeId)));
    const rows = await req.tenantClient
      .select()
      .from(schema.employeeEvaluations)
      .where(conds.length ? and(...conds) : undefined);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const [row] = await req.tenantClient
      .select()
      .from(schema.employeeEvaluations)
      .where(eq(schema.employeeEvaluations.id, req.params.id));
    if (!row) return res.status(404).json({ error: 'Evaluación no encontrada' });
    const scores = await req.tenantClient
      .select()
      .from(schema.employeeEvaluationScores)
      .where(eq(schema.employeeEvaluationScores.evaluationId, row.id));
    res.json({ ...row, scores });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const { cycleId, employeeId, managerId, notes } = req.body;
    if (!cycleId || !employeeId) {
      return res.status(400).json({ error: 'cycleId y employeeId son obligatorios' });
    }
    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.employeeEvaluations)
      .values({ id, cycleId, employeeId, managerId: managerId || null, notes: notes || null })
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req: any, res) => {
  try {
    const allow = ['managerId', 'status', 'selfReviewedAt', 'managerReviewedAt', 'notes'];
    const patch: any = {};
    for (const k of allow) if (k in req.body) patch[k] = req.body[k];
    const [row] = await req.tenantClient
      .update(schema.employeeEvaluations)
      .set(patch)
      .where(eq(schema.employeeEvaluations.id, req.params.id))
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    await req.tenantClient
      .delete(schema.employeeEvaluations)
      .where(eq(schema.employeeEvaluations.id, req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/scores — sobreescribe la matriz de competencias.
router.put('/:id/scores', async (req: any, res) => {
  try {
    const { scores } = req.body as {
      scores: Array<{
        competencyId: string;
        scoreSelf?: number;
        scoreManager?: number;
        comments?: string;
      }>;
    };
    if (!Array.isArray(scores)) return res.status(400).json({ error: 'scores debe ser array' });
    await req.tenantClient
      .delete(schema.employeeEvaluationScores)
      .where(eq(schema.employeeEvaluationScores.evaluationId, req.params.id));
    for (const s of scores) {
      await req.tenantClient.insert(schema.employeeEvaluationScores).values({
        id: crypto.randomUUID(),
        evaluationId: req.params.id,
        competencyId: s.competencyId,
        scoreSelf: s.scoreSelf != null ? String(s.scoreSelf) : null,
        scoreManager: s.scoreManager != null ? String(s.scoreManager) : null,
        comments: s.comments || null,
      });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/close — calcula finalScore = Σ(scoreManager*weight)/Σweight.
router.post('/:id/close', async (req: any, res) => {
  try {
    const scores = await req.tenantClient
      .select()
      .from(schema.employeeEvaluationScores)
      .where(eq(schema.employeeEvaluationScores.evaluationId, req.params.id));
    if (!scores.length) return res.status(400).json({ error: 'No hay puntuaciones' });
    const competencyIds = scores.map((s: any) => s.competencyId);
    const comps = await req.tenantClient.select().from(schema.evaluationCompetencies);
    const compById = new Map(comps.map((c: any) => [c.id, c]));
    let weighted = 0;
    let weights = 0;
    for (const s of scores) {
      const c: any = compById.get(s.competencyId);
      const w = Number(c?.weight || 1);
      const score = Number(s.scoreManager ?? s.scoreSelf ?? 0);
      weighted += score * w;
      weights += w;
    }
    const final = weights > 0 ? weighted / weights : 0;
    const [row] = await req.tenantClient
      .update(schema.employeeEvaluations)
      .set({ finalScore: String(final.toFixed(2)), status: 'closed' })
      .where(eq(schema.employeeEvaluations.id, req.params.id))
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Objetivos SMART ───────────────────────────────────────────────
router.get('/objectives/list', async (req: any, res) => {
  try {
    const { employeeId, cycleId, status } = req.query;
    const conds: any[] = [];
    if (employeeId) conds.push(eq(schema.employeeObjectives.employeeId, String(employeeId)));
    if (cycleId) conds.push(eq(schema.employeeObjectives.cycleId, String(cycleId)));
    if (status) conds.push(eq(schema.employeeObjectives.status, String(status)));
    const rows = await req.tenantClient
      .select()
      .from(schema.employeeObjectives)
      .where(conds.length ? and(...conds) : undefined);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/objectives', async (req: any, res) => {
  try {
    const { employeeId, title, ...rest } = req.body;
    if (!employeeId || !title) {
      return res.status(400).json({ error: 'employeeId y title obligatorios' });
    }
    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.employeeObjectives)
      .values({
        id,
        employeeId,
        title,
        cycleId: rest.cycleId || null,
        description: rest.description || null,
        targetMetric: rest.targetMetric || null,
        targetValue: rest.targetValue != null ? String(rest.targetValue) : null,
        achievedValue: rest.achievedValue != null ? String(rest.achievedValue) : null,
        weight: rest.weight != null ? String(rest.weight) : '1',
        status: rest.status || 'pending',
        dueDate: rest.dueDate || null,
      })
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/objectives/:id', async (req: any, res) => {
  try {
    const allow = [
      'title',
      'description',
      'targetMetric',
      'targetValue',
      'achievedValue',
      'weight',
      'status',
      'dueDate',
      'cycleId',
    ];
    const patch: any = {};
    for (const k of allow) if (k in req.body) patch[k] = req.body[k];
    for (const num of ['targetValue', 'achievedValue', 'weight']) {
      if (num in patch && patch[num] != null) patch[num] = String(patch[num]);
    }
    const [row] = await req.tenantClient
      .update(schema.employeeObjectives)
      .set(patch)
      .where(eq(schema.employeeObjectives.id, req.params.id))
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/objectives/:id', async (req: any, res) => {
  try {
    await req.tenantClient
      .delete(schema.employeeObjectives)
      .where(eq(schema.employeeObjectives.id, req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
