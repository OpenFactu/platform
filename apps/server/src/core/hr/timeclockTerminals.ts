import { and, eq } from 'drizzle-orm';
import type { Response } from 'express';
import * as schema from '../../db/schema';
import { ClientFactory } from '../tenant/ClientFactory';
import { hashSecret } from './timeclockCredentials';
import { fail, TimeclockError, type Terminal } from './timeclockTypes';

export const resolveTerminalTenant = (id: string) => ClientFactory.getTenantClient(id);
const attempts = new Map<string, { count: number; until: number }>();
export function rateLimit(key: string, max: number, increment = true) {
  const now = Date.now();
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  if (attempts.size > 10000 && !attempts.has(key))
    fail(429, 'RATE_LIMITED', 'Demasiadas solicitudes. Espera un minuto.');
  let entry = attempts.get(key);
  if (!entry || entry.until < now) {
    entry = { count: 0, until: now + 60000 };
    attempts.set(key, entry);
  }
  if (increment) entry.count++;
  if (entry.count > max) fail(429, 'RATE_LIMITED', 'Demasiadas solicitudes. Espera un minuto.');
}
export async function authenticateTerminal(
  req: any,
  resolver = resolveTerminalTenant,
): Promise<Terminal> {
  const tenant = req.headers['x-tenant-id'];
  const kioskToken = req.headers['x-kiosk-token'];
  const deviceToken = req.headers['x-device-token'];
  if (
    typeof tenant !== 'string' ||
    tenant.length > 100 ||
    !tenant ||
    !!kioskToken === !!deviceToken
  )
    fail(401, 'TERMINAL_UNAUTHORIZED', 'Terminal no autorizado.');
  const token = kioskToken || deviceToken;
  if (typeof token !== 'string' || token.length > 200)
    fail(401, 'TERMINAL_UNAUTHORIZED', 'Terminal no autorizado.');
  let client: any;
  try {
    client = await resolver(tenant);
  } catch {
    fail(401, 'TERMINAL_UNAUTHORIZED', 'Terminal no autorizado.');
  }
  const kind = kioskToken ? 'kiosk' : 'device';
  const table = kind === 'kiosk' ? schema.timeclockKiosks : schema.timeclockDevices;
  const condition =
    kind === 'kiosk'
      ? eq(schema.timeclockKiosks.token, token)
      : eq(schema.timeclockDevices.tokenHash, hashSecret(token));
  const [row] = await client
    .select()
    .from(table)
    .where(and(condition, eq(table.isActive, true)));
  if (!row) fail(401, 'TERMINAL_UNAUTHORIZED', 'Terminal no autorizado.');
  req.tenantClient = client;
  req.tenantId = tenant;
  return { tenantId: tenant, actorKey: `${kind}:${row.id}`, kind, row };
}
export async function validateTerminal(tx: any, terminal: Terminal) {
  const table = terminal.kind === 'kiosk' ? schema.timeclockKiosks : schema.timeclockDevices;
  const [row] = await tx.select().from(table).where(eq(table.id, terminal.row.id)).for('share');
  if (
    !row?.isActive ||
    (terminal.kind === 'kiosk'
      ? row.token !== terminal.row.token
      : row.tokenHash !== terminal.row.tokenHash)
  )
    fail(401, 'TERMINAL_UNAUTHORIZED', 'Terminal no autorizado.');
  if (
    terminal.kind === 'device' &&
    (row.mode !== terminal.row.mode || row.kioskId !== terminal.row.kioskId)
  )
    fail(409, 'REQUEST_CONFLICT', 'La configuración del lector ha cambiado.');
}
export function sendTimeclockError(res: Response, error: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (error instanceof TimeclockError) {
    if (error.statusCode === 429)
      res.setHeader('Retry-After', error.code === 'TOO_SOON' ? '5' : '60');
    return res.status(error.statusCode).json({
      code: error.code,
      error: error.message,
      retryable: error.retryable || error.statusCode === 429,
    });
  }
  if (error?.code === '23505' || error?.cause?.code === '23505')
    return res.status(409).json({
      code: 'CREDENTIAL_CONFLICT',
      error: 'Esta credencial ya está asignada.',
      retryable: false,
    });
  return res.status(503).json({
    code: 'TEMPORARILY_UNAVAILABLE',
    error: 'No se pudo completar la operación. Inténtalo de nuevo.',
    retryable: true,
  });
}
