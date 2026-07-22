import { Router } from 'express';
import { ClientFactory } from '../core/tenant/ClientFactory';
import * as schema from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { AuthService } from '../core/auth/AuthService';
import crypto from 'crypto';
import { logAudit } from '../utils/audit';

const router = Router();

/**
 * Traduce una violación de restricción única de Postgres (código 23505) a un
 * mensaje claro. Devuelve `null` si `error` no es ese tipo de error — el
 * llamador debe caer entonces al 500 genérico.
 */
function uniqueViolationMessage(error: any): string | null {
  if (error?.code !== '23505') return null;
  const constraint: string = error.constraint || '';
  if (constraint.includes('email')) return 'Ya existe un usuario con ese email';
  if (constraint.includes('username')) return 'Ya existe un usuario con ese nombre de usuario';
  return 'Ya existe un registro con ese valor único';
}

/**
 * GET /api/users
 */
router.get('/', async (req: any, res) => {
  try {
    const db = ClientFactory.getClient('public');
    const [users, membershipCounts] = await Promise.all([
      db
        .select({
          id: schema.globalUsers.id,
          email: schema.globalUsers.email,
          username: schema.globalUsers.username,
          role: schema.globalUsers.role,
          tenantId: schema.globalUsers.tenantId,
          tenantName: schema.tenants.name,
          permissions: schema.globalUsers.permissions,
          avatarImageUrl: schema.globalUsers.avatarImageUrl,
        })
        .from(schema.globalUsers)
        .leftJoin(schema.tenants, eq(schema.globalUsers.tenantId, schema.tenants.id)),
      db
        .select({
          userId: schema.userTenantMemberships.userId,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.userTenantMemberships)
        .groupBy(schema.userTenantMemberships.userId),
    ]);

    const result = users.map((u) => ({
      ...u,
      membershipCount: membershipCounts.find((m) => m.userId === u.id)?.count ?? 0,
    }));

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/users
 */
router.post('/', async (req: any, res) => {
  try {
    const db = ClientFactory.getClient('public');
    const { password, ...userData } = req.body;
    const id = crypto.randomUUID();
    const hashedPassword = await AuthService.hashPassword(password);
    const [user] = await db
      .insert(schema.globalUsers)
      .values({ ...userData, id, password: hashedPassword })
      .returning();
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
    if (req.tenantId)
      logAudit({
        tenantClient: db,
        tenantId: req.tenantId,
        userId: req.user?.id,
        entityType: 'User',
        entityId: id,
        action: 'CREATE',
        newValue: safeUser,
      });
  } catch (error: any) {
    const dupMessage = uniqueViolationMessage(error);
    if (dupMessage) {
      res.status(409).json({ error: dupMessage });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/users/:id
 */
router.patch('/:id', async (req: any, res) => {
  const { id } = req.params;
  try {
    const db = ClientFactory.getClient('public');
    const { password, ...userData } = req.body;
    const updateData: any = { ...userData, updatedAt: new Date() };
    if (password) updateData.password = await AuthService.hashPassword(password);
    const [old] = await db.select().from(schema.globalUsers).where(eq(schema.globalUsers.id, id));
    const [user] = await db
      .update(schema.globalUsers)
      .set(updateData)
      .where(eq(schema.globalUsers.id, id))
      .returning();
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
    if (req.tenantId) {
      const { password: _o, ...safeOld } = old || {};
      logAudit({
        tenantClient: db,
        tenantId: req.tenantId,
        userId: req.user?.id,
        entityType: 'User',
        entityId: id,
        action: 'UPDATE',
        oldValue: safeOld,
        newValue: safeUser,
      });
    }
  } catch (error: any) {
    const dupMessage = uniqueViolationMessage(error);
    if (dupMessage) {
      res.status(409).json({ error: dupMessage });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/users/:id
 */
router.delete('/:id', async (req: any, res) => {
  const { id } = req.params;
  try {
    const db = ClientFactory.getClient('public');
    const [old] = await db.select().from(schema.globalUsers).where(eq(schema.globalUsers.id, id));
    await db.delete(schema.globalUsers).where(eq(schema.globalUsers.id, id));
    res.json({ success: true });
    if (req.tenantId && old) {
      const { password: _, ...safeOld } = old;
      logAudit({
        tenantClient: db,
        tenantId: req.tenantId,
        userId: req.user?.id,
        entityType: 'User',
        entityId: id,
        action: 'DELETE',
        oldValue: safeOld,
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
