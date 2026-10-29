import { Router } from 'express';
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import crypto from 'crypto';
import * as schema from '../../db/schema';
import { pick, errorDetail } from './shared';
import { emitCrmEvent } from '../../core/crm/events';

const router = Router();

const ALLOWED = [
  'type',
  'subject',
  'body',
  'partnerId',
  'contactId',
  'opportunityId',
  'dueAt',
  'ownerUserId',
];
const DATE_KEYS = ['dueAt'];
const TYPES = ['call', 'meeting', 'email', 'note', 'task'];

/**
 * GET /api/crm/activities?partnerId=&opportunityId=&contactId=&status=pending|done
 * Pendientes por fecha de vencimiento (las sin fecha al final); hechas, las más recientes primero.
 */
router.get('/', async (req: any, res) => {
  try {
    const { partnerId, opportunityId, contactId, status, ownerUserId } = req.query;
    const a = schema.crmActivities;
    const conds: any[] = [];
    if (partnerId) conds.push(eq(a.partnerId, String(partnerId)));
    if (opportunityId) conds.push(eq(a.opportunityId, String(opportunityId)));
    if (contactId) conds.push(eq(a.contactId, String(contactId)));
    if (ownerUserId) conds.push(eq(a.ownerUserId, String(ownerUserId)));
    if (status === 'pending') conds.push(isNull(a.doneAt));
    if (status === 'done') conds.push(isNotNull(a.doneAt));
    const rows = await req.tenantClient
      .select({
        activity: a,
        partnerName: schema.businessPartners.name,
        contactName: schema.contacts.name,
        opportunityTitle: schema.opportunities.title,
      })
      .from(a)
      .leftJoin(schema.businessPartners, eq(a.partnerId, schema.businessPartners.id))
      .leftJoin(schema.contacts, eq(a.contactId, schema.contacts.id))
      .leftJoin(schema.opportunities, eq(a.opportunityId, schema.opportunities.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(
        sql`${a.doneAt} IS NOT NULL`,
        asc(sql`coalesce(${a.dueAt}, 'infinity'::timestamp)`),
        desc(a.doneAt),
        desc(a.createdAt),
      );
    res.json(rows.map(({ activity, ...rest }: any) => ({ ...activity, ...rest })));
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const payload = pick(req.body, ALLOWED, DATE_KEYS);
    if (!TYPES.includes(payload.type))
      return res.status(400).json({ error: 'Tipo de actividad no válido' });
    if (!payload.subject?.trim())
      return res.status(400).json({ error: 'El asunto es obligatorio' });
    if (!payload.partnerId && !payload.contactId && !payload.opportunityId)
      return res.status(400).json({
        error: 'La actividad tiene que ir ligada a un interlocutor, contacto u oportunidad',
      });

    // Si viene de una oportunidad o de un contacto, heredar el interlocutor para que
    // salga también en su ficha.
    if (!payload.partnerId && payload.opportunityId) {
      const [opp] = await req.tenantClient
        .select({ partnerId: schema.opportunities.partnerId })
        .from(schema.opportunities)
        .where(eq(schema.opportunities.id, payload.opportunityId));
      payload.partnerId = opp?.partnerId ?? null;
    }
    if (!payload.partnerId && payload.contactId) {
      const [c] = await req.tenantClient
        .select({ partnerId: schema.contacts.partnerId })
        .from(schema.contacts)
        .where(eq(schema.contacts.id, payload.contactId));
      payload.partnerId = c?.partnerId ?? null;
    }

    const done = req.body?.done === true;
    const [row] = await req.tenantClient
      .insert(schema.crmActivities)
      .values({
        ...payload,
        id: crypto.randomUUID(),
        ownerUserId: payload.ownerUserId ?? req.user?.id ?? null,
        doneAt: done ? new Date() : null,
      })
      .returning();
    if (row.opportunityId)
      await req.tenantClient
        .update(schema.opportunities)
        .set({ lastActivityAt: new Date() })
        .where(eq(schema.opportunities.id, row.opportunityId));
    res.json(row);
    emitCrmEvent(
      'crm.activity.created',
      { tenantId: req.tenantId, db: req.tenantClient, user: req.user },
      row,
    );
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

router.patch('/:id', async (req: any, res) => {
  try {
    const patch: Record<string, any> = pick(req.body, ALLOWED, DATE_KEYS);
    if ('type' in patch && !TYPES.includes(patch.type))
      return res.status(400).json({ error: 'Tipo de actividad no válido' });
    if ('subject' in patch && !patch.subject?.trim())
      return res.status(400).json({ error: 'El asunto es obligatorio' });
    if (typeof req.body?.done === 'boolean') patch.doneAt = req.body.done ? new Date() : null;
    const [row] = await req.tenantClient
      .update(schema.crmActivities)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.crmActivities.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Actividad no encontrada' });
    res.json(row);
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const [row] = await req.tenantClient
      .delete(schema.crmActivities)
      .where(eq(schema.crmActivities.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Actividad no encontrada' });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

export default router;
