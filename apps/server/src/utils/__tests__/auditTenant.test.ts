/**
 * La auditoría se apunta a la empresa de la sesión. Con una llamada que resuelve
 * la empresa por el JWT, sin cabecera `x-tenant-id`, se perdía el registro: la
 * tabla exige una empresa existente y el error solo salía en el log.
 */
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import * as schema from '../../db/schema';
import itemsRouter from '../../api/items';
import partnersRouter from '../../api/partners';
import { PluginFieldManager } from '../../core/plugins/PluginFieldManager';

const row = { id: 'x1', code: 'C1', name: 'Fila', groupId: null, countryCode: null, nif: null };
const audits: any[] = [];

/** Cualquier consulta encadenada resuelve a la misma fila. */
const chain = (): any =>
  new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? (ok: any) => ok([{ ...row }]) : () => chain()),
    apply: () => chain(),
  });

const tenantClient: any = {
  select: () => chain(),
  update: () => chain(),
  delete: () => chain(),
  execute: async () => ({ rows: [] }),
  transaction: async (fn: any) => fn(tenantClient),
  insert: (table: unknown) => ({
    values: (v: any) => {
      if (table === schema.auditLogs) audits.push(v);
      return chain();
    },
  }),
};

let server: Server;
let base: string;

before(async () => {
  // Los campos personalizados se leen de la base pública, y aquí no hay ninguna.
  mock.method(PluginFieldManager, 'validateAndExtract', async () => ({}));
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenantId = 'empresa-1';
    req.tenantSchema = 'tenant_empresa_1';
    req.tenantClient = tenantClient;
    req.user = { id: 'user-1', role: 'ADMIN' };
    next();
  });
  app.use('/items', itemsRouter);
  app.use('/partners', partnersRouter);
  await new Promise<void>((ok) => {
    server = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());

for (const [label, path] of [
  ['interlocutor', '/partners/x1'],
  ['artículo', '/items/x1'],
] as const) {
  test(`sin cabecera, el cambio de un ${label} se audita con la empresa de la sesión`, async () => {
    audits.length = 0;
    const res = await fetch(`${base}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Otro nombre' }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    await new Promise((ok) => setTimeout(ok, 20));
    assert.equal(audits.length, 1);
    assert.equal(audits[0].tenantId, 'empresa-1');
  });
}
