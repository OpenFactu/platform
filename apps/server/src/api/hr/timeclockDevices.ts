import { Router } from 'express';
import crypto from 'crypto';
import { eq, and, isNull } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { hashSecret } from '../../core/hr/timeclockCredentials';
import { fail } from '../../core/hr/timeclockTypes';
import { sendTimeclockError } from '../../core/hr/timeclockTerminals';
import { getFirmwareRelease, getFirmwareBinary } from '../../core/hr/readerFirmware';
import {
  readerFirmwareState,
  requestReaderUpdate,
  mutateReaderFirmware,
} from '../../core/hr/readerUpdates';

const router = Router();
const publicRow = (row: any) => {
  const { tokenHash, ...safe } = row;
  return safe;
};
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
router.get('/firmware/latest', async (_req, res) => {
  try {
    res.json(await getFirmwareRelease());
  } catch (e) {
    sendTimeclockError(res, e);
  }
});
router.get('/firmware/:version/:file', async (req, res) => {
  try {
    res
      .type('application/octet-stream')
      .send(await getFirmwareBinary(req.params.version, req.params.file));
  } catch (e) {
    sendTimeclockError(res, e);
  }
});
async function requireReader(req: any) {
  const [row] = await req.tenantClient
    .select()
    .from(schema.timeclockDevices)
    .where(eq(schema.timeclockDevices.id, req.params.id));
  if (!row) fail(404, 'NOT_FOUND', 'Lector no encontrado.');
  return row;
}
router.get('/:id/firmware', async (req: any, res) => {
  try {
    await requireReader(req);
    res.json(await readerFirmwareState(req.tenantClient, req.params.id));
  } catch (e) {
    sendTimeclockError(res, e);
  }
});
router.post('/:id/firmware', async (req: any, res) => {
  try {
    const row = await requireReader(req);
    if (!row.isActive) fail(409, 'DEVICE_DISABLED', 'Activa el lector antes de actualizarlo.');
    res.json(await requestReaderUpdate(req.tenantClient, row.id, req.body?.version));
  } catch (e) {
    sendTimeclockError(res, e);
  }
});
router.post('/:id/firmware/cancel', async (req: any, res) => {
  try {
    await requireReader(req);
    res.json(
      await mutateReaderFirmware(req.tenantClient, req.params.id, (state) => ({
        ...state,
        update:
          state.update?.status === 'pending'
            ? { ...state.update, status: 'cancelled' }
            : state.update,
      })),
    );
  } catch (e) {
    sendTimeclockError(res, e);
  }
});
router.get('/', async (req: any, res) => {
  try {
    res.json((await req.tenantClient.select().from(schema.timeclockDevices)).map(publicRow));
  } catch (e) {
    sendTimeclockError(res, e);
  }
});
async function validate(client: any, data: any) {
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 100)
    fail(400, 'INVALID_INPUT', 'Nombre obligatorio, máximo 100 caracteres.');
  if (!['paired', 'standalone'].includes(data.mode))
    fail(400, 'INVALID_INPUT', 'Selecciona el modo del lector.');
  if (data.location != null && (typeof data.location !== 'string' || data.location.length > 200))
    fail(400, 'INVALID_INPUT', 'Ubicación inválida.');
  if (typeof data.isActive !== 'boolean') fail(400, 'INVALID_INPUT', 'Estado inválido.');
  if (data.mode === 'paired') {
    const [kiosk] = await client
      .select()
      .from(schema.timeclockKiosks)
      .where(
        and(
          eq(schema.timeclockKiosks.id, data.kioskId || ''),
          eq(schema.timeclockKiosks.isActive, true),
        ),
      )
      .for('share');
    if (!kiosk) fail(400, 'INVALID_INPUT', 'Selecciona un kiosco activo de esta empresa.');
  }
  return {
    name: data.name.trim(),
    location: data.location || null,
    mode: data.mode,
    kioskId: data.mode === 'paired' ? data.kioskId : null,
    isActive: data.isActive,
  };
}
router.post('/', async (req: any, res) => {
  try {
    const token = crypto.randomBytes(32).toString('base64url');
    const row = await req.tenantClient.transaction(async (tx: any) => {
      const data = await validate(tx, { ...req.body, isActive: true });
      const [row] = await tx
        .insert(schema.timeclockDevices)
        .values({ ...data, id: crypto.randomUUID(), tokenHash: hashSecret(token) })
        .returning();
      return row;
    });
    res.json({ ...publicRow(row), token });
  } catch (e) {
    sendTimeclockError(res, e);
  }
});
router.patch('/:id', async (req: any, res) => {
  try {
    const row = await req.tenantClient.transaction(async (tx: any) => {
      const [old] = await tx
        .select()
        .from(schema.timeclockDevices)
        .where(eq(schema.timeclockDevices.id, req.params.id));
      if (!old) fail(404, 'NOT_FOUND', 'Lector no encontrado.');
      const data = await validate(tx, { ...old, ...req.body });
      const [row] = await tx
        .update(schema.timeclockDevices)
        .set(data)
        .where(eq(schema.timeclockDevices.id, old.id))
        .returning();
      if (!data.isActive || data.mode !== old.mode || data.kioskId !== old.kioskId)
        await tx
          .update(schema.timeclockIdentifications)
          .set({ cancelledAt: new Date() })
          .where(
            and(
              eq(schema.timeclockIdentifications.deviceId, old.id),
              isNull(schema.timeclockIdentifications.consumedAt),
              isNull(schema.timeclockIdentifications.cancelledAt),
            ),
          );
      return row;
    });
    res.json(publicRow(row));
  } catch (e) {
    sendTimeclockError(res, e);
  }
});
router.post('/:id/regenerate-token', async (req: any, res) => {
  try {
    const token = crypto.randomBytes(32).toString('base64url');
    const row = await req.tenantClient.transaction(async (tx: any) => {
      const [row] = await tx
        .update(schema.timeclockDevices)
        .set({ tokenHash: hashSecret(token) })
        .where(eq(schema.timeclockDevices.id, req.params.id))
        .returning();
      if (row)
        await tx
          .update(schema.timeclockIdentifications)
          .set({ cancelledAt: new Date() })
          .where(
            and(
              eq(schema.timeclockIdentifications.deviceId, row.id),
              isNull(schema.timeclockIdentifications.consumedAt),
              isNull(schema.timeclockIdentifications.cancelledAt),
            ),
          );
      return row;
    });
    if (!row) fail(404, 'NOT_FOUND', 'Lector no encontrado.');
    res.json({ ...publicRow(row), token });
  } catch (e) {
    sendTimeclockError(res, e);
  }
});
export default router;
