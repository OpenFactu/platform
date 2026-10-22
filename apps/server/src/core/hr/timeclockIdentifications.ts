import crypto from 'crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { allowedActions, getWorkState } from './timeclockState';
import { resolveCredential } from './timeclockCredentials';
import { insertPunch, withReceipt } from './timeclockService';
import { validateTerminal } from './timeclockTerminals';
import { fail, type Terminal, type PunchKind } from './timeclockTypes';

export async function identificationView(client: any, row: any) {
  const [employee] = await client
    .select({ firstName: schema.employees.firstName, lastName: schema.employees.lastName })
    .from(schema.employees)
    .where(eq(schema.employees.id, row.employeeId));
  const state = await getWorkState(client, row.employeeId);
  return {
    identificationId: row.id,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    state,
    allowedActions: allowedActions(state),
    expiresAt: row.expiresAt,
  };
}
export async function identifyForKiosk(
  client: any,
  terminal: Terminal,
  id: string,
  method: string,
  value: unknown,
) {
  const kioskId = terminal.kind === 'device' ? terminal.row.kioskId : terminal.row.id;
  return withReceipt(
    client,
    terminal.tenantId,
    terminal.actorKey,
    id,
    { operation: 'identify', method, value },
    async (tx) => {
      const [kiosk] = await tx
        .select()
        .from(schema.timeclockKiosks)
        .where(eq(schema.timeclockKiosks.id, kioskId))
        .for('update');
      if (!kiosk?.isActive) fail(401, 'TERMINAL_UNAUTHORIZED', 'Kiosco no autorizado.');
      await validateTerminal(tx, terminal);
      const active = await tx
        .select({ id: schema.timeclockIdentifications.id })
        .from(schema.timeclockIdentifications)
        .where(
          and(
            eq(schema.timeclockIdentifications.kioskId, kioskId),
            gt(schema.timeclockIdentifications.expiresAt, new Date()),
            isNull(schema.timeclockIdentifications.consumedAt),
            isNull(schema.timeclockIdentifications.cancelledAt),
          ),
        )
        .limit(1);
      if (active.length) fail(409, 'KIOSK_BUSY', 'El kiosco está atendiendo a otra persona.');
      const { employee, credentialId } = await resolveCredential(tx, method, value);
      await tx
        .select({ id: schema.employees.id })
        .from(schema.employees)
        .where(eq(schema.employees.id, employee.id))
        .for('update');
      const checked = await resolveCredential(tx, method, value, true);
      if (checked.employee.id !== employee.id || checked.credentialId !== credentialId)
        fail(409, 'REQUEST_CONFLICT', 'La credencial ha cambiado.');
      const [row] = await tx
        .insert(schema.timeclockIdentifications)
        .values({
          id: crypto.randomUUID(),
          kioskId,
          deviceId: terminal.kind === 'device' ? terminal.row.id : null,
          employeeId: employee.id,
          credentialId,
          method,
          expiresAt: new Date(Date.now() + 30000),
        })
        .returning();
      return identificationView(tx, row);
    },
  );
}
export async function confirmIdentification(
  client: any,
  terminal: Terminal,
  id: string,
  identificationId: string,
  kind: PunchKind,
) {
  return withReceipt(
    client,
    terminal.tenantId,
    terminal.actorKey,
    id,
    { operation: 'confirm', identificationId, kind },
    async (tx) => {
      // Lock order shared with administration: kiosk, device, employee, credential, identification.
      await validateTerminal(tx, terminal);
      const [row] = await tx
        .select()
        .from(schema.timeclockIdentifications)
        .where(
          and(
            eq(schema.timeclockIdentifications.id, identificationId),
            eq(schema.timeclockIdentifications.kioskId, terminal.row.id),
          ),
        );
      if (!row) fail(404, 'NOT_FOUND', 'Identificación no encontrada.');
      if (row.deviceId) {
        const [device] = await tx
          .select()
          .from(schema.timeclockDevices)
          .where(eq(schema.timeclockDevices.id, row.deviceId))
          .for('share');
        if (!device?.isActive || device.mode !== 'paired' || device.kioskId !== row.kioskId)
          fail(410, 'IDENTIFICATION_EXPIRED', 'El lector ya no está vinculado a este kiosco.');
      }
      const result = await insertPunch(
        tx,
        {
          tenantId: terminal.tenantId,
          actorKey: terminal.actorKey,
          requestId: id,
          employeeId: row.employeeId,
          kind,
          method: row.method,
          source: 'kiosk',
          kioskId: row.kioskId,
          deviceId: row.deviceId,
          device: terminal.row.name,
        },
        async () => {
          if (row.credentialId) {
            const [credential] = await tx
              .select()
              .from(schema.timeclockCredentials)
              .where(eq(schema.timeclockCredentials.id, row.credentialId))
              .for('share');
            if (!credential || credential.revokedAt)
              fail(
                410,
                'IDENTIFICATION_EXPIRED',
                'Identificación caducada. Identifícate de nuevo.',
              );
          }
          const [current] = await tx
            .select()
            .from(schema.timeclockIdentifications)
            .where(eq(schema.timeclockIdentifications.id, row.id))
            .for('update');
          if (
            current.cancelledAt ||
            current.consumedAt ||
            current.expiresAt.getTime() <= Date.now()
          )
            fail(410, 'IDENTIFICATION_EXPIRED', 'Identificación caducada. Identifícate de nuevo.');
        },
      );
      await tx
        .update(schema.timeclockIdentifications)
        .set({ consumedAt: new Date() })
        .where(eq(schema.timeclockIdentifications.id, row.id));
      return result;
    },
  );
}
