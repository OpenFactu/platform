import jwt from 'jsonwebtoken';
import { messagingTicketSecret } from '../../api/messaging';

/**
 * La mensajería de una empresa para sus copias: el ERP no toca el esquema
 * `messaging`, se la pide al servicio (`apps/messaging`, rutas `/internal`) con
 * un token de un minuto para esa empresa.
 */
const SERVICE_URL = () => (process.env.MESSAGING_URL || 'http://localhost:3100').replace(/\/$/, '');

function serviceToken(tenantId: string): string {
  const secret = messagingTicketSecret();
  if (!secret) throw new Error('Falta MESSAGING_TICKET_SECRET');
  return jwt.sign({ tid: tenantId }, secret, {
    algorithm: 'HS256',
    audience: 'keirost-messaging-internal',
    issuer: 'keirost-erp',
    expiresIn: 60,
  });
}

async function failure(res: Response): Promise<Error> {
  const text = await res.text().catch(() => '');
  return new Error(`La mensajería respondió ${res.status}: ${text.slice(0, 200)}`);
}

export async function exportMessaging(tenantId: string): Promise<Buffer> {
  const res = await fetch(`${SERVICE_URL()}/internal/tenants/${tenantId}/export`, {
    headers: { Authorization: `Bearer ${serviceToken(tenantId)}` },
  });
  if (!res.ok) throw await failure(res);
  return Buffer.from(await res.arrayBuffer());
}

export async function importMessaging(tenantId: string, data: Buffer): Promise<void> {
  const res = await fetch(`${SERVICE_URL()}/internal/tenants/${tenantId}/import`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceToken(tenantId)}`,
      'Content-Type': 'application/json',
    },
    body: new Uint8Array(data),
  });
  if (!res.ok) throw await failure(res);
}
