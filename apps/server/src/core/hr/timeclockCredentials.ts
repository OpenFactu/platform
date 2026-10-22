import crypto from 'crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import QRCode from 'qrcode';
import * as schema from '../../db/schema';
import { encryptConfigSecret, decryptConfigSecret } from '../config/secretCrypto';
import { fail } from './timeclockTypes';

export const hashSecret = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');
export function normalizeRfidUid(value: unknown): string {
  if (typeof value !== 'string' || value.length > 40)
    fail(400, 'INVALID_INPUT', 'UID de tarjeta inválido.');
  const text = value.trim();
  if (!/^(?:[a-f\d]{2})+$|^[a-f\d]{2}(?::[a-f\d]{2})+$|^[a-f\d]{2}(?: [a-f\d]{2})+$/i.test(text))
    fail(400, 'INVALID_INPUT', 'UID de tarjeta inválido.');
  const uid = text.replace(/[: ]/g, '').toUpperCase();
  if (![8, 14, 20].includes(uid.length)) fail(400, 'INVALID_INPUT', 'UID de tarjeta inválido.');
  return uid;
}
export function parseQr(value: unknown): string {
  if (typeof value !== 'string' || !/^ofc:timeclock:v1:[A-Za-z0-9_-]{43}$/.test(value))
    fail(400, 'INVALID_INPUT', 'Este QR no es una credencial de fichaje.');
  const token = value.slice('ofc:timeclock:v1:'.length);
  if (Buffer.from(token, 'base64url').toString('base64url') !== token)
    fail(400, 'INVALID_INPUT', 'QR inválido.');
  return token;
}
export async function resolveCredential(client: any, method: string, value: unknown, lock = false) {
  let employeeId: string;
  let credentialId: string | null = null;
  if (method === 'pin') {
    if (typeof value !== 'string' || !/^\d{4,8}$/.test(value))
      fail(400, 'INVALID_INPUT', 'Introduce un PIN de 4 a 8 dígitos.');
    const rows = await client
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(and(eq(schema.employees.kioskPin, value), eq(schema.employees.status, 'active')))
      .limit(2);
    if (rows.length !== 1)
      fail(
        404,
        'CREDENTIAL_NOT_RECOGNIZED',
        'No se reconoce la credencial. Consulta con tu responsable.',
      );
    employeeId = rows[0].id;
  } else {
    const secret =
      method === 'rfid'
        ? normalizeRfidUid(value)
        : method === 'qr'
          ? parseQr(value)
          : fail(400, 'INVALID_INPUT', 'Método inválido.');
    const query = client
      .select()
      .from(schema.timeclockCredentials)
      .where(
        and(
          eq(schema.timeclockCredentials.kind, method),
          eq(schema.timeclockCredentials.secretHash, hashSecret(secret)),
          isNull(schema.timeclockCredentials.revokedAt),
        ),
      );
    const [credential] = await (lock ? query.for('share') : query);
    if (!credential) fail(404, 'CREDENTIAL_NOT_RECOGNIZED', 'No se reconoce la credencial.');
    employeeId = credential.employeeId;
    credentialId = credential.id;
  }
  const [employee] = await client
    .select({
      id: schema.employees.id,
      firstName: schema.employees.firstName,
      lastName: schema.employees.lastName,
      status: schema.employees.status,
    })
    .from(schema.employees)
    .where(eq(schema.employees.id, employeeId));
  if (!employee || employee.status !== 'active')
    fail(404, 'CREDENTIAL_NOT_RECOGNIZED', 'No se reconoce la credencial.');
  return { employee, credentialId };
}

export async function writeEmployeeWithPin(
  client: any,
  employeeId: string,
  patch: any,
  work: (tx: any) => Promise<any>,
) {
  return client.transaction(async (tx: any) => {
    const [old] = await tx
      .select({ kioskPin: schema.employees.kioskPin, status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, employeeId))
      .for('update');
    const pin = 'kioskPin' in patch ? patch.kioskPin : old?.kioskPin;
    const status = patch.status || old?.status || 'active';
    if (pin != null && (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)))
      fail(400, 'INVALID_INPUT', 'El PIN debe tener entre 4 y 8 dígitos.');
    if (pin && status === 'active') {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`pin:${pin}`}, 0))`);
      const rows = await tx
        .select({ id: schema.employees.id })
        .from(schema.employees)
        .where(and(eq(schema.employees.kioskPin, pin), eq(schema.employees.status, 'active')));
      if (rows.some((row: any) => row.id !== employeeId))
        fail(409, 'PIN_CONFLICT', 'Este PIN ya está asignado a otro empleado activo.');
    }
    const result = await work(tx);
    if (old && (pin !== old.kioskPin || status !== old.status))
      await tx
        .update(schema.timeclockIdentifications)
        .set({ cancelledAt: new Date() })
        .where(
          and(
            eq(schema.timeclockIdentifications.employeeId, employeeId),
            isNull(schema.timeclockIdentifications.consumedAt),
            isNull(schema.timeclockIdentifications.cancelledAt),
          ),
        );
    return result;
  });
}
export async function issueCredential(
  client: any,
  employeeId: string,
  kind: string,
  value: unknown,
  label: string,
) {
  if (!['qr', 'rfid'].includes(kind)) fail(400, 'INVALID_INPUT', 'Tipo de credencial inválido.');
  if (kind === 'qr' && !/^[a-f\d]{64}$/i.test(process.env.CONFIG_ENC_KEY || ''))
    fail(
      503,
      'CONFIGURATION_REQUIRED',
      'Configura CONFIG_ENC_KEY en el servidor para emitir códigos QR.',
    );
  const secret =
    kind === 'qr' ? crypto.randomBytes(32).toString('base64url') : normalizeRfidUid(value);
  return client.transaction(async (tx: any) => {
    const rows = await tx
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(eq(schema.employees.id, employeeId))
      .for('update');
    if (!rows.length) fail(404, 'NOT_FOUND', 'Empleado no encontrado.');
    if (kind === 'qr') {
      await tx
        .update(schema.timeclockCredentials)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.timeclockCredentials.employeeId, employeeId),
            eq(schema.timeclockCredentials.kind, 'qr'),
            isNull(schema.timeclockCredentials.revokedAt),
          ),
        );
      await tx
        .update(schema.timeclockIdentifications)
        .set({ cancelledAt: new Date() })
        .where(
          and(
            eq(schema.timeclockIdentifications.employeeId, employeeId),
            eq(schema.timeclockIdentifications.method, 'qr'),
            isNull(schema.timeclockIdentifications.consumedAt),
            isNull(schema.timeclockIdentifications.cancelledAt),
          ),
        );
    }
    const [row] = await tx
      .insert(schema.timeclockCredentials)
      .values({
        id: crypto.randomUUID(),
        employeeId,
        kind,
        secretHash: hashSecret(secret),
        secretEncrypted: kind === 'qr' ? encryptConfigSecret(secret) : null,
        label: label || (kind === 'qr' ? 'QR personal' : 'Tarjeta'),
      })
      .returning();
    return { id: row.id, label: row.label, kind: row.kind };
  });
}
export async function employeeQr(client: any, employeeId: string) {
  const [row] = await client
    .select()
    .from(schema.timeclockCredentials)
    .where(
      and(
        eq(schema.timeclockCredentials.employeeId, employeeId),
        eq(schema.timeclockCredentials.kind, 'qr'),
        isNull(schema.timeclockCredentials.revokedAt),
      ),
    );
  if (!row)
    fail(404, 'NOT_FOUND', 'Todavía no tienes un QR asignado. Solicítalo a tu responsable.');
  const payload = `ofc:timeclock:v1:${decryptConfigSecret(row.secretEncrypted)}`;
  return {
    qrDataUrl: await QRCode.toDataURL(payload, { width: 320, margin: 2 }),
    label: row.label,
  };
}
