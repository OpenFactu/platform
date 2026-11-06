/**
 * Historial de accesos y cambios de seguridad (`AuthEvent`). Registrar nunca rompe el
 * flujo que lo llama: un fallo al apuntar un evento solo va al log.
 *
 * Las fechas se calculan en JS: las columnas son `timestamp` sin zona con hora UTC.
 */
import crypto from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { ClientFactory } from '../tenant/ClientFactory';
import { authEvents } from '../../db/schema';
import type { ClientInfo } from './clientInfo';

export type AuthEventKind =
  | 'login'
  | 'logout'
  | 'revoke'
  | 'lockout'
  | 'mfa'
  | 'mfa_change'
  | 'password_change'
  | 'new_device_notice'
  | (string & {});

export type AuthEventRow = typeof authEvents.$inferSelect;

export interface AuthEventInput {
  userId?: string;
  kind: AuthEventKind;
  ok: boolean;
  method?: string;
  client: ClientInfo;
  detail?: object;
}

const db = () => ClientFactory.getClient('public');

export async function recordAuthEvent(e: AuthEventInput): Promise<void> {
  try {
    await db()
      .insert(authEvents)
      .values({
        id: crypto.randomUUID(),
        userId: e.userId ?? null,
        at: new Date(),
        kind: e.kind,
        ok: e.ok,
        method: e.method ?? null,
        ip: e.client.ip || null,
        userAgent: e.client.userAgent || null,
        clientKind: e.client.clientKind || null,
        deviceId: e.client.deviceId ?? null,
        detail: e.detail ? JSON.stringify(e.detail) : null,
      });
  } catch (err: any) {
    console.error(`[auth] No se pudo registrar el evento ${e.kind}:`, err?.message);
  }
}

export async function listAuthEvents(userId: string, limit = 50): Promise<AuthEventRow[]> {
  const n = Math.min(Math.max(Math.trunc(Number(limit)) || 50, 1), 200);
  return db()
    .select()
    .from(authEvents)
    .where(eq(authEvents.userId, userId))
    .orderBy(desc(authEvents.at))
    .limit(n);
}

/** ¿Ha entrado ya este usuario con éxito desde ese dispositivo? */
export async function isKnownDevice(userId: string, client: ClientInfo): Promise<boolean> {
  const conds = [
    eq(authEvents.userId, userId),
    eq(authEvents.kind, 'login'),
    eq(authEvents.ok, true),
  ];
  if (client.deviceId) conds.push(eq(authEvents.deviceId, client.deviceId));
  else {
    conds.push(eq(authEvents.userAgent, client.userAgent || ''));
    conds.push(eq(authEvents.clientKind, client.clientKind));
  }
  const rows = await db()
    .select({ id: authEvents.id })
    .from(authEvents)
    .where(and(...conds))
    .limit(1);
  return rows.length > 0;
}

/** ¿Ha tenido el usuario algún login correcto antes? El primero de una cuenta no es sospechoso. */
export async function hasPreviousLogin(userId: string): Promise<boolean> {
  const rows = await db()
    .select({ id: authEvents.id })
    .from(authEvents)
    .where(
      and(eq(authEvents.userId, userId), eq(authEvents.kind, 'login'), eq(authEvents.ok, true)),
    )
    .limit(1);
  return rows.length > 0;
}
