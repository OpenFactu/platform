/**
 * CRUD de módulos top-level del menú creados por el admin del tenant.
 *
 * Cada `UserModule` tiene: label, iconName, moduleOrder. Las tablas de
 * usuario pueden asignarse a uno via `PluginTable.userModuleId`.
 */
import { Router } from 'express';
import { and, eq, asc } from 'drizzle-orm';
import crypto from 'crypto';
import { ClientFactory } from '../core/tenant/ClientFactory';
import * as schema from '../db/schema';

const router = Router();

function requireAdmin(req: any, res: any, next: any) {
  const role = req.user?.role;
  if (role !== 'ADMIN' && role !== 'SUPERUSER') {
    return res.status(403).json({ error: 'Requiere ADMIN o SUPERUSER.' });
  }
  next();
}

async function ensureTenant(req: any) {
  const db = ClientFactory.getClient('public');
  const tenantId = req.tenantId;
  if (!tenantId) throw new Error('Falta tenant.');
  return { db, tenantId };
}

// Todos los usuarios autenticados pueden leer para pintar el menú.
router.get('/', async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    const rows = await db
      .select()
      .from(schema.userModules)
      .where(eq(schema.userModules.tenantId, tenantId))
      .orderBy(asc(schema.userModules.moduleOrder));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAdmin, async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    const { label, iconName, moduleOrder } = req.body || {};
    if (!label) return res.status(400).json({ error: 'label requerido' });
    const id = crypto.randomUUID();
    await db.insert(schema.userModules).values({
      id,
      tenantId,
      label,
      iconName: iconName || 'Folder',
      moduleOrder: Number(moduleOrder || 100),
    });
    res.json({ id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', requireAdmin, async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    const patch: any = {};
    for (const k of ['label', 'iconName', 'moduleOrder']) {
      if (k in (req.body || {})) patch[k] = req.body[k];
    }
    await db
      .update(schema.userModules)
      .set(patch)
      .where(
        and(eq(schema.userModules.id, req.params.id), eq(schema.userModules.tenantId, tenantId)),
      );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAdmin, async (req: any, res) => {
  try {
    const { db, tenantId } = await ensureTenant(req);
    await db
      .delete(schema.userModules)
      .where(
        and(eq(schema.userModules.id, req.params.id), eq(schema.userModules.tenantId, tenantId)),
      );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
