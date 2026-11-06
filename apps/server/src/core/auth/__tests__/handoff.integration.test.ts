import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { sql } from 'drizzle-orm';
import { authTestDatabaseUrl, useAuthTestDb } from './authTestDb';
import authRouter from '../../../api/auth';
import { approveHandoff, createHandoff, handoffInfo, ipHint, pollHandoff } from '../handoff';

const testIp = `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;
const client = { ip: '203.0.113.9', userAgent: 'Mozilla/5.0 test', clientKind: 'web' as const };

describe('entrega de login entre dispositivos', { skip: !authTestDatabaseUrl }, () => {
  let t: Awaited<ReturnType<typeof useAuthTestDb>>;
  let server: http.Server;
  let base: string;

  before(async () => {
    t = await useAuthTestDb();
    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use('/api/auth', authRouter);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    await new Promise((r) => (server ? server.close(r) : r(null)));
    if (t) {
      await t.publicDb.execute(
        sql`DELETE FROM public."AuthThrottle" WHERE key LIKE ${'%:ip:' + testIp}`,
      );
      await t.drop();
    }
  });

  const post = async (path: string, body?: any) => {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify(body ?? {}),
    });
    return { status: res.status, body: await res.json() };
  };

  it('el código de confirmación son 2 consonantes y 2 cifras, y la pista de IP no da la dirección', async () => {
    const h = await createHandoff(client);
    assert.match(h.confirmCode, /^[B-DF-HJ-NP-TV-Z]{2}-\d{2}$/);
    const info = await handoffInfo(h.handoffId);
    assert.equal(info?.confirmCode, h.confirmCode);
    assert.equal(info?.ipHint, '203.0.x.x');
    assert.equal(ipHint('2001:db8:1:2::1'), '2001:db8:…');
    assert.equal(ipHint('::1'), 'local');
  });

  it('aprobado se recoge una sola vez', async () => {
    const u = await t.createUser();
    const h = await createHandoff(client);
    assert.deepEqual(await pollHandoff(h.handoffId, h.pollSecret), { status: 'pending' });
    await approveHandoff(h.handoffId, u.id, 'email_code', null);
    assert.equal(await handoffInfo(h.handoffId), null);
    assert.deepEqual(await pollHandoff(h.handoffId, h.pollSecret), {
      status: 'approved',
      userId: u.id,
      method: 'email_code',
      mfaDone: null,
    });
    assert.deepEqual(await pollHandoff(h.handoffId, h.pollSecret), { status: 'expired' });
  });

  it('pollSecret incorrecto da pending y no consume', async () => {
    const u = await t.createUser();
    const h = await createHandoff(client);
    await approveHandoff(h.handoffId, u.id, 'sso:google', 'sso');
    assert.deepEqual(await pollHandoff(h.handoffId, 'otro-secreto'), { status: 'pending' });
    assert.deepEqual(await pollHandoff('no-existe', h.pollSecret), { status: 'pending' });
    const ok: any = await pollHandoff(h.handoffId, h.pollSecret);
    assert.equal(ok.status, 'approved');
    assert.equal(ok.mfaDone, 'sso');
  });

  it('caducado da expired', async () => {
    const h = await createHandoff(client);
    await t.publicDb.execute(
      sql`UPDATE public."AuthChallenge" SET "expiresAt" = ${new Date(Date.now() - 1000).toISOString()}::timestamp WHERE id = ${h.handoffId}`,
    );
    assert.deepEqual(await pollHandoff(h.handoffId, h.pollSecret), { status: 'expired' });
    assert.equal(await handoffInfo(h.handoffId), null);
    const u = await t.createUser();
    await assert.rejects(approveHandoff(h.handoffId, u.id, 'email_code', null), {
      code: 'HANDOFF_INVALID',
    });
  });

  it('aprobar dos veces da HANDOFF_INVALID', async () => {
    const u = await t.createUser();
    const h = await createHandoff(client);
    await approveHandoff(h.handoffId, u.id, 'email_code', null);
    await assert.rejects(approveHandoff(h.handoffId, u.id, 'email_code', null), {
      code: 'HANDOFF_INVALID',
    });
    await assert.rejects(approveHandoff('no-existe', u.id, 'email_code', null), {
      code: 'HANDOFF_INVALID',
    });
  });

  it('rutas: crear, ver y sondear hasta abrir sesión', async () => {
    const u = await t.createUser();
    const c = await post('/api/auth/handoff');
    assert.equal(c.status, 200);
    const view = await fetch(`${base}/api/auth/handoff/${c.body.handoffId}`);
    assert.equal(view.status, 200);
    const info: any = await view.json();
    assert.equal(info.confirmCode, c.body.confirmCode);
    assert.equal((await fetch(`${base}/api/auth/handoff/nada`)).status, 404);

    const wrong = await post('/api/auth/handoff/poll', {
      handoffId: c.body.handoffId,
      pollSecret: 'x',
    });
    assert.deepEqual(wrong.body, { status: 'pending' });
    const body = { handoffId: c.body.handoffId, pollSecret: c.body.pollSecret };
    assert.deepEqual((await post('/api/auth/handoff/poll', body)).body, { status: 'pending' });

    await approveHandoff(c.body.handoffId, u.id, 'email_code', null);
    const done = await post('/api/auth/handoff/poll', body);
    assert.equal(done.status, 200);
    assert.ok(done.body.token);
    assert.deepEqual((await post('/api/auth/handoff/poll', body)).body, { status: 'expired' });
  });

  it('poll aprobado con 2FA devuelve mfaRequired, y sin 2FA pendiente si ya lo hizo', async () => {
    const u = await t.createUser({ totp: true });
    const c = await post('/api/auth/handoff');
    await approveHandoff(c.body.handoffId, u.id, 'email_code', null);
    const r = await post('/api/auth/handoff/poll', {
      handoffId: c.body.handoffId,
      pollSecret: c.body.pollSecret,
    });
    assert.equal(r.body.mfaRequired, true);
    assert.ok(r.body.challenge);

    const c2 = await post('/api/auth/handoff');
    await approveHandoff(c2.body.handoffId, u.id, 'sso:google', 'sso');
    const r2 = await post('/api/auth/handoff/poll', {
      handoffId: c2.body.handoffId,
      pollSecret: c2.body.pollSecret,
    });
    assert.ok(r2.body.token);
    assert.equal(r2.body.mfaRequired, undefined);
  });
});
