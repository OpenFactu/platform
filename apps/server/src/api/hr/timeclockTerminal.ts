import { Router, type Express } from 'express';
import crypto from 'crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { mountPublic } from '../../core/auth/apiMounts';
import {
  authenticateTerminal,
  rateLimit,
  resolveTerminalTenant,
  sendTimeclockError,
  validateTerminal,
} from '../../core/hr/timeclockTerminals';
import {
  identifyForKiosk,
  identificationView,
  confirmIdentification,
} from '../../core/hr/timeclockIdentifications';
import { resolveCredential } from '../../core/hr/timeclockCredentials';
import { insertPunch, withReceipt } from '../../core/hr/timeclockService';
import { fail, TimeclockError, type PunchKind } from '../../core/hr/timeclockTypes';
import { getKioskAppearance } from '../../core/hr/kioskAppearance';
import { getKioskFeedback, publishKioskFeedback } from '../../core/hr/kioskFeedback';
import {
  getFirmwareBinary,
  validFirmwareVersion,
  FIRMWARE_BOARD,
} from '../../core/hr/readerFirmware';
import {
  readerFirmwareState,
  mutateReaderFirmware,
  applyFirmwareReport,
} from '../../core/hr/readerUpdates';

const kindOf = (value: unknown): PunchKind => {
  if (!value) fail(400, 'ACTION_REQUIRED', 'Selecciona una acción de fichaje.');
  if (!['in', 'out', 'break_start', 'break_end'].includes(String(value)))
    fail(400, 'INVALID_INPUT', 'Acción inválida.');
  return value as PunchKind;
};
export function mountTimeclockTerminals(app: Express, resolver = resolveTerminalTenant) {
  const router = Router();
  router.use(async (req: any, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      // Successful polling is budgeted per terminal, independently of a shared proxy.
      rateLimit(`auth-failures:${req.ip}`, 60, false);
      try {
        req.timeclockTerminal = await authenticateTerminal(req, resolver);
      } catch (error) {
        rateLimit(`auth-failures:${req.ip}`, 60);
        throw error;
      }
      rateLimit(`poll:${req.tenantId}:${req.timeclockTerminal.actorKey}`, 180);
      if (
        req.method === 'POST' &&
        (!req.body ||
          typeof req.body !== 'object' ||
          Array.isArray(req.body) ||
          JSON.stringify(req.body).length > 2048)
      )
        fail(400, 'INVALID_INPUT', 'Petición de terminal inválida.');
      if (req.method !== 'GET')
        rateLimit(`terminal:${req.tenantId}:${req.timeclockTerminal.actorKey}`, 90);
      next();
    } catch (e) {
      sendTimeclockError(res, e);
    }
  });
  const handle =
    (actor: 'device' | 'kiosk', fn: (req: any, res: any) => Promise<any>) =>
    async (req: any, res: any) => {
      try {
        if (req.timeclockTerminal.kind !== actor)
          fail(403, 'WRONG_TERMINAL_MODE', 'Este terminal no puede realizar esta operación.');
        await fn(req, res);
      } catch (e) {
        const terminal = req.timeclockTerminal;
        if (
          actor === 'device' &&
          req.path === '/device/readings' &&
          terminal?.row.mode === 'paired' &&
          terminal.row.kioskId &&
          e instanceof TimeclockError &&
          typeof req.body?.requestId === 'string' &&
          /^[0-9a-f-]{36}$/i.test(req.body.requestId)
        )
          publishKioskFeedback(req.tenantId, terminal.row.kioskId, {
            id: req.body.requestId,
            code: e.code,
          });
        sendTimeclockError(res, e);
      }
    };
  router.get(
    '/kiosk/appearance',
    handle('kiosk', async (req, res) => {
      res.json(await getKioskAppearance(req.tenantClient, req.timeclockTerminal.row.id));
    }),
  );
  router.get(
    '/kiosk/feedback',
    handle('kiosk', async (req, res) => {
      const event = getKioskFeedback(req.tenantId, req.timeclockTerminal.row.id);
      if (!event) return res.status(204).end();
      res.json(event);
    }),
  );
  router.get(
    '/device/config',
    handle('device', async (req, res) => {
      const d = req.timeclockTerminal.row;
      await req.tenantClient
        .update(schema.timeclockDevices)
        .set({ lastSeenAt: new Date() })
        .where(eq(schema.timeclockDevices.id, d.id));
      let firmwareUpdate;
      const version = req.get('x-device-firmware');
      if (validFirmwareVersion(version) && req.get('x-device-board') === FIRMWARE_BOARD) {
        const state = await mutateReaderFirmware(req.tenantClient, d.id, (old) =>
          applyFirmwareReport(
            old,
            version,
            req.get('x-device-board'),
            req.get('x-device-update-failed'),
          ),
        );
        if (state.update?.status === 'pending') {
          const [active] = await req.tenantClient
            .select({ id: schema.timeclockIdentifications.id })
            .from(schema.timeclockIdentifications)
            .where(
              and(
                eq(schema.timeclockIdentifications.kioskId, d.kioskId || ''),
                gt(schema.timeclockIdentifications.expiresAt, new Date()),
                isNull(schema.timeclockIdentifications.cancelledAt),
                isNull(schema.timeclockIdentifications.consumedAt),
              ),
            )
            .limit(1);
          if (!active) firmwareUpdate = state.update;
        }
      }
      res.json({
        protocolVersion: 1,
        deviceId: d.id,
        mode: d.mode,
        kioskId: d.kioskId,
        firmwareUpdate,
      });
    }),
  );
  router.get(
    '/device/firmware/:version',
    handle('device', async (req, res) => {
      const state = await readerFirmwareState(req.tenantClient, req.timeclockTerminal.row.id);
      if (state.update?.status !== 'pending' || state.update.version !== req.params.version)
        fail(409, 'UPDATE_NOT_REQUESTED', 'Esta actualización no está pendiente para este lector.');
      const data = await getFirmwareBinary(req.params.version, 'firmware.bin');
      res.type('application/octet-stream').send(data);
    }),
  );
  router.post(
    '/device/readings',
    handle('device', async (req, res) => {
      const terminal = req.timeclockTerminal;
      if (terminal.row.mode !== 'paired')
        fail(403, 'WRONG_TERMINAL_MODE', 'El lector no está vinculado a un kiosco.');
      const result = await identifyForKiosk(
        req.tenantClient,
        terminal,
        req.body.requestId,
        'rfid',
        req.body.uid,
      );
      res.status(202).json({
        readingId: result.identificationId,
        status: 'awaiting_confirmation',
        expiresAt: result.expiresAt,
        replayed: result.replayed || false,
      });
    }),
  );
  router.post(
    '/device/punch',
    handle('device', async (req, res) => {
      const terminal = req.timeclockTerminal;
      if (terminal.row.mode !== 'standalone')
        fail(403, 'WRONG_TERMINAL_MODE', 'Confirma la acción en el kiosco vinculado.');
      const kind = kindOf(req.body.kind);
      res.json(
        await withReceipt(
          req.tenantClient,
          req.tenantId,
          terminal.actorKey,
          req.body.requestId,
          { operation: 'device-punch', uid: req.body.uid, kind },
          async (tx) => {
            await validateTerminal(tx, terminal);
            const resolved = await resolveCredential(tx, 'rfid', req.body.uid);
            return insertPunch(
              tx,
              {
                tenantId: req.tenantId,
                actorKey: terminal.actorKey,
                requestId: req.body.requestId,
                employeeId: resolved.employee.id,
                kind,
                method: 'rfid',
                source: 'kiosk',
                deviceId: terminal.row.id,
                device: terminal.row.name,
              },
              async () => {
                const again = await resolveCredential(tx, 'rfid', req.body.uid, true);
                if (again.employee.id !== resolved.employee.id)
                  fail(409, 'REQUEST_CONFLICT', 'La tarjeta ha cambiado.');
              },
            );
          },
        ),
      );
    }),
  );
  router.post(
    '/kiosk/identify',
    handle('kiosk', async (req, res) => {
      if (!['pin', 'qr'].includes(req.body.method)) fail(400, 'INVALID_INPUT', 'Método inválido.');
      res.json(
        await identifyForKiosk(
          req.tenantClient,
          req.timeclockTerminal,
          req.body.requestId,
          req.body.method,
          req.body.value,
        ),
      );
    }),
  );
  router.get(
    '/kiosk/identification',
    handle('kiosk', async (req, res) => {
      const [row] = await req.tenantClient
        .select()
        .from(schema.timeclockIdentifications)
        .where(
          and(
            eq(schema.timeclockIdentifications.kioskId, req.timeclockTerminal.row.id),
            gt(schema.timeclockIdentifications.expiresAt, new Date()),
            isNull(schema.timeclockIdentifications.consumedAt),
            isNull(schema.timeclockIdentifications.cancelledAt),
          ),
        )
        .limit(1);
      if (!row) return res.status(204).end();
      res.json(await identificationView(req.tenantClient, row));
    }),
  );
  router.delete(
    '/kiosk/identification/:id',
    handle('kiosk', async (req, res) => {
      await req.tenantClient
        .update(schema.timeclockIdentifications)
        .set({ cancelledAt: new Date() })
        .where(
          and(
            eq(schema.timeclockIdentifications.id, req.params.id),
            eq(schema.timeclockIdentifications.kioskId, req.timeclockTerminal.row.id),
            isNull(schema.timeclockIdentifications.consumedAt),
          ),
        );
      res.status(204).end();
    }),
  );
  router.post(
    '/kiosk/punch',
    handle('kiosk', async (req, res) => {
      res.json(
        await confirmIdentification(
          req.tenantClient,
          req.timeclockTerminal,
          req.body.requestId,
          req.body.identificationId,
          kindOf(req.body.kind),
        ),
      );
    }),
  );
  // Compatibility for existing kiosks, protected only by their own token.
  router.post(
    '/legacy',
    handle('kiosk', async (req, res) => {
      const terminal = req.timeclockTerminal;
      const kind = kindOf(req.body.kind);
      const id = req.body.requestId || crypto.randomUUID();
      res.json(
        await withReceipt(
          req.tenantClient,
          req.tenantId,
          terminal.actorKey,
          id,
          { operation: 'legacy-punch', pin: req.body.pin, kind },
          async (tx) => {
            await validateTerminal(tx, terminal);
            const resolved = await resolveCredential(tx, 'pin', req.body.pin);
            const result = await insertPunch(
              tx,
              {
                tenantId: req.tenantId,
                actorKey: terminal.actorKey,
                requestId: id,
                employeeId: resolved.employee.id,
                kind,
                method: 'pin',
                source: 'kiosk',
                kioskId: terminal.row.id,
                device: terminal.row.name,
              },
              async () => {
                const again = await resolveCredential(tx, 'pin', req.body.pin);
                if (again.employee.id !== resolved.employee.id)
                  fail(409, 'REQUEST_CONFLICT', 'El PIN ha cambiado.');
              },
            );
            return {
              ...result.entry,
              state: result.state,
              allowedActions: result.allowedActions,
              replayed: false,
              employeeName: `${resolved.employee.firstName} ${resolved.employee.lastName}`,
            };
          },
        ),
      );
    }),
  );
  router.use((_req, res) =>
    res.status(404).json({ code: 'NOT_FOUND', error: 'Ruta de terminal no encontrada.' }),
  );
  mountPublic(
    app,
    '/api/hr/timeclock/terminal/v1',
    'terminal autenticado con token propio',
    router,
  );
  const legacy = Router();
  legacy.use((req, _res, next) => {
    req.url = '/legacy';
    next();
  }, router);
  mountPublic(
    app,
    '/api/hr/timeclock/kiosk/punch',
    'compatibilidad kiosco autenticado con token propio',
    legacy,
  );
}
