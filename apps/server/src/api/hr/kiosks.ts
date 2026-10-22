import { Router } from 'express';
import { eq, asc, and, isNull } from 'drizzle-orm';
import * as schema from '../../db/schema';
import crypto from 'crypto';
import {
  getKioskAppearance,
  parseKioskAppearance,
  saveKioskAppearance,
  kioskAppearanceKey,
} from '../../core/hr/kioskAppearance';

const router = Router();

router.get('/:id/appearance', async (req: any, res) => {
  try {
    const [kiosk] = await req.tenantClient
      .select({ id: schema.timeclockKiosks.id })
      .from(schema.timeclockKiosks)
      .where(eq(schema.timeclockKiosks.id, req.params.id));
    if (!kiosk) return res.status(404).json({ error: 'Kiosco no encontrado.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getKioskAppearance(req.tenantClient, kiosk.id));
  } catch {
    res.status(500).json({ error: 'No se pudo cargar el aspecto del kiosco.' });
  }
});
router.put('/:id/appearance', async (req: any, res) => {
  let appearance: ReturnType<typeof parseKioskAppearance>;
  try {
    appearance = parseKioskAppearance(req.body);
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : 'Aspecto inválido.' });
  }
  try {
    const found = await req.tenantClient.transaction(async (tx: any) => {
      const [kiosk] = await tx
        .select({ id: schema.timeclockKiosks.id })
        .from(schema.timeclockKiosks)
        .where(eq(schema.timeclockKiosks.id, req.params.id))
        .for('update');
      if (!kiosk) return false;
      await saveKioskAppearance(tx, kiosk.id, appearance);
      return true;
    });
    if (!found) return res.status(404).json({ error: 'Kiosco no encontrado.' });
    res.json(appearance);
  } catch {
    res.status(500).json({ error: 'No se pudo guardar el aspecto del kiosco.' });
  }
});

async function updateKiosk(client: any, id: string, patch: any, cancel: boolean) {
  return client.transaction(async (tx: any) => {
    const [row] = await tx
      .update(schema.timeclockKiosks)
      .set(patch)
      .where(eq(schema.timeclockKiosks.id, id))
      .returning();
    if (row && cancel)
      await tx
        .update(schema.timeclockIdentifications)
        .set({ cancelledAt: new Date() })
        .where(
          and(
            eq(schema.timeclockIdentifications.kioskId, id),
            isNull(schema.timeclockIdentifications.consumedAt),
            isNull(schema.timeclockIdentifications.cancelledAt),
          ),
        );
    return row;
  });
}

router.get('/', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select()
      .from(schema.timeclockKiosks)
      .orderBy(asc(schema.timeclockKiosks.name));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const { name, location } = req.body;
    if (!name) return res.status(400).json({ error: 'name obligatorio' });
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString('hex');
    const [row] = await req.tenantClient
      .insert(schema.timeclockKiosks)
      .values({
        id,
        name,
        location: location || null,
        token,
        isActive: true,
      })
      .returning();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req: any, res) => {
  try {
    const allow = ['name', 'location', 'isActive'];
    const patch: Record<string, any> = {};
    for (const k of allow) if (k in req.body) patch[k] = req.body[k];
    const row = await updateKiosk(req.tenantClient, req.params.id, patch, patch.isActive === false);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/regenerate-token', async (req: any, res) => {
  try {
    const token = crypto.randomBytes(24).toString('hex');
    const row = await updateKiosk(req.tenantClient, req.params.id, { token }, true);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    await req.tenantClient.transaction(async (tx: any) => {
      await tx.delete(schema.timeclockKiosks).where(eq(schema.timeclockKiosks.id, req.params.id));
      await tx
        .delete(schema.systemConfigs)
        .where(eq(schema.systemConfigs.key, kioskAppearanceKey(req.params.id)));
    });
    res.json({ success: true });
  } catch (err: any) {
    if (err.code === '23503' || err.cause?.code === '23503')
      return res.status(409).json({
        error:
          'Este kiosco tiene lectores vinculados o fichajes. Desactívalo para conservar su historial.',
      });
    res.status(500).json({ error: err.message });
  }
});

export default router;
