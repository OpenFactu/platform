/**
 * Freno contra fuerza bruta: contadores de fallos por cuenta y por IP, en la base para que
 * valgan en todas las instancias. `step` es la regla pura; las funciones de abajo la aplican
 * con la fila bloqueada (`SELECT … FOR UPDATE`) para que dos fallos a la vez no se pisen.
 *
 * Las fechas se calculan siempre en JS: las columnas son `timestamp` sin zona con hora UTC.
 */
import { inArray, eq, or, sql } from 'drizzle-orm';
import { ClientFactory } from '../tenant/ClientFactory';
import { authThrottles, globalUsers } from '../../db/schema';
import { recordAuthEvent } from './authEvents';

export type ThrottleAction = 'login' | 'mfa' | 'forgot' | 'reset' | 'email_code' | 'handoff';

export interface ThrottleState {
  failures: number;
  windowStart: Date;
  lockedUntil: Date | null;
  lockCount: number;
}

export interface Rule {
  max: number;
  windowMs: number;
  baseLockMs: number;
  maxLockMs: number;
  doubling: boolean;
}

const MIN = 60_000;

export const RULES: { account: Rule; ip: Rule } = {
  // 5 fallos en 15 min → 1 min, que se dobla en cada bloqueo hasta 1 h.
  account: { max: 5, windowMs: 15 * MIN, baseLockMs: MIN, maxLockMs: 60 * MIN, doubling: true },
  // 50 fallos en 15 min → 15 min.
  ip: { max: 50, windowMs: 15 * MIN, baseLockMs: 15 * MIN, maxLockMs: 15 * MIN, doubling: false },
};

export function normalizeAccount(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Nuevo estado tras un intento. Un acierto lo reinicia (`null`). La ventana empieza en el
 * primer fallo; pasada `windowMs` se vuelve a contar desde cero. Al llegar a `max` se bloquea
 * y se sube `lockCount`, que solo baja con un acierto (así un atacante paciente no vuelve
 * al bloqueo de 1 min esperando a que pase la ventana).
 */
export function step(
  state: ThrottleState | null,
  ok: boolean,
  now: Date,
  rule: Rule,
): ThrottleState | null {
  if (ok) return null;
  let failures = state?.failures ?? 0;
  let windowStart = state?.windowStart ?? now;
  const lockCount = state?.lockCount ?? 0;
  let lockedUntil = state?.lockedUntil ?? null;
  if (!state || now.getTime() - windowStart.getTime() > rule.windowMs) {
    failures = 0;
    windowStart = now;
  }
  failures += 1;
  if (failures >= rule.max) {
    const ms = rule.doubling
      ? Math.min(rule.baseLockMs * 2 ** lockCount, rule.maxLockMs)
      : rule.baseLockMs;
    return {
      failures: 0,
      windowStart: now,
      lockedUntil: new Date(now.getTime() + ms),
      lockCount: lockCount + 1,
    };
  }
  return { failures, windowStart, lockedUntil, lockCount };
}

const db = () => ClientFactory.getClient('public');

function keysOf(action: ThrottleAction, keys: { account?: string; ip: string }) {
  return {
    account: keys.account ? `${action}:acct:${normalizeAccount(keys.account)}` : null,
    ip: `${action}:ip:${keys.ip}`,
  };
}

export async function checkThrottle(
  action: ThrottleAction,
  keys: { account?: string; ip: string },
): Promise<{ blocked: false } | { blocked: true; retryAfter: number }> {
  const k = keysOf(action, keys);
  const list = [k.ip, ...(k.account ? [k.account] : [])];
  const rows = await db().select().from(authThrottles).where(inArray(authThrottles.key, list));
  const now = Date.now();
  let until = 0;
  for (const r of rows) {
    if (r.lockedUntil && r.lockedUntil.getTime() > until) until = r.lockedUntil.getTime();
  }
  if (until > now) return { blocked: true, retryAfter: Math.ceil((until - now) / 1000) };
  return { blocked: false };
}

/** Devuelve `true` si este fallo es el que bloquea la clave. */
async function apply(key: string, ok: boolean, rule: Rule, now: Date): Promise<boolean> {
  if (ok) {
    await db().delete(authThrottles).where(eq(authThrottles.key, key));
    return false;
  }
  let locked = false;
  await db().transaction(async (tx: any) => {
    // La fila tiene que existir para poder bloquearla; el estado real lo pone `step`.
    await tx
      .insert(authThrottles)
      .values({ key, failures: 0, windowStart: now, lockCount: 0 })
      .onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(authThrottles)
      .where(eq(authThrottles.key, key))
      .for('update');
    // Fila recién creada (sin fallos ni bloqueos previos): equivale a no tener estado.
    const fresh = row.failures === 0 && !row.lockedUntil && row.lockCount === 0;
    const next = step(fresh ? null : row, false, now, rule)!;
    await tx
      .update(authThrottles)
      .set({
        failures: next.failures,
        windowStart: next.windowStart,
        lockedUntil: next.lockedUntil,
        lockCount: next.lockCount,
      })
      .where(eq(authThrottles.key, key));
    locked = next.lockCount > row.lockCount;
  });
  return locked;
}

/** Deja constancia del bloqueo; con `account` de usuario o de login se intenta atribuirlo. */
async function recordLockout(
  action: ThrottleAction,
  scope: 'account' | 'ip',
  keys: { account?: string; ip: string },
): Promise<void> {
  let userId: string | undefined;
  if (scope === 'account' && keys.account) {
    try {
      const acct = normalizeAccount(keys.account);
      if (action === 'mfa') userId = keys.account;
      else {
        const [u] = await db()
          .select({ id: globalUsers.id })
          .from(globalUsers)
          .where(
            or(
              eq(sql`lower(${globalUsers.email})`, acct),
              eq(sql`lower(${globalUsers.username})`, acct),
            ),
          )
          .limit(1);
        userId = u?.id;
      }
    } catch {
      // sin atribuir
    }
  }
  await recordAuthEvent({
    userId,
    kind: 'lockout',
    ok: false,
    client: { ip: keys.ip, userAgent: '', clientKind: 'web' },
    detail: { action, scope },
  });
}

/** Un acierto reinicia la cuenta, pero no la IP: una IP que acierta no deja de ser sospechosa. */
export async function recordAttempt(
  action: ThrottleAction,
  keys: { account?: string; ip: string },
  ok: boolean,
): Promise<void> {
  const k = keysOf(action, keys);
  const now = new Date();
  if (k.account && (await apply(k.account, ok, RULES.account, now))) {
    await recordLockout(action, 'account', keys);
  }
  if (!ok && (await apply(k.ip, false, RULES.ip, now))) await recordLockout(action, 'ip', keys);
}

export function sendThrottled(res: any, retryAfter: number) {
  res.set('Retry-After', String(retryAfter));
  return res.status(429).json({
    error: 'Demasiados intentos. Vuelve a probar en unos minutos.',
    code: 'TOO_MANY_ATTEMPTS',
    retryAfter,
  });
}
