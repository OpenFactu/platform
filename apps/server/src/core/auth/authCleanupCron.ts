/**
 * Limpieza diaria del acceso: historial de más de un año, retos y sesiones caducados hace
 * más de 7 días y contadores del freno que ya no bloquean ni cuentan.
 */
import { and, isNull, lt, or } from 'drizzle-orm';
import { ClientFactory } from '../tenant/ClientFactory';
import { authChallenges, authEvents, authThrottles, userSessions } from '../../db/schema';

const DAY_MS = 24 * 60 * 60 * 1000;
const WARMUP_MS = 60 * 1000;
let started = false;

export async function runAuthCleanup(now: Date = new Date()): Promise<void> {
  const db = ClientFactory.getClient('public');
  const ago = (ms: number) => new Date(now.getTime() - ms);
  await db.delete(authEvents).where(lt(authEvents.at, ago(365 * DAY_MS)));
  await db.delete(authChallenges).where(lt(authChallenges.expiresAt, ago(7 * DAY_MS)));
  await db
    .delete(userSessions)
    .where(
      or(
        lt(userSessions.absoluteExpiresAt, ago(7 * DAY_MS)),
        lt(userSessions.expiresAt, ago(7 * DAY_MS)),
        lt(userSessions.revokedAt, ago(7 * DAY_MS)),
      ),
    );
  // Sin bloqueo vigente y con la ventana de 15 min ya pasada.
  await db
    .delete(authThrottles)
    .where(
      and(
        or(isNull(authThrottles.lockedUntil), lt(authThrottles.lockedUntil, now)),
        lt(authThrottles.windowStart, ago(15 * 60_000)),
      ),
    );
}

export function startAuthCleanupCron(): void {
  if (started) return;
  started = true;
  const run = () =>
    runAuthCleanup().catch((e) => console.error('[auth] Limpieza diaria fallida:', e?.message));
  setTimeout(run, WARMUP_MS).unref?.();
  setInterval(run, DAY_MS).unref?.();
}
