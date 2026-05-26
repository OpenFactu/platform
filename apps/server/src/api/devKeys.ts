import { Router } from 'express';
import crypto from 'crypto';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { adminMiddleware } from './middleware/adminAuth';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';

const router = Router();

/**
 * GET /api/dev-keys
 * Lista las API keys del usuario actual.
 */
router.get('/', adminMiddleware, async (req: any, res) => {
  try {
    const db = ClientFactory.getClient('public');
    const keys = await db
      .select({
        id: schema.devApiKeys.id,
        clientId: schema.devApiKeys.clientId,
        name: schema.devApiKeys.name,
        permissions: schema.devApiKeys.permissions,
        isActive: schema.devApiKeys.isActive,
        lastUsedAt: schema.devApiKeys.lastUsedAt,
        createdAt: schema.devApiKeys.createdAt,
      })
      .from(schema.devApiKeys)
      .where(eq(schema.devApiKeys.createdBy, req.user.userId || req.user.id));

    res.json(keys);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/dev-keys
 * Genera una nueva API key para desarrollo de plugins.
 * Body: { name: "Mi PC de desarrollo", permissions?: "plugin:push,plugin:reload" }
 */
router.post('/', adminMiddleware, async (req: any, res) => {
  try {
    const { name, permissions } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }

    const db = ClientFactory.getClient('public');

    const clientId = 'ofk_' + crypto.randomBytes(16).toString('hex');
    const clientSecret = 'ofs_' + crypto.randomBytes(32).toString('hex');

    await db.insert(schema.devApiKeys).values({
      id: crypto.randomUUID(),
      clientId,
      clientSecret,
      name,
      createdBy: req.user.userId || req.user.id,
      tenantId: req.user.tenantId || null,
      permissions: permissions || 'plugin:push,plugin:reload',
    });

    // Solo se muestra el secret una vez
    res.json({
      clientId,
      clientSecret,
      name,
      permissions: permissions || 'plugin:push,plugin:reload',
      warning: 'Guarda el clientSecret. No se puede recuperar.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/dev-keys/:id
 * Revoca una API key.
 */
router.delete('/:id', adminMiddleware, async (req: any, res) => {
  try {
    const db = ClientFactory.getClient('public');
    const { id } = req.params;

    const [key] = await db.select().from(schema.devApiKeys).where(eq(schema.devApiKeys.id, id));

    if (!key) {
      return res.status(404).json({ error: 'Key no encontrada' });
    }

    // Solo el creador o un SUPERUSER puede revocar
    if (key.createdBy !== (req.user.userId || req.user.id) && req.user.role !== 'SUPERUSER') {
      return res.status(403).json({ error: 'No puedes revocar esta key' });
    }

    await db.delete(schema.devApiKeys).where(eq(schema.devApiKeys.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/dev-keys/:id/toggle
 * Activa o desactiva una API key.
 */
router.patch('/:id/toggle', adminMiddleware, async (req: any, res) => {
  try {
    const db = ClientFactory.getClient('public');
    const { id } = req.params;

    const [key] = await db.select().from(schema.devApiKeys).where(eq(schema.devApiKeys.id, id));

    if (!key) {
      return res.status(404).json({ error: 'Key no encontrada' });
    }

    await db
      .update(schema.devApiKeys)
      .set({ isActive: !key.isActive })
      .where(eq(schema.devApiKeys.id, id));

    res.json({ success: true, isActive: !key.isActive });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
