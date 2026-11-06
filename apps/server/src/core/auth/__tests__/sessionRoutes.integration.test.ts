import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { WebSocket } from 'ws';
import { sql } from 'drizzle-orm';
import { authTestDatabaseUrl, useAuthTestDb } from './authTestDb';
import { AuthService } from '../AuthService';
import { hashCode } from '../totpCrypto';
import { createSession, issueToken, revokeSession, startSessionListener } from '../sessions';
import { tenantContextMiddleware } from '../../../api/middleware/tenantContext';
import authRouter from '../../../api/auth';
import messagingRouter from '../../../api/messaging';
import { startEventSocket, stopEventSocket } from '../../realtime/EventSocket';

const client = { ip: '127.0.0.1', userAgent: 'test', clientKind: 'web' as const };

describe('rutas de sesión', { skip: !authTestDatabaseUrl }, () => {
  let t: Awaited<ReturnType<typeof useAuthTestDb>>;
  let server: http.Server;
  let base: string;

  before(async () => {
    t = await useAuthTestDb();
    await startSessionListener();
    const app = express();
    app.use(express.json());
    app.use('/api', tenantContextMiddleware);
    app.use('/api/auth', authRouter);
    app.use('/api/messaging', messagingRouter);
    server = http.createServer(app);
    startEventSocket(server);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    stopEventSocket();
    await new Promise((r) => (server ? server.close(r) : r(null)));
    if (t) await t.drop();
  });

  const call = async (method: string, path: string, token?: string, body?: any) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  const login = async (u: { email: string; password: string }) => {
    const r = await call('POST', '/api/auth/login', undefined, {
      email: u.email,
      password: u.password,
    });
    assert.equal(r.status, 200);
    return r.body.token as string;
  };

  it('login → me → logout → me 401', async () => {
    const u = await t.createUser();
    const token = await login(u);
    assert.equal((await call('GET', '/api/auth/me', token)).status, 200);
    assert.equal((await call('POST', '/api/auth/logout', token)).status, 204);
    const after = await call('GET', '/api/auth/me', token);
    assert.equal(after.status, 401);
    assert.equal(after.body.code, 'SESSION_REVOKED');
  });

  it('reset-password revoca todas', async () => {
    const u = await t.createUser();
    const token = await login(u);
    const raw = 'reset-token-' + Math.random().toString(16).slice(2);
    await t.publicDb.execute(
      sql`UPDATE public."GlobalUser" SET "resetTokenHash" = ${hashCode(raw)},
          "resetTokenExpiresAt" = ${new Date(Date.now() + 3600_000)} WHERE id = ${u.id}`,
    );
    const r = await call('POST', '/api/auth/reset-password', undefined, {
      token: raw,
      newPassword: 'nueva-clave-123',
    });
    assert.equal(r.status, 200);
    assert.equal((await call('GET', '/api/auth/me', token)).status, 401);
  });

  it('DELETE /sessions?others=1 deja la actual', async () => {
    const u = await t.createUser();
    const a = await login(u);
    await login(u);
    await login(u);
    const r = await call('DELETE', '/api/auth/sessions?others=1', a);
    assert.equal(r.status, 200);
    assert.equal(r.body.revoked, 2);
    const list = await call('GET', '/api/auth/sessions', a);
    assert.equal(list.body.sessions.length, 1);
    assert.equal(list.body.sessions[0].current, true);
    assert.equal((await call('GET', '/api/auth/me', a)).status, 200);
  });

  it('no borra sesiones de otro usuario', async () => {
    const u1 = await t.createUser();
    const u2 = await t.createUser();
    const t1 = await login(u1);
    const t2 = await login(u2);
    const other: any = AuthService.verifyToken(t2);
    const r = await call('DELETE', `/api/auth/sessions/${other.sid}`, t1);
    assert.equal(r.status, 404);
    assert.equal((await call('GET', '/api/auth/me', t2)).status, 200);
    const own: any = AuthService.verifyToken(t1);
    assert.equal((await call('DELETE', `/api/auth/sessions/${own.sid}`, t1)).status, 204);
  });

  it('refresh mantiene sid', async () => {
    const u = await t.createUser();
    const token = await login(u);
    const r = await call('POST', '/api/auth/refresh', token);
    assert.equal(r.status, 200);
    const a: any = AuthService.verifyToken(token);
    const b: any = AuthService.verifyToken(r.body.token);
    assert.equal(a.sid, b.sid);
    assert.equal((await call('GET', '/api/auth/me', r.body.token)).status, 200);
  });

  it('revocar cierra el websocket del sid', async () => {
    const u = await t.createUser();
    const s = await createSession({
      userId: u.id,
      tenantId: 'tenant-ws',
      method: 'password',
      mfa: null,
      client,
    });
    const token = issueToken(s, { id: u.id, email: u.email, username: 'x', role: 'USER' });
    const port = (server.address() as AddressInfo).port;
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/ws/events?tenant=tenant-ws&token=${encodeURIComponent(token)}`,
    );
    await new Promise<void>((res, rej) => {
      ws.once('open', () => res());
      ws.once('error', rej);
    });
    const closed = new Promise<number>((res) => ws.once('close', (code) => res(code)));
    await revokeSession(s.id, 'test');
    assert.equal(await closed, 4401);
  });

  it('el websocket rechaza sin token o con otra empresa', async () => {
    const u = await t.createUser();
    const s = await createSession({
      userId: u.id,
      tenantId: 'tenant-ws',
      method: 'password',
      mfa: null,
      client,
    });
    const token = issueToken(s, { id: u.id, email: u.email, username: 'x', role: 'USER' });
    const port = (server.address() as AddressInfo).port;
    const code = (qs: string) =>
      new Promise<number>((res) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/events?${qs}`);
        ws.on('close', (c) => res(c));
        ws.on('error', () => {});
      });
    assert.equal(await code('tenant=tenant-ws'), 4401);
    assert.equal(await code(`tenant=otra&token=${encodeURIComponent(token)}`), 4401);
  });

  it('sesión revocada no obtiene ticket de mensajería', async () => {
    const u = await t.createUser();
    const token = await login(u);
    await call('POST', '/api/auth/logout', token);
    const r = await call('POST', '/api/messaging/ticket', token);
    assert.equal(r.status, 401);
  });
});
