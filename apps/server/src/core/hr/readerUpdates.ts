import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { systemConfigs } from '../../db/schema';
import {
  FIRMWARE_BOARD,
  getFirmwareBinary,
  getFirmwareRelease,
  validFirmwareVersion,
} from './readerFirmware';
import { fail } from './timeclockTypes';

export type ReaderUpdate = {
  id: string;
  version: string;
  status: 'pending' | 'installed' | 'failed' | 'cancelled';
  requestedAt: string;
  sha256: string;
  size: number;
  board: string;
};
export type ReaderFirmwareState = {
  currentVersion?: string;
  board?: string;
  lastReportedAt?: string;
  update?: ReaderUpdate;
};
const stateKey = (id: string) => `hr.reader.firmware.${id}`;
async function write(client: any, id: string, state: ReaderFirmwareState) {
  await client
    .insert(systemConfigs)
    .values({
      id: crypto.randomUUID(),
      key: stateKey(id),
      value: JSON.stringify(state),
      description: 'Actualización de firmware del lector',
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemConfigs.key,
      set: { value: JSON.stringify(state), updatedAt: new Date() },
    });
}
export async function readerFirmwareState(client: any, id: string): Promise<ReaderFirmwareState> {
  const [row] = await client
    .select({ value: systemConfigs.value })
    .from(systemConfigs)
    .where(eq(systemConfigs.key, stateKey(id)));
  return row ? JSON.parse(row.value) : {};
}
// Serialize commands and reports for a reader, including when no configuration row exists yet.
export async function mutateReaderFirmware(
  client: any,
  id: string,
  mutate: (state: ReaderFirmwareState) => Promise<ReaderFirmwareState> | ReaderFirmwareState,
) {
  const { sql } = await import('drizzle-orm');
  return client.transaction(async (tx: any) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${stateKey(id)}))`);
    const state = await mutate(await readerFirmwareState(tx, id));
    await write(tx, id, state);
    return state;
  });
}
export function applyFirmwareReport(
  state: ReaderFirmwareState,
  version: unknown,
  board: unknown,
  failed: unknown,
): ReaderFirmwareState {
  if (!validFirmwareVersion(version) || board !== FIRMWARE_BOARD) return state;
  const next = {
    ...state,
    currentVersion: version,
    board,
    lastReportedAt: new Date().toISOString(),
  };
  if (next.update?.status === 'pending') {
    if (version === next.update.version) next.update = { ...next.update, status: 'installed' };
    else if (failed === next.update.id) next.update = { ...next.update, status: 'failed' };
  }
  return next;
}
export async function requestReaderUpdate(client: any, id: string, version: string) {
  const release = await getFirmwareRelease();
  if (release.version !== version)
    fail(409, 'FIRMWARE_CHANGED', 'Hay una versión nueva. Vuelve a consultar las actualizaciones.');
  await getFirmwareBinary(version, 'firmware.bin');
  return mutateReaderFirmware(client, id, (state) => {
    if (!state.currentVersion || state.board !== FIRMWARE_BOARD)
      fail(409, 'USB_REQUIRED', 'Primero actualiza este lector por USB para habilitar Wi-Fi.');
    const cmp = version.localeCompare(state.currentVersion, undefined, { numeric: true });
    if (cmp <= 0)
      fail(409, 'ALREADY_INSTALLED', 'El lector ya tiene esta versión o una posterior.');
    if (state.update?.status === 'pending')
      fail(409, 'UPDATE_PENDING', 'El lector ya tiene una actualización pendiente.');
    const firmware = release.assets.find((a) => a.name === 'firmware.bin')!;
    return {
      ...state,
      update: {
        id: crypto.randomUUID(),
        version,
        board: release.board,
        sha256: firmware.sha256,
        size: firmware.size,
        status: 'pending',
        requestedAt: new Date().toISOString(),
      },
    };
  });
}
