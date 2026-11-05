/** Arnés de las pruebas de logística, sobre una empresa de prueba (`createTestTenant`). */
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { sql } from 'drizzle-orm';
import { createTestTenant, testDatabaseUrl } from '../../tenant/__tests__/testTenant';
import {
  invalidatePermissions,
  requireAnyPermission,
  requirePermission,
} from '../../../api/middleware/requirePermission';

export { testDatabaseUrl };

export interface TestUser {
  id: string;
  role?: string;
}

export interface ApiResult<T = any> {
  status: number;
  data: T;
  contentType: string;
}

export interface LogisticsHarness {
  tenantId: string;
  schemaName: string;
  db: any;
  query: <T = any>(text: string) => Promise<T[]>;
  /** Llama a la API como `user` (por defecto, un administrador). */
  api: <T = any>(
    method: string,
    path: string,
    body?: unknown,
    user?: TestUser | null,
  ) => Promise<ApiResult<T>>;
  seedDeliveryNote: (kind: 'SDN' | 'PDN', lines?: number) => Promise<SeededNote>;
  /** Un usuario normal con estos permisos en la empresa. */
  seedUser: (id: string, permissions: Record<string, PermSet>) => Promise<TestUser>;
  /** Un empleado vinculado a ese usuario, para asignarlo como conductor. */
  seedEmployee: (userId: string) => Promise<string>;
  close: () => Promise<void>;
}

type PermSet = { read: boolean; write: boolean; delete: boolean };

export interface SeededNote {
  id: string;
  lineIds: string[];
  itemIds: string[];
  warehouseId: string;
  partnerId: string;
}

const ADMIN: TestUser = { id: 'test-admin', role: 'ADMIN' };

export async function startLogisticsHarness(): Promise<LogisticsHarness> {
  const { tenantId, schemaName, suffix, db, publicDb, query, drop } = await createTestTenant();

  // Importados aquí: el router lee `ClientFactory` y conviene que la URL ya esté puesta.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const {
    default: logisticsRouter,
    driverRouter,
    publicTrackRouter,
  } = require('../../../api/logistics');

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/logistics', publicTrackRouter);
  app.use('/api/logistics', (req: any, _res, next) => {
    req.tenantClient = db;
    req.tenantId = tenantId;
    req.tenantSchema = schemaName;
    const header = req.headers['x-test-user'];
    req.user = header ? JSON.parse(String(header)) : ADMIN;
    next();
  });
  app.use(
    '/api/logistics/my',
    requireAnyPermission(['/driver', '/logistics'], ['DRIVER']),
    driverRouter,
  );
  app.use('/api/logistics', requirePermission('/logistics'), logisticsRouter);

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;

  const api: LogisticsHarness['api'] = async (method, path, body, user) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/logistics${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(user ? { 'x-test-user': JSON.stringify(user) } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* texto o PNG */
    }
    return { status: res.status, data, contentType: res.headers.get('content-type') || '' };
  };

  // Datos mínimos con los que colgar un albarán.
  let seq = 0;
  const seedDeliveryNote: LogisticsHarness['seedDeliveryNote'] = async (kind, lines = 2) => {
    const n = ++seq;
    const warehouseId = `wh-${n}`;
    const partnerId = `bp-${n}`;
    const seriesId = `ser-${n}`;
    const periodId = `per-${n}`;
    const uomId = `uom-${n}`;
    await query(`INSERT INTO "Warehouse" (id, name) VALUES ('${warehouseId}', 'Almacén ${n}')`);
    await query(
      `INSERT INTO "BusinessPartner" (id, code, name) VALUES ('${partnerId}', 'C${suffix}${n}', 'Cliente ${n}')`,
    );
    await query(
      `INSERT INTO "UnitOfMeasure" (id, code, name) VALUES ('${uomId}', 'U${suffix}${n}', 'Unidad')`,
    );
    await query(
      `INSERT INTO "AccountingPeriod" (id, code, name, "startDate", "endDate") VALUES ('${periodId}', 'P${suffix}${n}', 'Periodo ${n}', '2026-01-01', '2026-12-31')`,
    );
    await query(
      `INSERT INTO "DocumentSeries" (id, name, "periodId", "docType", "firstNumber", "nextNumber", "lastNumber") VALUES ('${seriesId}', 'Serie ${n}', '${periodId}', '${kind}', 1, 2, 9999)`,
    );
    const noteId = `${kind.toLowerCase()}-${n}`;
    const noteTable = kind === 'SDN' ? 'SalesDeliveryNote' : 'PurchaseDeliveryNote';
    const lineTable = kind === 'SDN' ? 'SalesDeliveryNoteLine' : 'PurchaseDeliveryNoteLine';
    await query(
      `INSERT INTO "${noteTable}" (id, "seriesId", "docNum", date, "partnerId", "periodId", "warehouseId") VALUES ('${noteId}', '${seriesId}', ${n}, now(), '${partnerId}', '${periodId}', '${warehouseId}')`,
    );
    const lineIds: string[] = [];
    const itemIds: string[] = [];
    for (let l = 1; l <= lines; l++) {
      const itemId = `item-${n}-${l}`;
      const lineId = `line-${n}-${l}`;
      await query(
        `INSERT INTO "Item" (id, code, name, "basePrice", "uomId") VALUES ('${itemId}', 'A${suffix}${n}${l}', 'Artículo ${l}', 10, '${uomId}')`,
      );
      await query(
        `INSERT INTO "${lineTable}" (id, "deliveryId", "lineNum", "itemId", quantity, price, "lineTotal", "warehouseId") VALUES ('${lineId}', '${noteId}', ${l}, '${itemId}', 3, 10, 30, '${warehouseId}')`,
      );
      lineIds.push(lineId);
      itemIds.push(itemId);
    }
    return { id: noteId, lineIds, itemIds, warehouseId, partnerId };
  };

  const seedUser: LogisticsHarness['seedUser'] = async (id, permissions) => {
    const userId = `${id}-${suffix}`;
    await publicDb.execute(
      sql`INSERT INTO public."GlobalUser" (id, email, username, password) VALUES (${userId}, ${`${userId}@example.com`}, ${userId}, 'x')`,
    );
    await publicDb.execute(
      sql`INSERT INTO public."UserTenantMembership" (id, "userId", "tenantId", role, permissions)
          VALUES (${crypto.randomUUID()}, ${userId}, ${tenantId}, 'USER', ${JSON.stringify(permissions)})`,
    );
    invalidatePermissions(userId);
    return { id: userId, role: 'USER' };
  };

  const seedEmployee: LogisticsHarness['seedEmployee'] = async (userId) => {
    const employeeId = crypto.randomUUID();
    await db.execute(
      sql`INSERT INTO "Employee" (id, code, "firstName", "lastName", "userId") VALUES (${employeeId}, ${`E-${employeeId.slice(0, 8)}`}, 'Conductor', 'Prueba', ${userId})`,
    );
    return employeeId;
  };

  const close = async () => {
    await new Promise((resolve) => server.close(resolve));
    await drop();
  };

  return {
    tenantId,
    schemaName,
    db,
    query,
    api,
    seedDeliveryNote,
    seedUser,
    seedEmployee,
    close,
  };
}
