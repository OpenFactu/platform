/**
 * Entrega de login entre dispositivos: un cliente (escritorio, otro navegador) pide un
 * relevo y espera; otro dispositivo, ya identificado, lo aprueba. El `id` del reto es
 * público (`handoffId`); el secreto de sondeo solo lo tiene quien lo creó.
 */
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { ClientFactory } from '../tenant/ClientFactory';
import { authChallenges } from '../../db/schema';
import { approveChallenge, consumeChallenge, createChallenge, parseData } from './challenges';
import type { ClientInfo } from './clientInfo';

export const HANDOFF_TTL_MS = 10 * 60_000;

export class HandoffError extends Error {
  code = 'HANDOFF_INVALID';
  constructor() {
    super('La entrega ya no es válida');
  }
}

const db = () => ClientFactory.getClient('public');
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

// Sin vocales, para que el código no forme palabras.
const CONSONANTS = 'BCDFGHJKLMNPRSTVWXZ';

export function newConfirmCode(): string {
  const l = () => CONSONANTS[crypto.randomInt(CONSONANTS.length)];
  return `${l()}${l()}-${String(crypto.randomInt(100)).padStart(2, '0')}`;
}

/** Pista de la red sin dar la dirección entera. */
export function ipHint(ip: string): string {
  const v = String(ip || '').replace(/^::ffff:/, '');
  if (!v || v === '::1' || v === '127.0.0.1') return 'local';
  if (v.includes(':')) return `${v.split(':').slice(0, 2).join(':')}:…`;
  const o = v.split('.');
  return o.length === 4 ? `${o[0]}.${o[1]}.x.x` : 'local';
}

async function load(handoffId: string) {
  if (!handoffId || typeof handoffId !== 'string') return null;
  const [row] = await db().select().from(authChallenges).where(eq(authChallenges.id, handoffId));
  return row && row.kind === 'handoff' ? row : null;
}

export async function createHandoff(client: ClientInfo): Promise<{
  handoffId: string;
  pollSecret: string;
  confirmCode: string;
  expiresAt: Date;
}> {
  const confirmCode = newConfirmCode();
  const { id, secret } = await createChallenge('handoff', {
    ttlMs: HANDOFF_TTL_MS,
    data: {
      confirmCode,
      clientKind: client.clientKind,
      userAgent: (client.userAgent || '').slice(0, 120),
      ipHint: ipHint(client.ip),
    },
  });
  return {
    handoffId: id,
    pollSecret: secret,
    confirmCode,
    expiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
  };
}

/** Solo de un relevo pendiente y vivo; si no, `null` (no dice si fue aprobado). */
export async function handoffInfo(handoffId: string) {
  const row = await load(handoffId);
  if (!row || row.status !== 'pending' || row.expiresAt.getTime() <= Date.now()) return null;
  const d = parseData(row);
  return {
    confirmCode: String(d.confirmCode ?? ''),
    clientKind: String(d.clientKind ?? 'web'),
    userAgent: String(d.userAgent ?? ''),
    ipHint: String(d.ipHint ?? 'local'),
    expiresAt: row.expiresAt,
  };
}

export async function approveHandoff(
  handoffId: string,
  userId: string,
  method: string,
  mfaDone: string | null,
): Promise<void> {
  const row = await load(handoffId);
  if (!row) throw new HandoffError();
  const ok = await approveChallenge(handoffId, userId, { method, mfaDone: mfaDone ?? null });
  if (!ok) throw new HandoffError();
}

export type PollResult =
  | { status: 'pending' }
  | { status: 'approved'; userId: string; method: string; mfaDone: string | null }
  | { status: 'expired' };

export async function pollHandoff(handoffId: string, pollSecret: string): Promise<PollResult> {
  const row = await load(handoffId);
  const a = Buffer.from(sha256(String(pollSecret ?? '')));
  const b = Buffer.from(row?.secretHash ?? sha256(''));
  // Id desconocido o secreto ajeno: indistinguible de un relevo que sigue esperando.
  if (!row || !crypto.timingSafeEqual(a, b)) return { status: 'pending' };
  if (row.status === 'consumed' || row.expiresAt.getTime() <= Date.now()) {
    return { status: 'expired' };
  }
  if (row.status !== 'approved' || !row.userId) return { status: 'pending' };
  if (!(await consumeChallenge(row.id))) return { status: 'expired' };
  const d = parseData(row);
  return {
    status: 'approved',
    userId: row.userId,
    method: String(d.method ?? 'handoff'),
    mfaDone: d.mfaDone ?? null,
  };
}
