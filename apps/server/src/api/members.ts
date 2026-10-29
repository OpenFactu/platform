import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { ClientFactory } from '../core/tenant/ClientFactory';

const router = Router();

/**
 * GET /api/members — miembros de la empresa activa (id y nombre), para los
 * selectores de «responsable». A diferencia de /api/users no expone correos ni
 * roles, y no exige el permiso de la pantalla de Usuarios.
 */
router.get('/', async (req: any, res) => {
  // mountShared no exige sesión: sin usuario y empresa no hay nada que listar.
  if (!req.user?.id || !req.tenantId) return res.status(401).json({ error: 'No autorizado' });
  try {
    const publicDb = ClientFactory.getClient('public');
    const rows = await publicDb
      .select({
        id: schema.globalUsers.id,
        username: schema.globalUsers.username,
        avatarImageUrl: schema.globalUsers.avatarImageUrl,
      })
      .from(schema.userTenantMemberships)
      .innerJoin(schema.globalUsers, eq(schema.userTenantMemberships.userId, schema.globalUsers.id))
      .where(eq(schema.userTenantMemberships.tenantId, req.tenantId))
      .orderBy(asc(schema.globalUsers.username));
    res.json(rows.map((r: any) => ({ id: r.id, name: r.username, avatarUrl: r.avatarImageUrl })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
