import { Router } from 'express';
import { asc, eq, sql } from 'drizzle-orm';
import crypto from 'crypto';
import * as schema from '../../db/schema';
import { pick, errorDetail } from './shared';

const router = Router();

const ALLOWED = ['name', 'sortOrder', 'probability', 'kind'];
const KINDS = ['open', 'won', 'lost'];

function validate(payload: Record<string, any>, partial: boolean): string | null {
  if ((!partial || 'name' in payload) && !payload.name?.trim()) return 'El nombre es obligatorio';
  if ('kind' in payload && !KINDS.includes(payload.kind)) return 'Tipo de etapa no válido';
  if ('probability' in payload) {
    const p = Number(payload.probability);
    if (!Number.isInteger(p) || p < 0 || p > 100)
      return 'La probabilidad tiene que estar entre 0 y 100';
  }
  return null;
}

/** GET /api/crm/stages — en el orden del embudo, con el nº de oportunidades de cada una. */
router.get('/', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select({
        stage: schema.opportunityStages,
        count: sql<number>`count(${schema.opportunities.id})::int`,
      })
      .from(schema.opportunityStages)
      .leftJoin(schema.opportunities, eq(schema.opportunities.stageId, schema.opportunityStages.id))
      .groupBy(schema.opportunityStages.id)
      .orderBy(asc(schema.opportunityStages.sortOrder), asc(schema.opportunityStages.name));
    res.json(rows.map((r: any) => ({ ...r.stage, opportunityCount: r.count })));
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const payload = pick(req.body, ALLOWED);
    const err = validate(payload, false);
    if (err) return res.status(400).json({ error: err });
    if (payload.sortOrder === undefined || payload.sortOrder === null) {
      const [{ max }] = await req.tenantClient
        .select({ max: sql<number>`coalesce(max(${schema.opportunityStages.sortOrder}), 0)::int` })
        .from(schema.opportunityStages);
      payload.sortOrder = max + 10;
    }
    const [row] = await req.tenantClient
      .insert(schema.opportunityStages)
      .values({ ...payload, id: crypto.randomUUID() })
      .returning();
    res.json(row);
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

/** PUT /api/crm/stages/order — body { ids: string[] } en el orden nuevo. */
router.put('/order', async (req: any, res) => {
  try {
    const ids: unknown = req.body?.ids;
    if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string'))
      return res.status(400).json({ error: 'Se esperaba una lista de ids' });
    await req.tenantClient.transaction(async (tx: any) => {
      for (const [i, id] of (ids as string[]).entries()) {
        await tx
          .update(schema.opportunityStages)
          .set({ sortOrder: (i + 1) * 10 })
          .where(eq(schema.opportunityStages.id, id));
      }
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

router.patch('/:id', async (req: any, res) => {
  try {
    const patch = pick(req.body, ALLOWED);
    const err = validate(patch, true);
    if (err) return res.status(400).json({ error: err });
    const [row] = await req.tenantClient
      .update(schema.opportunityStages)
      .set(patch)
      .where(eq(schema.opportunityStages.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Etapa no encontrada' });
    res.json(row);
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const [{ count }] = await req.tenantClient
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.opportunities)
      .where(eq(schema.opportunities.stageId, req.params.id));
    if (count > 0)
      return res.status(409).json({
        error: `La etapa tiene ${count} oportunidad(es). Muévelas a otra etapa antes de borrarla.`,
      });
    const [row] = await req.tenantClient
      .delete(schema.opportunityStages)
      .where(eq(schema.opportunityStages.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Etapa no encontrada' });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

export default router;
