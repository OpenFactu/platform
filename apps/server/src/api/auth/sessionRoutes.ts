import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { ClientFactory } from '../../core/tenant/ClientFactory';
import * as schema from '../../db/schema';
import {
  issueToken,
  listSessions,
  revokeAllForUser,
  resolveSession,
  revokeSession,
  setSessionTenant,
  touchSession,
  type SessionRow,
} from '../../core/auth/sessions';
import { recordAuthEvent } from '../../core/auth/authEvents';
import { clientInfo } from '../../core/auth/clientInfo';
import { DEFAULT_POLICY, policyGate, readPolicy, userHasMfa } from '../../core/auth/policy';
import { resolveLoginTarget } from './completeLogin';
import { internalError } from './internalError';

/**
 * Devuelve la sesión del llamante, o responde 401 (500 si la base falla) y devuelve `null`.
 * `/api/auth` se monta público, ANTES de `tenantContextMiddleware`, así que aquí no se puede
 * contar con `req.session`: si no está, se resuelve el Bearer por cuenta propia.
 */
export async function requireSession(req: any, res: Response): Promise<SessionRow | null> {
  if (req.session) return req.session as SessionRow;
  const header = String(req.headers?.authorization || '');
  const token = header.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'No autorizado', code: 'UNAUTHORIZED' });
    return null;
  }
  let resolved: Awaited<ReturnType<typeof resolveSession>>;
  try {
    resolved = await resolveSession(token);
  } catch (e: any) {
    internalError(res, 'No se pudo resolver la sesión', e);
    return null;
  }
  if ('error' in resolved) {
    if (resolved.error === 'SESSION_REVOKED') {
      res.status(401).json({ error: 'La sesión se ha cerrado', code: 'SESSION_REVOKED' });
    } else if (resolved.error === 'SESSION_EXPIRED') {
      res.status(401).json({ error: 'La sesión ha caducado', code: 'SESSION_EXPIRED' });
    } else {
      res.status(401).json({ error: 'No autorizado', code: 'UNAUTHORIZED' });
    }
    return null;
  }
  const p = resolved.payload;
  req.session = resolved.session;
  if (!req.user) {
    req.user = {
      id: p.userId,
      role: p.role,
      email: p.email,
      username: p.username,
      tenantId: p.tenantId,
    };
  }
  return resolved.session;
}

const router = Router();

/** POST /api/auth/logout — cierra la sesión actual. */
router.post('/logout', async (req: Request, res: Response) => {
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    await revokeSession(session.id, 'logout');
    await recordAuthEvent({
      userId: session.userId,
      kind: 'logout',
      ok: true,
      client: clientInfo(req),
    });
    res.status(204).end();
  } catch (e: any) {
    internalError(res, 'POST /logout', e);
  }
});

/**
 * POST /api/auth/refresh — mismo `sid`, token nuevo con la caducidad ya deslizada.
 * El `exp` del JWT queda fijo al emitirlo; así es como una sesión vive más de 12 h mientras se usa.
 */
router.post('/refresh', async (req: any, res: Response) => {
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    await touchSession(session.id);
    const db = ClientFactory.getClient('public');
    const [user] = await db
      .select()
      .from(schema.globalUsers)
      .where(eq(schema.globalUsers.id, session.userId));
    if (!user) return res.status(401).json({ error: 'No autorizado', code: 'UNAUTHORIZED' });
    const [fresh] = await db
      .select()
      .from(schema.userSessions)
      .where(eq(schema.userSessions.id, session.id));
    if (!fresh || fresh.revokedAt) {
      return res.status(401).json({ error: 'La sesión se ha cerrado', code: 'SESSION_REVOKED' });
    }
    // El rol sale de la base, no del token viejo: un ADMIN degradado deja de serlo en la
    // siguiente renovación, y quien ya no está en la empresa pierde la sesión.
    const target = await resolveLoginTarget(user, fresh.tenantId);
    if (!target) {
      await revokeSession(fresh.id, 'access_removed');
      return res.status(401).json({ error: 'La sesión se ha cerrado', code: 'SESSION_REVOKED' });
    }
    // La política de la empresa también puede haber cambiado: si ya no admite esta forma de
    // entrar, la sesión se cierra; si ahora exige 2FA, queda restringida (o se levanta).
    const policy = fresh.tenantId ? await readPolicy(fresh.tenantId) : DEFAULT_POLICY;
    const gate = policyGate(
      policy,
      { role: target.role, hasMfa: await userHasMfa(user) },
      fresh.method,
    );
    if (!gate.allowed) {
      await revokeSession(fresh.id, 'policy');
      return res.status(401).json({ error: 'La sesión se ha cerrado', code: 'SESSION_REVOKED' });
    }
    let current = fresh;
    if ((fresh.restricted ?? null) !== (gate.restricted ?? null)) {
      current = await setSessionTenant(fresh.id, fresh.tenantId, gate.restricted);
    }
    res.json({
      token: issueToken(current, {
        id: user.id,
        email: user.email,
        username: user.username,
        role: target.role,
      }),
    });
  } catch (e: any) {
    internalError(res, 'POST /refresh', e);
  }
});

/** GET /api/auth/sessions — las sesiones abiertas del usuario. */
router.get('/sessions', async (req: Request, res: Response) => {
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    const rows = await listSessions(session.userId);
    res.json({
      sessions: rows.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        clientKind: s.clientKind,
        userAgent: s.userAgent,
        ip: s.ip,
        method: s.method,
        current: s.id === session.id,
      })),
    });
  } catch (e: any) {
    internalError(res, 'GET /sessions', e);
  }
});

/** DELETE /api/auth/sessions?others=1 — cierra todas menos la actual. */
router.delete('/sessions', async (req: Request, res: Response) => {
  const session = await requireSession(req, res);
  if (!session) return;
  if (req.query.others !== '1') {
    return res.status(400).json({ error: 'Falta others=1' });
  }
  try {
    const revoked = await revokeAllForUser(session.userId, 'revoked_by_user', session.id);
    await recordAuthEvent({
      userId: session.userId,
      kind: 'revoke',
      ok: true,
      client: clientInfo(req),
      detail: { others: true, revoked },
    });
    res.json({ revoked });
  } catch (e: any) {
    internalError(res, 'DELETE /sessions', e);
  }
});

/** DELETE /api/auth/sessions/:id — cierra una sesión propia; las ajenas no existen. */
router.delete('/sessions/:id', async (req: Request, res: Response) => {
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    const own = (await listSessions(session.userId)).find((s) => s.id === req.params.id);
    if (!own) return res.status(404).json({ error: 'Sesión no encontrada' });
    await revokeSession(own.id, 'revoked_by_user');
    await recordAuthEvent({
      userId: session.userId,
      kind: 'revoke',
      ok: true,
      client: clientInfo(req),
      detail: { sessionId: own.id },
    });
    res.status(204).end();
  } catch (e: any) {
    internalError(res, 'DELETE /sessions/:id', e);
  }
});

export default router;
