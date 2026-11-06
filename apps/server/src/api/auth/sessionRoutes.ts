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
  touchSession,
  type SessionRow,
} from '../../core/auth/sessions';
import { recordAuthEvent } from '../../core/auth/authEvents';
import { clientInfo } from '../../core/auth/clientInfo';

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
    console.error('[auth] No se pudo resolver la sesión:', e?.message);
    res.status(500).json({ error: 'Error interno' });
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
    res.status(500).json({ error: e?.message || 'Error' });
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
    // El rol del token es el de la empresa activa, no el global: se conserva el del actual.
    const role = req.user?.role ?? user.role;
    res.json({
      token: issueToken(fresh, { id: user.id, email: user.email, username: user.username, role }),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
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
    res.status(500).json({ error: e?.message || 'Error' });
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
    res.status(500).json({ error: e?.message || 'Error' });
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
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

export default router;
