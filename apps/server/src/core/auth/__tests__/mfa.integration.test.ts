import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { sql } from 'drizzle-orm';
import { authenticator } from 'otplib';
import { authTestDatabaseUrl, useAuthTestDb } from './authTestDb';
import { encryptSecret } from '../totpCrypto';
import authRouter from '../../../api/auth';

describe('segundo factor con reto', { skip: !authTestDatabaseUrl }, () => {
  let t: Awaited<ReturnType<typeof useAuthTestDb>>;
  let server: http.Server;
  let base: string;

  before(async () => {
    t = await useAuthTestDb();
    const app = express();
    app.use(express.json());
    // Mismo orden que server.ts: /api/auth no pasa por el contexto de empresa.
    app.use('/api/auth', authRouter);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    await new Promise((r) => (server ? server.close(r) : r(null)));
    if (t) await t.drop();
  });

  const post = async (path: string, body: any) => {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  /** Usuario con 2FA y su secreto en claro. */
  const totpUser = async () => {
    const u = await t.createUser({ totp: true });
    const secret = authenticator.generateSecret();
    await t.publicDb.execute(
      sql`UPDATE public."GlobalUser" SET "totpSecret" = ${encryptSecret(secret)} WHERE id = ${u.id}`,
    );
    return { ...u, secret };
  };

  const startMfa = async (u: { email: string; password: string }) => {
    const r = await post('/api/auth/login', { email: u.email, password: u.password });
    assert.equal(r.status, 200);
    return r.body.challenge as string;
  };

  it('login con 2FA devuelve challenge y no token', async () => {
    const u = await totpUser();
    const r = await post('/api/auth/login', { email: u.email, password: u.password });
    assert.equal(r.status, 200);
    assert.equal(r.body.mfaRequired, true);
    assert.ok(r.body.challenge);
    assert.deepEqual(r.body.methods, ['totp', 'backup']);
    assert.equal(r.body.token, undefined);
    assert.equal(r.body.user.email, u.email);
  });

  it('mfa con código válido devuelve token', async () => {
    const u = await totpUser();
    const challenge = await startMfa(u);
    const r = await post('/api/auth/mfa', { challenge, code: authenticator.generate(u.secret) });
    assert.equal(r.status, 200);
    assert.ok(r.body.token);
    assert.equal(r.body.user.email, u.email);
  });

  it('6.º intento con el mismo reto da MFA_CHALLENGE_EXPIRED', async () => {
    const u = await totpUser();
    const challenge = await startMfa(u);
    for (let i = 0; i < 5; i++) {
      const r = await post('/api/auth/mfa', { challenge, code: '000000' });
      assert.equal(r.status, 401);
      assert.equal(r.body.code, 'MFA_INVALID');
    }
    const sixth = await post('/api/auth/mfa', {
      challenge,
      code: authenticator.generate(u.secret),
    });
    assert.equal(sixth.status, 401);
    assert.equal(sixth.body.code, 'MFA_CHALLENGE_EXPIRED');
  });

  it('reto consumido no vale dos veces', async () => {
    const u = await totpUser();
    const challenge = await startMfa(u);
    const code = authenticator.generate(u.secret);
    assert.equal((await post('/api/auth/mfa', { challenge, code })).status, 200);
    const again = await post('/api/auth/mfa', { challenge, code });
    assert.equal(again.status, 401);
    assert.equal(again.body.code, 'MFA_CHALLENGE_EXPIRED');
  });

  it('el mismo código TOTP no abre dos retos', async () => {
    const u = await totpUser();
    const code = authenticator.generate(u.secret);
    const c1 = await startMfa(u);
    assert.equal((await post('/api/auth/mfa', { challenge: c1, code })).status, 200);
    const c2 = await startMfa(u);
    const r = await post('/api/auth/mfa', { challenge: c2, code });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'MFA_INVALID');
  });

  it('usuario inexistente y contraseña mala responden igual', async () => {
    const u = await t.createUser();
    const bad = await post('/api/auth/login', { email: u.email, password: 'nope-nope' });
    const ghost = await post('/api/auth/login', {
      email: `no-existe-${Date.now()}@test.local`,
      password: 'nope-nope',
    });
    assert.equal(bad.status, 401);
    assert.equal(ghost.status, bad.status);
    assert.deepEqual(ghost.body, bad.body);
  });

  it('6 contraseñas malas dan 429 con retryAfter', async () => {
    const u = await t.createUser();
    for (let i = 0; i < 5; i++) {
      const r = await post('/api/auth/login', { email: u.email, password: 'mala-' + i });
      assert.equal(r.status, 401);
    }
    const sixth = await post('/api/auth/login', { email: u.email, password: u.password });
    assert.equal(sixth.status, 429);
    assert.ok(sixth.body.retryAfter > 0);
  });
});
