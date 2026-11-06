import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { sql } from 'drizzle-orm';
import { authenticator } from 'otplib';
import { authTestDatabaseUrl, useAuthTestDb } from './authTestDb';
import { encryptSecret } from '../totpCrypto';
import { approveChallenge, consumeChallenge, createChallenge, findChallenge } from '../challenges';
import authRouter from '../../../api/auth';

// IP propia de esta ejecución: los contadores de otras pruebas no se tocan ni nos afectan.
const testIp = `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;

describe('segundo factor con reto', { skip: !authTestDatabaseUrl }, () => {
  let t: Awaited<ReturnType<typeof useAuthTestDb>>;
  let server: http.Server;
  let base: string;

  before(async () => {
    t = await useAuthTestDb();
    const app = express();
    // Solo en esta app de prueba: la IP del cliente sale de x-forwarded-for.
    app.set('trust proxy', true);
    app.use(express.json());
    // Mismo orden que server.ts: /api/auth no pasa por el contexto de empresa.
    app.use('/api/auth', authRouter);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    await new Promise((r) => (server ? server.close(r) : r(null)));
    if (t) {
      // Solo las claves de la IP de esta ejecución.
      await t.publicDb.execute(
        sql`DELETE FROM public."AuthThrottle" WHERE key LIKE ${'%:ip:' + testIp}`,
      );
      await t.drop();
    }
  });

  const post = async (path: string, body: any) => {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
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

  it('10 envíos erróneos en paralelo: como mucho 5 MFA_INVALID y el resto caducado', async () => {
    const u = await totpUser();
    const challenge = await startMfa(u);
    const rs = await Promise.all(
      Array.from({ length: 10 }, () => post('/api/auth/mfa', { challenge, code: '000000' })),
    );
    const invalid = rs.filter((r) => r.body.code === 'MFA_INVALID').length;
    const expired = rs.filter((r) => r.body.code === 'MFA_CHALLENGE_EXPIRED').length;
    assert.ok(invalid <= 5, `MFA_INVALID: ${invalid}`);
    assert.equal(invalid + expired, 10);
    const [row] = (
      await t.publicDb.execute(
        sql`SELECT attempts FROM public."AuthChallenge" WHERE "userId" = ${u.id}`,
      )
    ).rows;
    assert.ok(Number(row.attempts) <= 5);
  });

  it('approveChallenge: no resucita un reto consumido y no vale dos veces', async () => {
    const u = await t.createUser();
    const a = await createChallenge('handoff', { userId: u.id, ttlMs: 60_000, data: { x: 1 } });
    assert.equal(await approveChallenge(a.id, u.id, { y: 2 }), true);
    assert.equal(await approveChallenge(a.id, u.id, { y: 3 }), false);
    const row = await findChallenge('handoff', a.secret);
    assert.equal(row?.status, 'approved');
    assert.equal(JSON.parse(row!.data!).y, 2);
    assert.equal(JSON.parse(row!.data!).x, 1);

    const b = await createChallenge('handoff', { userId: u.id, ttlMs: 60_000 });
    assert.equal(await consumeChallenge(b.id), true);
    assert.equal(await approveChallenge(b.id, u.id), false);
    assert.equal(await findChallenge('handoff', b.secret), null);
  });

  it('el atajo totpCode de /login rechaza un código repetido', async () => {
    const u = await totpUser();
    const code = authenticator.generate(u.secret);
    const first = await post('/api/auth/login', {
      email: u.email,
      password: u.password,
      totpCode: code,
    });
    assert.equal(first.status, 200);
    assert.ok(first.body.token);
    const again = await post('/api/auth/login', {
      email: u.email,
      password: u.password,
      totpCode: code,
    });
    assert.equal(again.status, 401);
    assert.equal(again.body.token, undefined);
  });
});
