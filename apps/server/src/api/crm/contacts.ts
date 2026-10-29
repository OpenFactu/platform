import { Router } from 'express';
import { and, asc, eq, ne } from 'drizzle-orm';
import crypto from 'crypto';
import * as schema from '../../db/schema';
import { logAudit } from '../../utils/audit';
import { pick, errorDetail, normalizeTags } from './shared';

const router = Router();

const ALLOWED = [
  'partnerId',
  'name',
  'role',
  'email',
  'phone',
  'mobile',
  'isMain',
  'notes',
  'tags',
];

/** Solo puede haber un contacto principal por interlocutor. */
async function clearOtherMain(tenantClient: any, partnerId: string, keepId: string) {
  await tenantClient
    .update(schema.contacts)
    .set({ isMain: false })
    .where(and(eq(schema.contacts.partnerId, partnerId), ne(schema.contacts.id, keepId)));
}

/**
 * GET /api/crm/contacts?partnerId=
 * Devuelve los contactos con el nombre del interlocutor.
 */
router.get('/', async (req: any, res) => {
  try {
    const { partnerId } = req.query;
    const rows = await req.tenantClient
      .select({
        contact: schema.contacts,
        partnerName: schema.businessPartners.name,
      })
      .from(schema.contacts)
      .innerJoin(schema.businessPartners, eq(schema.contacts.partnerId, schema.businessPartners.id))
      .where(partnerId ? eq(schema.contacts.partnerId, String(partnerId)) : undefined)
      .orderBy(asc(schema.contacts.name));
    res.json(rows.map((r: any) => ({ ...r.contact, partnerName: r.partnerName })));
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const payload = pick(req.body, ALLOWED);
    if ('tags' in payload) payload.tags = normalizeTags(payload.tags);
    if (!payload.partnerId)
      return res.status(400).json({ error: 'El interlocutor es obligatorio' });
    if (!payload.name?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const id = crypto.randomUUID();
    const [row] = await req.tenantClient
      .insert(schema.contacts)
      .values({ ...payload, id })
      .returning();
    if (row.isMain) await clearOtherMain(req.tenantClient, row.partnerId, id);
    res.json(row);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'Contact',
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
      .from(schema.contacts)
      .where(eq(schema.contacts.id, id));
    if (!old) return res.status(404).json({ error: 'Contacto no encontrado' });
    const patch = pick(req.body, ALLOWED);
    if ('tags' in patch) patch.tags = normalizeTags(patch.tags);
    if ('name' in patch && !patch.name?.trim())
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    const [row] = await req.tenantClient
      .update(schema.contacts)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.contacts.id, id))
      .returning();
    if (row.isMain) await clearOtherMain(req.tenantClient, row.partnerId, id);
    res.json(row);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'Contact',
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
      .delete(schema.contacts)
      .where(eq(schema.contacts.id, id))
      .returning();
    if (!old) return res.status(404).json({ error: 'Contacto no encontrado' });
    res.json({ success: true });
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'Contact',
      entityId: id,
      action: 'DELETE',
      oldValue: old,
    });
  } catch (error: any) {
    res.status(500).json({ error: errorDetail(error) });
  }
});

export default router;
