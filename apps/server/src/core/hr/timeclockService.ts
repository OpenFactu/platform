import crypto from 'crypto';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { allowedActions, getWorkState } from './timeclockState';
import { fail, requestId, type PunchKind, type PunchResult } from './timeclockTypes';
import { hashSecret } from './timeclockCredentials';

// Stable JSON avoids treating key order as a different request.
function canonical(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .filter((k) => value[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(',')}}`;
}
export async function withReceipt(
  client: any,
  tenantId: string,
  actorKey: string,
  id: string,
  payload: unknown,
  work: (tx: any) => Promise<any>,
) {
  requestId(id);
  const payloadHash = hashSecret(canonical(payload));
  return client.transaction(async (tx: any) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${actorKey}:${id}`}, 0))`,
    );
    const [receipt] = await tx
      .select()
      .from(schema.timeclockRequests)
      .where(
        and(
          eq(schema.timeclockRequests.actorKey, actorKey),
          eq(schema.timeclockRequests.requestId, id),
        ),
      );
    if (receipt) {
      if (receipt.payloadHash !== payloadHash)
        fail(409, 'REQUEST_CONFLICT', 'Esta petición ya se utilizó con otros datos.');
      return { ...receipt.responseJson, replayed: true };
    }
    const response = await work(tx);
    await tx.insert(schema.timeclockRequests).values({
      id: crypto.randomUUID(),
      actorKey,
      requestId: id,
      payloadHash,
      responseJson: JSON.parse(JSON.stringify(response)),
      expiresAt: new Date(Date.now() + 86400000),
    });
    // Purge only a bounded batch; requests remain durable across server restarts.
    await tx.execute(
      sql`DELETE FROM "TimeclockRequest" WHERE id IN (SELECT id FROM "TimeclockRequest" WHERE "expiresAt" < now() ORDER BY "expiresAt" LIMIT 50)`,
    );
    await tx.execute(
      sql`DELETE FROM "TimeclockIdentification" WHERE id IN (SELECT id FROM "TimeclockIdentification" WHERE "expiresAt" < now() - interval '1 day' ORDER BY "expiresAt" LIMIT 50 FOR UPDATE SKIP LOCKED)`,
    );
    return response;
  });
}
export interface PunchInput {
  tenantId: string;
  actorKey: string;
  requestId: string;
  employeeId: string;
  userId?: string;
  kind: PunchKind;
  method: string;
  source: 'web' | 'kiosk' | 'admin';
  kioskId?: string;
  deviceId?: string;
  device?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  identificationId?: string;
}
export async function insertPunch(
  tx: any,
  input: PunchInput,
  validate?: (tx: any) => Promise<void>,
): Promise<PunchResult> {
  const [employee] = await tx
    .select({ id: schema.employees.id, status: schema.employees.status })
    .from(schema.employees)
    .where(eq(schema.employees.id, input.employeeId))
    .for('update');
  if (!employee || employee.status !== 'active')
    fail(403, 'EMPLOYEE_INACTIVE', 'El empleado no está activo.');
  if (validate) await validate(tx);
  const now = new Date();
  const state = await getWorkState(tx, input.employeeId, now);
  if (!allowedActions(state).includes(input.kind))
    fail(
      409,
      'INVALID_TRANSITION',
      'El estado ha cambiado o esta acción no está disponible. Actualiza e inténtalo de nuevo.',
    );
  const recent = await tx
    .select({ id: schema.timeclockEntries.id })
    .from(schema.timeclockEntries)
    .where(
      and(
        eq(schema.timeclockEntries.employeeId, input.employeeId),
        gte(schema.timeclockEntries.at, new Date(now.getTime() - 5000)),
        lte(schema.timeclockEntries.at, now),
      ),
    )
    .limit(1);
  if (recent.length) fail(429, 'TOO_SOON', 'Acabas de fichar. Espera cinco segundos.');
  for (const [v, max] of [
    [input.latitude, 90],
    [input.longitude, 180],
  ])
    if (v != null && (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > max))
      fail(400, 'INVALID_INPUT', 'Coordenadas inválidas.');
  const [entry] = await tx
    .insert(schema.timeclockEntries)
    .values({
      id: crypto.randomUUID(),
      employeeId: input.employeeId,
      userId: input.userId || null,
      kind: input.kind,
      at: now,
      source: input.source,
      method: input.method,
      kioskId: input.kioskId || null,
      deviceId: input.deviceId || null,
      device: input.device || null,
      notes: input.notes || null,
      latitude: input.latitude == null ? null : String(input.latitude),
      longitude: input.longitude == null ? null : String(input.longitude),
    })
    .returning();
  const next =
    input.kind === 'out' ? 'closed' : input.kind === 'break_start' ? 'on_break' : 'working';
  return { entry, state: next, allowedActions: allowedActions(next), replayed: false };
}
export async function createPunch(
  client: any,
  input: PunchInput,
  validate?: (tx: any) => Promise<void>,
): Promise<PunchResult> {
  return withReceipt(
    client,
    input.tenantId,
    input.actorKey,
    input.requestId,
    { operation: 'punch', ...input },
    (tx) => insertPunch(tx, input, validate),
  );
}
