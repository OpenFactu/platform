import { Router } from 'express';
import { and, asc, desc, eq } from 'drizzle-orm';
import crypto from 'crypto';
import * as schema from '../../db/schema';
import { logAudit } from '../../utils/audit';
import { pick, errorDetail } from './shared';

const router = Router();

const ALLOWED = [
  'title',
  'partnerId',
  'contactId',
  'stageId',
  'amount',
  'expectedCloseDate',
  'ownerUserId',
  'notes',
];

async function findStage(tenantClient: any, stageId: string) {
  const [stage] = await tenantClient
    .select()
    .from(schema.opportunityStages)
    .where(eq(schema.opportunityStages.id, stageId));
  return stage;
}

/** closedAt sigue a la etapa: se fija al entrar en ganada/perdida y se limpia al reabrir. */
function closedAtFor(stage: any, current: Date | null): Date | null {
  if (stage.kind === 'open') return null;
  return current ?? new Date();
}

/** Select con interlocutor, contacto y etapa ya resueltos. */
function selectJoined(tenantClient: any) {
  return tenantClient
    .select({
      opportunity: schema.opportunities,
      partnerName: schema.businessPartners.name,
      contactName: schema.contacts.name,
      stageName: schema.opportunityStages.name,
      stageKind: schema.opportunityStages.kind,
      stageProbability: schema.opportunityStages.probability,
    })
    .from(schema.opportunities)
    .innerJoin(
      schema.businessPartners,
      eq(schema.opportunities.partnerId, schema.businessPartners.id),
    )
    .innerJoin(
      schema.opportunityStages,
      eq(schema.opportunities.stageId, schema.opportunityStages.id),
    )
    .leftJoin(schema.contacts, eq(schema.opportunities.contactId, schema.contacts.id));
}

function flatten(r: any) {
  const { opportunity, ...rest } = r;
  return { ...opportunity, ...rest };
}

/** GET /api/crm/opportunities?partnerId=&stageId= */
router.get('/', async (req: any, res) => {
  try {
    const { partnerId, stageId } = req.query;
    const conds: any[] = [];
    if (partnerId) conds.push(eq(schema.opportunities.partnerId, String(partnerId)));
    if (stageId) conds.push(eq(schema.opportunities.stageId, String(stageId)));
    const rows = await selectJoined(req.tenantClient)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(schema.opportunities.expectedCloseDate), desc(schema.opportunities.createdAt));
    res.json(rows.map(flatten));
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const [row] = await selectJoined(req.tenantClient).where(
      eq(schema.opportunities.id, req.params.id),
    );
    if (!row) return res.status(404).json({ error: 'Oportunidad no encontrada' });
    res.json(flatten(row));
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const payload = pick(req.body, ALLOWED);
    if (!payload.title?.trim()) return res.status(400).json({ error: 'El título es obligatorio' });
    if (!payload.partnerId)
      return res.status(400).json({ error: 'El interlocutor es obligatorio' });
    if (!payload.stageId) {
      const [first] = await req.tenantClient
        .select()
        .from(schema.opportunityStages)
        .where(eq(schema.opportunityStages.kind, 'open'))
        .orderBy(asc(schema.opportunityStages.sortOrder))
        .limit(1);
      if (!first) return res.status(400).json({ error: 'No hay ninguna etapa abierta' });
      payload.stageId = first.id;
    }
    const stage = await findStage(req.tenantClient, payload.stageId);
    if (!stage) return res.status(400).json({ error: 'Etapa no encontrada' });
    if (payload.amount === null) payload.amount = '0';

    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.opportunities)
      .values({
        ...payload,
        id,
        ownerUserId: payload.ownerUserId ?? req.user?.id ?? null,
        closedAt: closedAtFor(stage, null),
      })
      .returning();
    res.json(row);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'Opportunity',
      entityId: id,
      action: 'CREATE',
      newValue: row,
    });
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

router.patch('/:id', async (req: any, res) => {
  const { id } = req.params;
  try {
    const [old] = await req.tenantClient
      .select()
      .from(schema.opportunities)
      .where(eq(schema.opportunities.id, id));
    if (!old) return res.status(404).json({ error: 'Oportunidad no encontrada' });
    const patch = pick(req.body, ALLOWED);
    if ('title' in patch && !patch.title?.trim())
      return res.status(400).json({ error: 'El título es obligatorio' });
    if ('partnerId' in patch && !patch.partnerId)
      return res.status(400).json({ error: 'El interlocutor es obligatorio' });
    if ('amount' in patch && patch.amount === null) patch.amount = '0';
    if (patch.stageId && patch.stageId !== old.stageId) {
      const stage = await findStage(req.tenantClient, patch.stageId);
      if (!stage) return res.status(400).json({ error: 'Etapa no encontrada' });
      patch.closedAt = closedAtFor(stage, old.closedAt);
    } else {
      delete patch.stageId;
    }
    const [row] = await req.tenantClient
      .update(schema.opportunities)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.opportunities.id, id))
      .returning();
    res.json(row);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'Opportunity',
      entityId: id,
      action: 'UPDATE',
      oldValue: old,
      newValue: row,
    });
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

router.delete('/:id', async (req: any, res) => {
  const { id } = req.params;
  try {
    const [old] = await req.tenantClient
      .delete(schema.opportunities)
      .where(eq(schema.opportunities.id, id))
      .returning();
    if (!old) return res.status(404).json({ error: 'Oportunidad no encontrada' });
    res.json({ success: true });
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'Opportunity',
      entityId: id,
      action: 'DELETE',
      oldValue: old,
    });
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

export default router;
