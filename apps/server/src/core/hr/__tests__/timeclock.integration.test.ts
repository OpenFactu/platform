import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import { mountApi } from '../../auth/apiMounts';
import timeclockRouter from '../../../api/hr/timeclock';

const url = process.env.TIMECLOCK_TEST_DATABASE_URL;
test(
  'fichajes reales: migración, PIN sin sesión, integridad y aislamiento',
  { skip: !url },
  async (t) => {
    assert.match(new URL(url!).pathname, /timeclock_test/);
    const pool = new Pool({ connectionString: url });
    const name = `timeclock_test_${crypto.randomBytes(6).toString('hex')}`;
    const quoted = `"${name}"`;
    const otherName = `${name}_other`;
    const otherPool = new Pool({ connectionString: url, options: `-c search_path=${otherName}` });
    const otherDb = drizzle(otherPool, { schema });
    const connection = await pool.connect();
    await connection.query(`CREATE SCHEMA ${quoted}`);
    await connection.query(`CREATE SCHEMA "${otherName}"`);
    await connection.query(`SET search_path TO ${quoted}`);
    const db = drizzle(connection, { schema });
    let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
    try {
      // Complete legacy columns, without depending on unrelated ERP migrations.
      for (const table of [
        schema.employees,
        schema.timeclockKiosks,
        schema.timeclockEntries,
        schema.systemConfigs,
      ]) {
        const config = getTableConfig(table);
        const columns = config.columns.filter(
          (c) => !['method', 'kioskId', 'deviceId'].includes(c.name),
        );
        await connection.query(
          `CREATE TABLE ${quoted}."${config.name}" (${columns.map((c) => `"${c.name}" ${c.getSQLType()}${c.primary ? ' PRIMARY KEY' : ''}`).join(',')})`,
        );
      }
      await connection.query('CREATE UNIQUE INDEX test_system_config_key ON "SystemConfig" (key)');
      await connection.query(
        `INSERT INTO "Employee" (id,"firstName","lastName",status,"kioskPin","userId") VALUES ('emp','Ana','Prueba','active','1234','user')`,
      );
      await connection.query(
        `INSERT INTO "TimeclockKiosk" (id,name,token,"isActive") VALUES ('kiosk','Recepción','test-kiosk-token',true)`,
      );
      const migration = fs
        .readFileSync(
          path.join(__dirname, '../../tenant/migrations/072_timeclock_credentials_devices.sql'),
          'utf8',
        )
        .replace(/\{\{schema\}\}/g, name);
      await connection.query(migration);
      await connection.query(migration);
      for (const table of [
        schema.employees,
        schema.timeclockKiosks,
        schema.timeclockEntries,
        schema.systemConfigs,
      ]) {
        const tableName = getTableConfig(table).name;
        await connection.query(
          `CREATE TABLE "${otherName}"."${tableName}" (LIKE ${quoted}."${tableName}" INCLUDING ALL)`,
        );
      }
      await otherPool.query(migration.replaceAll(`"${name}"`, `"${otherName}"`));
      await otherPool.query(
        `INSERT INTO "Employee" (id,"firstName","lastName",status,"kioskPin") VALUES ('emp','Otra','Empresa','active','1234')`,
      );
      await otherPool.query(
        `INSERT INTO "TimeclockKiosk" (id,name,token,"isActive") VALUES ('kiosk','Otra empresa','other-kiosk-token',true)`,
      );
      assert.equal(
        (await connection.query('SELECT "kioskPin" FROM "Employee"')).rows[0].kioskPin,
        '1234',
      );

      // Same mounting entry point as production; pre-fix fallback demonstrates the reported 401.
      const app = express();
      app.use(express.json());
      app.use((req: any, _res, next) => {
        req.tenantClient = db;
        req.tenantId = 'tenant-test';
        next();
      });
      let mount: any;
      try {
        mount = require('../../../api/hr/timeclockTerminal').mountTimeclockTerminals;
      } catch {
        /* red baseline */
      }
      if (mount)
        mount(app, async (tenant: string) => {
          if (tenant === 'tenant-other') return otherDb;
          if (tenant !== 'tenant-test') throw new Error('unknown tenant');
          return db;
        });
      mountApi(app, '/api/hr/timeclock', '/hr/timeclock', timeclockRouter);
      server = app.listen(0, '127.0.0.1');
      await new Promise<void>((resolve) => server!.once('listening', resolve));
      const address = server.address() as { port: number };
      const base = `http://127.0.0.1:${address.port}/api/hr/timeclock`;
      const call = async (
        route: string,
        body?: unknown,
        headers: Record<string, string> = {},
        method?: string,
      ) => {
        const response = await fetch(base + route, {
          method: method || (body ? 'POST' : 'GET'),
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': 'tenant-test',
            'x-kiosk-token': 'test-kiosk-token',
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        return {
          status: response.status,
          body: response.status === 204 ? null : ((await response.json()) as any),
        };
      };
      await t.test(
        'firmware: órdenes aisladas, confirmación real y rechazo de descargas no autorizadas',
        async () => {
          const { mutateReaderFirmware, readerFirmwareState } = require('../readerUpdates');
          const { hashSecret } = require('../timeclockCredentials');
          await connection.query(
            `INSERT INTO "TimeclockDevice" (id,name,"tokenHash",mode,"kioskId") VALUES ('fw-reader','Firmware test',$1,'paired','kiosk')`,
            [hashSecret('firmware-test-token')],
          );
          const headers = {
            'x-kiosk-token': '',
            'x-device-token': 'firmware-test-token',
            'x-device-firmware': '0.3.0',
            'x-device-board': 'esp32-devkit-v1-rc522',
          };
          const update = {
            id: crypto.randomUUID(),
            version: '0.3.1',
            board: 'esp32-devkit-v1-rc522',
            size: 1000000,
            sha256: 'a'.repeat(64),
            status: 'pending',
            requestedAt: new Date().toISOString(),
          };
          await mutateReaderFirmware(db, 'fw-reader', () => ({ update }));
          assert.deepEqual(await readerFirmwareState(otherDb, 'fw-reader'), {});
          assert.equal(
            (await call('/terminal/v1/device/config', undefined, headers)).body.firmwareUpdate.id,
            update.id,
          );
          assert.equal(
            (await call('/terminal/v1/device/firmware/0.3.1')).status,
            403,
            'kiosk cannot download device updates',
          );
          assert.equal(
            (await call('/terminal/v1/device/firmware/9.9.9', undefined, headers)).status,
            409,
            'device cannot fetch an unrequested version',
          );
          await call('/terminal/v1/device/config', undefined, {
            ...headers,
            'x-device-firmware': '0.3.1',
          });
          assert.equal((await readerFirmwareState(db, 'fw-reader')).update.status, 'installed');
          assert.equal(
            (await call('/terminal/v1/device/config', undefined, headers)).body.firmwareUpdate,
            undefined,
          );
          await connection.query(`DELETE FROM "TimeclockDevice" WHERE id='fw-reader'`);
        },
      );
      await t.test('PIN válido sin JWT llega a registrar; el token no abre listados', async () => {
        const result = await call('/kiosk/punch', {
          pin: '1234',
          kind: 'in',
          requestId: crypto.randomUUID(),
        });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal(result.body.employeeId, 'emp');
        assert.equal((await call('/entries')).status, 401);
        assert.equal(
          (await call('/kiosk/punch', { pin: '1234', kind: 'out' }, { 'x-tenant-id': 'other' }))
            .status,
          401,
        );
        assert.equal(
          (await call('/kiosk/punch', { pin: '1234', kind: 'out' }, { 'x-kiosk-token': 'wrong' }))
            .status,
          401,
        );
      });
      await connection.query('DELETE FROM "TimeclockEntry"');
      await t.test(
        'dos empresas reales aíslan tokens, empleados con el mismo ID y fichajes',
        async () => {
          const body = { requestId: crypto.randomUUID(), pin: '1234', kind: 'in' };
          assert.equal(
            (await call('/kiosk/punch', body, { 'x-tenant-id': 'tenant-other' })).status,
            401,
          );
          const result = await call('/kiosk/punch', body, {
            'x-tenant-id': 'tenant-other',
            'x-kiosk-token': 'other-kiosk-token',
          });
          assert.equal(result.status, 200, JSON.stringify(result.body));
          assert.equal(result.body.employeeName, 'Otra Empresa');
          assert.equal((await connection.query('SELECT id FROM "TimeclockEntry"')).rowCount, 0);
          assert.equal((await otherPool.query('SELECT id FROM "TimeclockEntry"')).rowCount, 1);
        },
      );
      await t.test(
        'cruzar medianoche conserva el estado dentro de la ventana de 24 horas',
        async () => {
          await connection.query(
            `INSERT INTO "TimeclockEntry" (id,"employeeId",kind,at) VALUES ('midnight','emp','in','2026-09-23T23:55:00Z')`,
          );
          assert.equal(
            await require('../timeclockState').getWorkState(
              db,
              'emp',
              new Date('2026-09-24T00:05:00Z'),
            ),
            'working',
          );
          await connection.query(`DELETE FROM "TimeclockEntry" WHERE id='midnight'`);
        },
      );
      const { createPunch } = require('../timeclockService');
      // Separate pooled connections are required to prove transaction races.
      const concurrentPool = new Pool({ connectionString: url, options: `-c search_path=${name}` });
      const concurrentDb = drizzle(concurrentPool, { schema });
      try {
        const input = {
          employeeId: 'emp',
          userId: 'user',
          actorKey: 'user:user',
          tenantId: 'tenant-test',
          kind: 'in',
          method: 'account',
          source: 'web',
          requestId: crypto.randomUUID(),
        };
        await t.test(
          'reintento idéntico devuelve el mismo evento y contenido distinto da conflicto',
          async () => {
            const results = await Promise.all([
              createPunch(concurrentDb, input),
              createPunch(concurrentDb, input),
            ]);
            assert.equal(results[0].entry.id, results[1].entry.id);
            assert.equal((await connection.query('SELECT * FROM "TimeclockEntry"')).rowCount, 1);
            await assert.rejects(
              createPunch(concurrentDb, { ...input, kind: 'out' }),
              (e: any) => e.code === 'REQUEST_CONFLICT',
            );
          },
        );
        await connection.query('DELETE FROM "TimeclockEntry"');
        await t.test('dos intenciones concurrentes no duplican entradas', async () => {
          const results = await Promise.allSettled([
            createPunch(concurrentDb, { ...input, requestId: crypto.randomUUID() }),
            createPunch(concurrentDb, { ...input, requestId: crypto.randomUUID() }),
          ]);
          assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
          assert.equal((await connection.query('SELECT * FROM "TimeclockEntry"')).rowCount, 1);
        });
      } finally {
        await concurrentPool.end();
      }
      await t.test('PIN ambiguo no atribuye el fichaje al primer empleado', async () => {
        await connection.query(
          `INSERT INTO "Employee" (id,"firstName","lastName",status,"kioskPin") VALUES ('other','Otra','Persona','active','1234')`,
        );
        assert.equal(
          (
            await call('/terminal/v1/kiosk/identify', {
              requestId: crypto.randomUUID(),
              method: 'pin',
              value: '1234',
            })
          ).status,
          404,
        );
        await connection.query(`DELETE FROM "Employee" WHERE id='other'`);
      });
      await t.test('identificar no ficha, cancelar y caducar impiden confirmar', async () => {
        const count = (await connection.query('SELECT * FROM "TimeclockEntry"')).rowCount;
        const identified = await call('/terminal/v1/kiosk/identify', {
          requestId: crypto.randomUUID(),
          method: 'pin',
          value: '1234',
        });
        assert.equal(identified.status, 200, JSON.stringify(identified.body));
        assert.equal((await connection.query('SELECT * FROM "TimeclockEntry"')).rowCount, count);
        const id = identified.body.identificationId;
        await connection.query(
          `UPDATE "TimeclockIdentification" SET "expiresAt" = now() - interval '1 minute' WHERE id=$1`,
          [id],
        );
        assert.equal(
          (
            await call('/terminal/v1/kiosk/punch', {
              requestId: crypto.randomUUID(),
              identificationId: id,
              kind: 'out',
            })
          ).status,
          410,
        );
      });
      await t.test(
        'gestión de lectores oculta secretos, exige permiso y valida su vínculo',
        async () => {
          const deviceRouter = require('../../../api/hr/timeclockDevices').default;
          const adminApp = express();
          adminApp.use(express.json());
          adminApp.use((req: any, _res, next) => {
            req.tenantClient = db;
            req.tenantId = 'tenant-test';
            if (req.headers['x-test-admin']) req.user = { id: 'admin', role: 'ADMIN' };
            next();
          });
          mountApi(adminApp, '/devices', '/hr/kiosks', deviceRouter);
          const adminServer = adminApp.listen(0, '127.0.0.1');
          await new Promise<void>((resolve) => adminServer.once('listening', resolve));
          const endpoint = `http://127.0.0.1:${(adminServer.address() as any).port}/devices`;
          try {
            assert.equal((await fetch(endpoint)).status, 401);
            const invalid = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-test-admin': '1' },
              body: JSON.stringify({ name: 'Lector', mode: 'paired', kioskId: 'missing' }),
            });
            assert.equal(invalid.status, 400);
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-test-admin': '1' },
              body: JSON.stringify({ name: 'Lector', mode: 'standalone' }),
            });
            assert.equal(response.status, 200);
            const created: any = await response.json();
            assert.ok(created.token);
            const listed: any = await (
              await fetch(endpoint, { headers: { 'x-test-admin': '1' } })
            ).json();
            assert.equal(listed[0].token, undefined);
            assert.equal(listed[0].tokenHash, undefined);
            const { issueCredential } = require('../timeclockCredentials');
            await issueCredential(db, 'emp', 'rfid', '04A1B2C3', 'Tarjeta');
            const headers = { 'x-kiosk-token': '', 'x-device-token': created.token };
            assert.equal(
              (
                await call(
                  '/terminal/v1/device/punch',
                  { requestId: crypto.randomUUID(), uid: '04A1B2C3' },
                  headers,
                )
              ).status,
              400,
            );
            await connection.query('DELETE FROM "TimeclockEntry"');
            const body = { requestId: crypto.randomUUID(), uid: '04A1B2C3', kind: 'in' };
            const first = await call('/terminal/v1/device/punch', body, headers);
            assert.equal(first.status, 200, JSON.stringify(first.body));
            const second = await call('/terminal/v1/device/punch', body, headers);
            assert.equal(second.body.entry.id, first.body.entry.id);
            await connection.query(`UPDATE "TimeclockDevice" SET name='Nuevo nombre' WHERE id=$1`, [
              created.id,
            ]);
            const renamed = await call('/terminal/v1/device/punch', body, headers);
            assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
            assert.equal(renamed.body.entry.id, first.body.entry.id);
            await require('../timeclockCredentials').issueCredential(
              db,
              'emp',
              'rfid',
              '04A1B2C4',
              'Otra tarjeta',
            );
            assert.equal(
              (await call('/terminal/v1/device/punch', { ...body, uid: '04A1B2C4' }, headers))
                .status,
              409,
            );
          } finally {
            await new Promise<void>((resolve) => adminServer.close(() => resolve()));
          }
        },
      );
      await t.test(
        'QR revocado y lector desvinculado no confirman una identificación anterior',
        async () => {
          const { issueCredential, resolveCredential } = require('../timeclockCredentials');
          const { decryptConfigSecret } = require('../../config/secretCrypto');
          const previousKey = process.env.CONFIG_ENC_KEY;
          process.env.CONFIG_ENC_KEY = '11'.repeat(32);
          try {
            await issueCredential(db, 'emp', 'qr', null, 'QR');
            const row = (
              await connection.query(
                `SELECT * FROM "TimeclockCredential" WHERE kind='qr' AND "revokedAt" IS NULL`,
              )
            ).rows[0];
            const qr = `ofc:timeclock:v1:${decryptConfigSecret(row.secretEncrypted)}`;
            const session = await call('/terminal/v1/kiosk/identify', {
              requestId: crypto.randomUUID(),
              method: 'qr',
              value: qr,
            });
            assert.equal(session.status, 200, JSON.stringify(session.body));
            await connection.query(
              `UPDATE "TimeclockCredential" SET "revokedAt"=now() WHERE id=$1`,
              [row.id],
            );
            assert.equal(
              (
                await call('/terminal/v1/kiosk/punch', {
                  requestId: crypto.randomUUID(),
                  identificationId: session.body.identificationId,
                  kind: 'out',
                })
              ).status,
              410,
            );
            await assert.rejects(resolveCredential(db, 'qr', qr));
            await connection.query('DELETE FROM "TimeclockIdentification"');
            const { hashSecret } = require('../timeclockCredentials');
            await connection.query(
              `INSERT INTO "TimeclockDevice" (id,name,"tokenHash",mode,"kioskId") VALUES ('paired','Puerta',$1,'paired','kiosk')`,
              [hashSecret('paired-token')],
            );
            const headers = { 'x-kiosk-token': '', 'x-device-token': 'paired-token' };
            const read = { requestId: crypto.randomUUID(), uid: '04A1B2C3' };
            const reading = await call('/terminal/v1/device/readings', read, headers);
            assert.equal(reading.status, 202, JSON.stringify(reading.body));
            assert.equal(
              (await call('/terminal/v1/device/readings', read, headers)).body.readingId,
              reading.body.readingId,
            );
            const current = await call('/terminal/v1/kiosk/identification');
            assert.equal(current.body.identificationId, reading.body.readingId);
            await connection.query(
              `UPDATE "TimeclockDevice" SET "isActive"=false WHERE id='paired'`,
            );
            assert.equal(
              (
                await call('/terminal/v1/kiosk/punch', {
                  requestId: crypto.randomUUID(),
                  identificationId: reading.body.readingId,
                  kind: 'out',
                })
              ).status,
              410,
            );
            assert.equal(
              (await call('/terminal/v1/device/config', undefined, headers)).status,
              401,
            );
          } finally {
            if (previousKey === undefined) delete process.env.CONFIG_ENC_KEY;
            else process.env.CONFIG_ENC_KEY = previousKey;
          }
        },
      );
      await t.test(
        'asignar un PIN repetido desde administración falla y deja los datos intactos',
        async () => {
          const { writeEmployeeWithPin } = require('../timeclockCredentials');
          await connection.query(
            `INSERT INTO "Employee" (id,"firstName","lastName",status,"kioskPin") VALUES ('other','Otra','Persona','active','5678')`,
          );
          await assert.rejects(
            writeEmployeeWithPin(db, 'other', { kioskPin: '1234' }, async (tx: any) =>
              tx
                .update(schema.employees)
                .set({ kioskPin: '1234' })
                .where(sql`id='other'`),
            ),
            (e: any) => e.code === 'PIN_CONFLICT',
          );
          assert.equal(
            (await connection.query(`SELECT "kioskPin" FROM "Employee" WHERE id='other'`)).rows[0]
              .kioskPin,
            '5678',
          );
        },
      );
      await t.test(
        'desactivar y reactivar un lector no revive la identificación; revocar libera el kiosco',
        async () => {
          const admin = express();
          admin.use(express.json());
          admin.use((req: any, _res, next) => {
            req.tenantClient = db;
            next();
          });
          admin.use('/devices', require('../../../api/hr/timeclockDevices').default);
          admin.use('/credentials', require('../../../api/hr/timeclockCredentials').default);
          admin.use('/kiosks', require('../../../api/hr/kiosks').default);
          const management = admin.listen(0, '127.0.0.1');
          await new Promise<void>((r) => management.once('listening', r));
          const origin = `http://127.0.0.1:${(management.address() as any).port}`;
          const mutate = (route: string, body: any, method = 'PATCH') =>
            fetch(origin + route, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: body ? JSON.stringify(body) : undefined,
            });
          try {
            await connection.query('DELETE FROM "TimeclockIdentification"');
            await mutate('/devices/paired', { isActive: true });
            const headers = { 'x-kiosk-token': '', 'x-device-token': 'paired-token' };
            const reading = await call(
              '/terminal/v1/device/readings',
              { requestId: crypto.randomUUID(), uid: '04A1B2C3' },
              headers,
            );
            assert.equal(reading.status, 202, JSON.stringify(reading.body));
            assert.equal((await mutate('/devices/paired', { isActive: false })).status, 200);
            assert.equal((await mutate('/devices/paired', { isActive: true })).status, 200);
            assert.equal((await call('/terminal/v1/kiosk/identification')).status, 204);
            assert.equal(
              (
                await call('/terminal/v1/kiosk/punch', {
                  requestId: crypto.randomUUID(),
                  identificationId: reading.body.readingId,
                  kind: 'out',
                })
              ).status,
              410,
            );
            assert.equal(
              (
                await call(
                  '/terminal/v1/device/readings',
                  { requestId: crypto.randomUUID(), uid: '04A1B2C3' },
                  headers,
                )
              ).status,
              202,
            );
            const card = (
              await connection.query(
                `SELECT id FROM "TimeclockCredential" WHERE "secretHash"=$1 AND "revokedAt" IS NULL`,
                [require('../timeclockCredentials').hashSecret('04A1B2C3')],
              )
            ).rows[0];
            assert.equal((await mutate(`/credentials/${card.id}/revoke`, {}, 'POST')).status, 200);
            assert.equal((await call('/terminal/v1/kiosk/identification')).status, 204);
            assert.equal((await mutate('/kiosks/kiosk', undefined, 'DELETE')).status, 409);
          } finally {
            await new Promise<void>((r) => management.close(() => r()));
          }
        },
      );
      await t.test(
        'once kioscos detrás de la misma conexión pueden consultar durante un minuto',
        async () => {
          for (let i = 0; i < 11; i++) {
            await connection.query(
              `INSERT INTO "TimeclockKiosk"(id,name,token,"isActive") VALUES($1,'Prueba',$2,true)`,
              [`poll-${i}`, `poll-token-${i}`],
            );
            for (let j = 0; j < 60; j++)
              assert.equal(
                (
                  await call('/terminal/v1/kiosk/identification', undefined, {
                    'x-kiosk-token': `poll-token-${i}`,
                  })
                ).status,
                204,
              );
          }
        },
      );
      await t.test(
        'jornada entre web, QR y tarjeta conserva las pausas y el kiosco de origen',
        async () => {
          await connection.query('DELETE FROM "TimeclockEntry"');
          await connection.query('DELETE FROM "TimeclockIdentification"');
          const web = (kind: string) =>
            createPunch(db, {
              tenantId: 'tenant-test',
              actorKey: 'user:user',
              requestId: crypto.randomUUID(),
              employeeId: 'emp',
              userId: 'user',
              kind,
              source: 'web',
              method: 'account',
            });
          const age = () =>
            connection.query(`UPDATE "TimeclockEntry" SET at=at-interval '10 seconds'`);
          await web('in');
          await age();
          const previousKey = process.env.CONFIG_ENC_KEY;
          process.env.CONFIG_ENC_KEY = '11'.repeat(32);
          try {
            await require('../timeclockCredentials').issueCredential(db, 'emp', 'qr', null, 'QR');
            const credential = (
              await connection.query(
                `SELECT "secretEncrypted" FROM "TimeclockCredential" WHERE kind='qr' AND "revokedAt" IS NULL`,
              )
            ).rows[0];
            const value =
              'ofc:timeclock:v1:' +
              require('../../config/secretCrypto').decryptConfigSecret(credential.secretEncrypted);
            const qr = await call('/terminal/v1/kiosk/identify', {
              requestId: crypto.randomUUID(),
              method: 'qr',
              value,
            });
            assert.equal(qr.status, 200, JSON.stringify(qr.body));
            assert.equal(
              (
                await call(
                  '/terminal/v1/kiosk/punch',
                  {
                    requestId: crypto.randomUUID(),
                    identificationId: qr.body.identificationId,
                    kind: 'break_start',
                  },
                  { 'x-kiosk-token': 'poll-token-0' },
                )
              ).status,
              404,
            );
            assert.equal(
              (
                await call('/terminal/v1/kiosk/punch', {
                  requestId: crypto.randomUUID(),
                  identificationId: qr.body.identificationId,
                  kind: 'break_start',
                })
              ).status,
              200,
            );
            await age();
            await web('break_end');
            await age();
            const headers = { 'x-kiosk-token': '', 'x-device-token': 'paired-token' };
            const reading = await call(
              '/terminal/v1/device/readings',
              { requestId: crypto.randomUUID(), uid: '04A1B2C4' },
              headers,
            );
            assert.equal(reading.status, 202, JSON.stringify(reading.body));
            const body = {
              requestId: crypto.randomUUID(),
              identificationId: reading.body.readingId,
              kind: 'out',
            };
            const punched = await call('/terminal/v1/kiosk/punch', body);
            assert.equal(punched.status, 200, JSON.stringify(punched.body));
            assert.equal(
              (await call('/terminal/v1/kiosk/punch', body)).body.entry.id,
              punched.body.entry.id,
            );
            const entries = (
              await connection.query(
                'SELECT kind,method,"kioskId","deviceId" FROM "TimeclockEntry" ORDER BY at',
              )
            ).rows;
            assert.deepEqual(
              entries.map((r) => r.kind),
              ['in', 'break_start', 'break_end', 'out'],
            );
            assert.deepEqual(
              entries.map((r) => r.method),
              ['account', 'qr', 'account', 'rfid'],
            );
            assert.equal(entries[3].kioskId, 'kiosk');
            assert.equal(entries[3].deviceId, 'paired');
          } finally {
            if (previousKey === undefined) delete process.env.CONFIG_ENC_KEY;
            else process.env.CONFIG_ENC_KEY = previousKey;
          }
        },
      );
    } finally {
      if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
      await otherPool.end();
      await connection.query(`DROP SCHEMA "${otherName}" CASCADE`);
      await connection.query(`DROP SCHEMA ${quoted} CASCADE`);
      connection.release();
      await pool.end();
    }
  },
);
