import { Router } from 'express';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import crypto from 'crypto';
import { logAudit } from '../utils/audit';
import { requirePermission } from './middleware/requirePermission';

const router = Router();

// Leer no pide permiso (ver el montaje en server.ts): lo usan todos los documentos
// y las fichas. Escribir sí, y por eso cada ruta de escritura lo declara.

// GET all tax groups
router.get('/', async (req: any, res) => {
  try {
    const results = await req.tenantClient.select().from(schema.taxGroups);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET single tax group
router.get('/:id', async (req: any, res) => {
  try {
    const [taxGroup] = await req.tenantClient
      .select()
      .from(schema.taxGroups)
      .where(eq(schema.taxGroups.id, req.params.id));

    if (!taxGroup) return res.status(404).json({ error: 'Grupo de impuestos no encontrado' });
    res.json(taxGroup);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST new tax group
router.post('/', requirePermission('/taxes'), async (req: any, res) => {
  const { code, rate } = req.body;
  try {
    const id = crypto.randomUUID();
    const [inserted] = await req.tenantClient
      .insert(schema.taxGroups)
      .values({ id, code, rate: String(rate) })
      .returning();
    res.json(inserted);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'TaxGroup',
      entityId: id,
      action: 'CREATE',
      newValue: inserted,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH update tax group
router.patch('/:id', requirePermission('/taxes'), async (req: any, res) => {
  const { code, rate } = req.body;
  const { id } = req.params;
  try {
    const [old] = await req.tenantClient
      .select()
      .from(schema.taxGroups)
      .where(eq(schema.taxGroups.id, id));
    const [updated] = await req.tenantClient
      .update(schema.taxGroups)
      .set({ ...(code && { code }), ...(rate && { rate: String(rate) }) })
      .where(eq(schema.taxGroups.id, id))
      .returning();
    res.json(updated);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'TaxGroup',
      entityId: id,
      action: 'UPDATE',
      oldValue: old,
      newValue: updated,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE tax group
router.delete('/:id', requirePermission('/taxes'), async (req: any, res) => {
  const { id } = req.params;
  try {
    const [old] = await req.tenantClient
      .select()
      .from(schema.taxGroups)
      .where(eq(schema.taxGroups.id, id));
    await req.tenantClient.delete(schema.taxGroups).where(eq(schema.taxGroups.id, id));
    res.json({ success: true });
    if (old)
      logAudit({
        tenantClient: req.tenantClient,
        tenantId: req.tenantId || '',
        userId: req.user?.id,
        entityType: 'TaxGroup',
        entityId: id,
        action: 'DELETE',
        oldValue: old,
      });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
