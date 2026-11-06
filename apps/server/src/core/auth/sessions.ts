/**
 * Sesiones en el servidor: el JWT lleva un `sid` y vale solo mientras su fila esté viva.
 * Revocar una sesión (o todas las de un usuario) la corta en cada instancia: la caché
 * de 15 s se vacía en la propia y se avisa a las demás por LISTEN/NOTIFY.
 */
import crypto from 'node:crypto';
import { Client } from 'pg';
import { and, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { ClientFactory } from '../tenant/ClientFactory';
import { userSessions } from '../../db/schema';
import { AuthService } from './AuthService';
import type { ClientInfo } from './clientInfo';

export type SessionRow = typeof userSessions.$inferSelect;

const CHANNEL = 'keirost_sessions';
// Identifica a esta instancia en los avisos, para no reaccionar a su propio eco.
export const INSTANCE_ID = crypto.randomUUID();
const CACHE_MS = 15_000;
const cache = new Map<string, { session: SessionRow; at: number }>();
const revokeListeners: Array<(sid: string, userId: string) => void> = [];

function fire(sid: string, userId: string) {
  for (const cb of revokeListeners) {
    try {
      cb(sid, userId);
    } catch (e: any) {
      console.error('[sessions] Un aviso de revocación falló:', e?.message ?? e);
    }
  }
}

const db = () => ClientFactory.getClient('public');

function envNumber(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function createSession(input: {
  userId: string;
  tenantId: string | null;
  method: string;
  mfa: string | null;
  restricted?: string | null;
  client: ClientInfo;
  slidingHours?: number;
  maxDays?: number;
}): Promise<SessionRow> {
  const slidingHours = input.slidingHours ?? envNumber('AUTH_SESSION_HOURS', 12);
  const maxDays = input.maxDays ?? envNumber('AUTH_SESSION_MAX_DAYS', 30);
  const now = Date.now();
  const absoluteExpiresAt = new Date(now + maxDays * 86_400_000);
  const expiresAt = new Date(Math.min(now + slidingHours * 3_600_000, absoluteExpiresAt.getTime()));
  const [row] = await db()
    .insert(userSessions)
    .values({
      id: crypto.randomBytes(24).toString('base64url'),
      userId: input.userId,
      tenantId: input.tenantId,
      createdAt: new Date(now),
      lastSeenAt: new Date(now),
      expiresAt,
      absoluteExpiresAt,
      method: input.method,
      mfa: input.mfa,
      idleHours: slidingHours,
      restricted: input.restricted ?? null,
      clientKind: input.client.clientKind,
      deviceId: input.client.deviceId ?? null,
      userAgent: input.client.userAgent || null,
      ip: input.client.ip || null,
    })
    .returning();
  return row;
}

export function issueToken(
  session: SessionRow,
  user: { id: string; email: string; username: string; role: string },
): string {
  const seconds = Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
  return AuthService.generateToken(
    {
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      tenantId: session.tenantId,
      sid: session.id,
    },
    { expiresIn: seconds },
  );
}

async function loadSession(sid: string): Promise<SessionRow | undefined> {
  const hit = cache.get(sid);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.session;
  const [row] = await db().select().from(userSessions).where(eq(userSessions.id, sid));
  if (row) cache.set(sid, { session: row, at: Date.now() });
  else cache.delete(sid);
  return row;
}

export async function resolveSession(
  token: string,
): Promise<
  | { payload: any; session: SessionRow }
  | { error: 'INVALID' | 'SESSION_REVOKED' | 'SESSION_EXPIRED' }
> {
  const payload = AuthService.verifyToken(token);
  if (!payload || typeof payload.sid !== 'string') return { error: 'INVALID' };
  const session = await loadSession(payload.sid);
  if (!session || session.userId !== payload.userId) return { error: 'INVALID' };
  if (session.revokedAt) return { error: 'SESSION_REVOKED' };
  if (session.expiresAt.getTime() <= Date.now()) return { error: 'SESSION_EXPIRED' };
  return { payload, session };
}

/**
 * Desliza la caducidad desde ahora, sin pasar nunca del máximo absoluto ni revivir una sesión
 * ya caducada o revocada. Las fechas se calculan aquí y no con `now()` de Postgres: las
 * columnas son `timestamp` sin zona y guardan la hora UTC de JS.
 */
export async function touchSession(sid: string): Promise<void> {
  const [cur] = await db().select().from(userSessions).where(eq(userSessions.id, sid));
  if (!cur) return;
  const now = new Date();
  const expiresAt = new Date(
    Math.min(now.getTime() + cur.idleHours * 3_600_000, cur.absoluteExpiresAt.getTime()),
  );
  const [row] = await db()
    .update(userSessions)
    .set({ lastSeenAt: now, expiresAt })
    .where(
      and(
        eq(userSessions.id, sid),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, now),
      ),
    )
    .returning();
  if (row) cache.set(sid, { session: row, at: Date.now() });
}

async function notify(message: Record<string, unknown>) {
  try {
    await db().execute(sql`SELECT pg_notify(${CHANNEL}, ${JSON.stringify(message)})`);
  } catch (e: any) {
    console.warn('[sessions] No se pudo avisar a las otras instancias:', e.message);
  }
}

export async function revokeSession(sid: string, reason: string): Promise<void> {
  const [row] = await db()
    .update(userSessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(userSessions.id, sid), isNull(userSessions.revokedAt)))
    .returning();
  cache.delete(sid);
  if (!row) return;
  await notify({ origin: INSTANCE_ID, userId: row.userId, sids: [sid] });
  fire(sid, row.userId);
}

export async function revokeAllForUser(
  userId: string,
  reason: string,
  exceptSid?: string,
): Promise<number> {
  const conds = [eq(userSessions.userId, userId), isNull(userSessions.revokedAt)];
  if (exceptSid) conds.push(ne(userSessions.id, exceptSid));
  const rows = await db()
    .update(userSessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(...conds))
    .returning();
  cache.clear();
  if (rows.length) {
    await notify({ origin: INSTANCE_ID, userId, sids: rows.map((r: SessionRow) => r.id) });
  }
  for (const r of rows) fire(r.id, userId);
  return rows.length;
}

export async function listSessions(userId: string): Promise<SessionRow[]> {
  return db()
    .select()
    .from(userSessions)
    .where(
      and(
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(userSessions.lastSeenAt));
}

export async function setSessionTenant(
  sid: string,
  tenantId: string | null,
  restricted: string | null,
): Promise<SessionRow> {
  const [row] = await db()
    .update(userSessions)
    .set({ tenantId, restricted })
    .where(eq(userSessions.id, sid))
    .returning();
  cache.delete(sid);
  if (!row) throw new Error('Sesión no encontrada');
  // Las demás instancias tienen la fila vieja en caché: se les avisa sin revocar nada.
  await notify({ origin: INSTANCE_ID, userId: row.userId, sids: [sid], kind: 'update' });
  return row;
}

export function onSessionRevoked(cb: (sid: string, userId: string) => void): void {
  revokeListeners.push(cb);
}

// ---- LISTEN/NOTIFY: una conexión propia por instancia -------------------------------

let listener: Client | null = null;
let listenerStopped = true;
let retryTimer: NodeJS.Timeout | null = null;

/** Lo que llega por NOTIFY; se exporta para probar la rama de otra instancia. */
export function handleNotification(payload?: string) {
  let msg: any;
  try {
    msg = JSON.parse(payload || '');
  } catch {
    return;
  }
  // Lo revocado aquí ya avisó y vació su caché al hacerlo: el eco propio no cuenta.
  if (msg.origin === INSTANCE_ID || !Array.isArray(msg.sids)) return;
  for (const sid of msg.sids) {
    cache.delete(sid);
    if (msg.kind !== 'update') fire(sid, msg.userId);
  }
}

function scheduleRetry() {
  if (listenerStopped || retryTimer) return;
  listener = null;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connectListener().catch(() => scheduleRetry());
  }, 5000);
  retryTimer.unref?.();
}

async function connectListener() {
  const client = new Client({ connectionString: ClientFactory.getConnectionUrl() });
  client.on('notification', (n) => handleNotification(n.payload));
  client.on('error', (e) => {
    console.warn('[sessions] Conexión de avisos caída:', e.message);
    client.end().catch(() => {});
    scheduleRetry();
  });
  client.on('end', scheduleRetry);
  await client.connect();
  await client.query(`LISTEN ${CHANNEL}`);
  listener = client;
}

export async function startSessionListener(): Promise<void> {
  if (listener) return;
  listenerStopped = false;
  try {
    await connectListener();
  } catch (e: any) {
    console.warn('[sessions] No se pudo escuchar los avisos de sesión:', e.message);
    scheduleRetry();
  }
}

/** Cierra la conexión de avisos (apagado ordenado y pruebas). */
export async function stopSessionListener(): Promise<void> {
  listenerStopped = true;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  const l = listener;
  listener = null;
  if (l) await l.end().catch(() => {});
}
