import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import * as sessions from '../sessions';
import { adminMiddleware } from '../../../api/middleware/adminAuth';
import tenantsRouter from '../../../api/tenants';

// TS emite CommonJS y los middlewares llaman a `sessions_1.resolveSession(...)` en cada
// petición, así que sustituir la función del módulo simula una caída de la base sin ella.
const mod: any = sessions;

describe('un fallo al resolver la sesión responde 500 y no cuelga', () => {
  let server: http.Server;
  let base: string;
  const original = mod.resolveSession;

  before(async () => {
    mod.resolveSession = async () => {
      throw new Error('base caída');
    };
    const app = express();
    app.get('/admin', adminMiddleware, (_req, res) => res.json({ ok: true }));
    app.use('/tenants', tenantsRouter);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    mod.resolveSession = original;
    await new Promise((r) => server.close(r));
  });

  const get = (path: string) =>
    fetch(base + path, {
      headers: { authorization: 'Bearer x.y.z' },
      signal: AbortSignal.timeout(3000),
    });

  it('adminMiddleware', async () => {
    assert.equal((await get('/admin')).status, 500);
  });

  it('requireAuth de tenants', async () => {
    assert.equal((await get('/tenants/mine')).status, 500);
  });
});
