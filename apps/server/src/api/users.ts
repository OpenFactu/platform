import { Router } from 'express';
import { ClientFactory } from '../core/tenant/ClientFactory';
import * as schema from '../db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { AuthService } from '../core/auth/AuthService';
import crypto from 'crypto';
import { logAudit } from '../utils/audit';
import { listAuthEvents, recordAuthEvent } from '../core/auth/authEvents';
import { listSessions, revokeAllForUser } from '../core/auth/sessions';
import { clientInfo } from '../core/auth/clientInfo';
import {
  PASSWORD_MESSAGES,
  passwordProblem,
  readPolicy,
  strictestPasswordRules,
} from '../core/auth/policy';

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
 * ¿Es `userId` de la empresa de quien pregunta? Por pertenencia, o por la empresa heredada de
 * `GlobalUser`; un SUPERUSER ve a cualquiera. Mismo aislamiento que el resto del router: lo que
 * no es de la empresa no existe (404).
 */
async function inCallerCompany(req: any, userId: string): Promise<boolean> {
  if (req.user?.role === 'SUPERUSER') return true;
  if (!req.tenantId) return false;
  const db = ClientFactory.getClient('public');
  // Un administrador de empresa no ve ni toca a un SUPERUSER: para él, no existe.
  const [target] = await db
    .select({ role: schema.globalUsers.role })
    .from(schema.globalUsers)
    .where(eq(schema.globalUsers.id, userId));
  if (!target || target.role === 'SUPERUSER') return false;
  const [m] = await db
    .select({ id: schema.userTenantMemberships.id })
    .from(schema.userTenantMemberships)
    .where(
      and(
        eq(schema.userTenantMemberships.userId, userId),
        eq(schema.userTenantMemberships.tenantId, req.tenantId),
      ),
    )
    .limit(1);
  if (m) return true;
  const [u] = await db
    .select({ tenantId: schema.globalUsers.tenantId })
    .from(schema.globalUsers)
    .where(eq(schema.globalUsers.id, userId));
  return !!u && u.tenantId === req.tenantId;
}

/** GET /api/users/:id/auth-events — historial de accesos de un usuario de la empresa. */
router.get('/:id/auth-events', async (req: any, res) => {
  try {
    if (!(await inCallerCompany(req, req.params.id))) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json({ events: await listAuthEvents(req.params.id, Number(req.query.limit) || 50) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/users/:id/sessions — sesiones abiertas de un usuario de la empresa. */
router.get('/:id/sessions', async (req: any, res) => {
  try {
    if (!(await inCallerCompany(req, req.params.id))) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const rows = await listSessions(req.params.id);
    res.json({
      sessions: rows.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        clientKind: s.clientKind,
        userAgent: s.userAgent,
        ip: s.ip,
        method: s.method,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** DELETE /api/users/:id/sessions — cierra todas las sesiones de un usuario de la empresa. */
router.delete('/:id/sessions', async (req: any, res) => {
  try {
    if (!(await inCallerCompany(req, req.params.id))) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const revoked = await revokeAllForUser(req.params.id, 'revoked_by_admin');
    await recordAuthEvent({
      userId: req.params.id,
      kind: 'revoke',
      ok: true,
      client: clientInfo(req),
      detail: { byAdmin: req.user?.id, revoked },
    });
    res.json({ revoked });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

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
    // El usuario nuevo aún no tiene empresas: rige la política de la que lo crea.
    if (req.tenantId) {
      const problem = passwordProblem(password, (await readPolicy(req.tenantId)).passwordRules);
      if (problem)
        return res.status(400).json({ error: PASSWORD_MESSAGES[problem], code: problem });
    }
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
    if (password) {
      const problem = passwordProblem(password, await strictestPasswordRules(id));
      if (problem)
        return res.status(400).json({ error: PASSWORD_MESSAGES[problem], code: problem });
      updateData.password = await AuthService.hashPassword(password);
    }
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
