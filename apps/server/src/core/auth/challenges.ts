/**
 * Retos de un solo uso del acceso (segundo factor, relevo, código por correo, SSO...).
 * Del secreto solo se guarda su hash; quien lo recibe lo presenta tal cual.
 *
 * Las fechas se calculan en JS: las columnas son `timestamp` sin zona con hora UTC.
 */
import crypto from 'crypto';
import { and, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { ClientFactory } from '../tenant/ClientFactory';
import { authChallenges } from '../../db/schema';

export type ChallengeKind =
  | 'mfa'
  | 'handoff'
  | 'email_code'
  | 'sso_ticket'
  | 'sso_state'
  | 'webauthn';

export type ChallengeRow = typeof authChallenges.$inferSelect;

const db = () => ClientFactory.getClient('public');
const hashSecret = (secret: string) => crypto.createHash('sha256').update(secret).digest('hex');

export function parseData(row: { data: string | null }): Record<string, any> {
  try {
    return row.data ? JSON.parse(row.data) : {};
  } catch {
    return {};
  }
}

export async function createChallenge(
  kind: ChallengeKind,
  opts: { userId?: string; ttlMs: number; data?: object; maxAttempts?: number },
): Promise<{ id: string; secret: string }> {
  const id = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString('base64url');
  await db()
    .insert(authChallenges)
    .values({
      id,
      kind,
      secretHash: hashSecret(secret),
      userId: opts.userId ?? null,
      expiresAt: new Date(Date.now() + opts.ttlMs),
      attempts: 0,
      // El máximo de fallos viaja en `data` (`__max`): la tabla solo cuenta los hechos.
      data: JSON.stringify({ ...(opts.data ?? {}), __max: opts.maxAttempts ?? 5 }),
    });
  return { id, secret };
}

/** Solo retos vivos y sin consumir. */
export async function findChallenge(
  kind: ChallengeKind,
  secret: string,
): Promise<ChallengeRow | null> {
  if (!secret || typeof secret !== 'string') return null;
  const [row] = await db()
    .select()
    .from(authChallenges)
    .where(
      and(
        eq(authChallenges.kind, kind),
        eq(authChallenges.secretHash, hashSecret(secret)),
        gt(authChallenges.expiresAt, new Date()),
        inArray(authChallenges.status, ['pending', 'approved']),
      ),
    );
  return row ?? null;
}

/** Suma un intento fallido; al llegar al máximo el reto se consume y `exhausted` es true. */
export async function failChallenge(id: string): Promise<{ exhausted: boolean }> {
  const [row] = await db()
    .update(authChallenges)
    .set({ attempts: sql`${authChallenges.attempts} + 1` })
    .where(eq(authChallenges.id, id))
    .returning();
  if (!row) return { exhausted: true };
  const max = Number(parseData(row).__max ?? 5);
  if (row.attempts >= max) {
    await db().update(authChallenges).set({ status: 'consumed' }).where(eq(authChallenges.id, id));
    return { exhausted: true };
  }
  return { exhausted: false };
}

/** Atómico: `false` si ya estaba consumido. */
export async function consumeChallenge(id: string): Promise<boolean> {
  const rows = await db()
    .update(authChallenges)
    .set({ status: 'consumed' })
    .where(and(eq(authChallenges.id, id), ne(authChallenges.status, 'consumed')))
    .returning({ id: authChallenges.id });
  return rows.length > 0;
}

export async function approveChallenge(id: string, userId: string, data?: object): Promise<void> {
  const [row] = await db().select().from(authChallenges).where(eq(authChallenges.id, id));
  if (!row) return;
  const merged = { ...parseData(row), ...(data ?? {}) };
  await db()
    .update(authChallenges)
    .set({ status: 'approved', userId, data: JSON.stringify(merged) })
    .where(eq(authChallenges.id, id));
}
