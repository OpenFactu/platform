/**
 * Leer los tipos de impuesto no exige permiso: los usan todos los documentos y
 * las fichas, y sin ellos un vendedor veía el total sin impuesto mientras el
 * servidor guardaba otro. Crearlos, cambiarlos y borrarlos sí lo exige.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import taxesRouter from '../taxes';

const rows = [{ id: 't1', code: 'TAX5', rate: '5.00' }];
let writes = 0;

const query: any = {
  from: () => query,
  where: () => query,
  then: (ok: any) => ok(rows),
};
const tenantClient: any = {
  select: () => query,
  insert: () => {
    writes++;
    return query;
  },
  update: () => {
    writes++;
    return query;
  },
  delete: () => {
    writes++;
    return query;
  },
};

let server: Server;
let base: string;

before(async () => {
  const app = express();
  app.use(express.json());
  // Sin usuario: requirePermission responde 401 antes de mirar sus permisos.
  app.use((req: any, _res, next) => {
    req.tenantId = 'empresa-1';
    req.tenantClient = tenantClient;
    next();
  });
  app.use('/taxes', taxesRouter);
  await new Promise<void>((ok) => {
    server = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());

test('el listado de impuestos no pide permiso de módulo', async () => {
  const res = await fetch(`${base}/taxes`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), rows);
});

for (const [method, path] of [
  ['POST', '/taxes'],
  ['PATCH', '/taxes/t1'],
  ['DELETE', '/taxes/t1'],
] as const) {
  test(`${method} de impuestos exige el permiso`, async () => {
    writes = 0;
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'X', rate: 1 }),
    });
    assert.equal(res.status, 401);
    assert.equal(writes, 0);
  });
}
