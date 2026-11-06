import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import express from 'express';
import { sql } from 'drizzle-orm';
import { authTestDatabaseUrl, useAuthTestDb } from './authTestDb';
import { createTestTenant, type TestTenant } from '../../tenant/__tests__/testTenant';
import { DEFAULT_POLICY, writePolicy } from '../policy';
import { createSession, issueToken } from '../sessions';
import authRouter from '../../../api/auth';

const testIp = `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;
const WEB = 'https://erp.passkeys-test.example';

describe('rutas de passkeys', { skip: !authTestDatabaseUrl }, () => {
  let t: Awaited<ReturnType<typeof useAuthTestDb>>;
  let tenant: TestTenant; // 2FA para todos
  let server: http.Server;
  let base: string;
  const prevOrigin = process.env.WEB_ORIGIN;

  before(async () => {
    process.env.WEB_ORIGIN = WEB;
    t = await useAuthTestDb();
    tenant = await createTestTenant({
      url: authTestDatabaseUrl,
      guard: /auth_test/,
      publicSchemaReady: true,
      keepConnections: true,
    });
    await writePolicy(tenant.db, { ...DEFAULT_POLICY, mfa: 'all' });
    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use('/api/auth', authRouter);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    if (prevOrigin === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = prevOrigin;
    await new Promise((r) => (server ? server.close(r) : r(null)));
    if (t) {
      await t.publicDb.execute(
        sql`DELETE FROM public."AuthThrottle" WHERE key LIKE ${'%:ip:' + testIp}`,
      );
    }
    if (tenant) await tenant.drop();
    if (t) await t.drop();
  });

  const call = async (
    method: string,
    path: string,
    opts: { token?: string; body?: any; origin?: string | null } = {},
  ) => {
    const origin = opts.origin === undefined ? WEB : opts.origin;
    const res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': testIp,
        ...(origin ? { origin } : {}),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  /** Usuario con sesión abierta (sin pasar por el login). */
  const withSession = async (opts: { tenant?: boolean; totp?: boolean } = {}) => {
    const u = await t.createUser({ totp: opts.totp });
    if (opts.tenant) {
      await t.publicDb.execute(
        sql`INSERT INTO public."UserTenantMembership" (id, "userId", "tenantId", role, "updatedAt")
            VALUES (${crypto.randomUUID()}, ${u.id}, ${tenant.tenantId}, 'USER', now())`,
      );
    }
    const rows: any = await t.publicDb.execute(
      sql`SELECT username FROM public."GlobalUser" WHERE id = ${u.id}`,
    );
    const username = (rows.rows ?? rows)[0].username;
    const session = await createSession({
      userId: u.id,
      tenantId: opts.tenant ? tenant.tenantId : null,
      method: 'password',
      mfa: null,
      client: { ip: '127.0.0.1', userAgent: 'test', clientKind: 'web' },
    });
    const token = issueToken(session, { id: u.id, email: u.email, username, role: 'USER' });
    return { ...u, token };
  };

  const addPasskey = async (userId: string, rpId = 'erp.passkeys-test.example') => {
    const id = crypto.randomUUID();
    await t.publicDb.execute(
      sql`INSERT INTO public."UserPasskey" (id, "userId", "credentialId", "publicKey", counter, "rpId", name)
          VALUES (${id}, ${userId}, ${'cred-' + id}, 'AAAA', 0, ${rpId}, 'Mi llave')`,
    );
    return id;
  };

  it('register/options da un reto para un origen permitido', async () => {
    const u = await withSession();
    const r = await call('POST', '/api/auth/passkeys/register/options', { token: u.token });
    assert.equal(r.status, 200);
    assert.ok(r.body.challenge);
    assert.equal(r.body.rp.id, 'erp.passkeys-test.example');
    assert.equal(r.body.authenticatorSelection.residentKey, 'required');
    assert.equal(r.body.authenticatorSelection.userVerification, 'preferred');
  });

  it('register/options rechaza un origen que no está en la lista y exige sesión', async () => {
    const u = await withSession();
    const bad = await call('POST', '/api/auth/passkeys/register/options', {
      token: u.token,
      origin: 'https://evil.example',
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'ORIGIN_NOT_ALLOWED');
    const none = await call('POST', '/api/auth/passkeys/register/options', {
      token: u.token,
      origin: null,
    });
    assert.equal(none.status, 400);
    const noSession = await call('POST', '/api/auth/passkeys/register/options');
    assert.equal(noSession.status, 401);
  });

  it('register/verify con una respuesta falsa o sin reto da PASSKEY_INVALID y no crea nada', async () => {
    const u = await withSession();
    await call('POST', '/api/auth/passkeys/register/options', { token: u.token });
    const fake = Buffer.from(JSON.stringify({ challenge: 'otro' })).toString('base64url');
    const r = await call('POST', '/api/auth/passkeys/register/verify', {
      token: u.token,
      body: { response: { id: 'x', response: { clientDataJSON: fake } }, name: 'x' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'PASSKEY_INVALID');
    const list = await call('GET', '/api/auth/passkeys', { token: u.token });
    assert.deepEqual(list.body, []);
  });

  it('lista, renombra y borra las suyas; las de otro dan 404', async () => {
    const u = await withSession();
    const other = await withSession();
    const mine = await addPasskey(u.id);
    const web = await addPasskey(u.id, 'localhost');
    const theirs = await addPasskey(other.id);

    const list = await call('GET', '/api/auth/passkeys', { token: u.token });
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 2);
    const byId = Object.fromEntries(list.body.map((p: any) => [p.id, p]));
    assert.equal(byId[mine].here, true);
    assert.equal(byId[web].here, false);
    assert.equal(byId[mine].name, 'Mi llave');
    assert.equal(byId[theirs], undefined);

    const rename = await call('PATCH', `/api/auth/passkeys/${mine}`, {
      token: u.token,
      body: { name: 'Portátil' },
    });
    assert.equal(rename.status, 200);
    assert.equal(rename.body.name, 'Portátil');

    assert.equal(
      (await call('PATCH', `/api/auth/passkeys/${theirs}`, { token: u.token, body: { name: 'x' } }))
        .status,
      404,
    );
    assert.equal(
      (await call('DELETE', `/api/auth/passkeys/${theirs}`, { token: u.token })).status,
      404,
    );
    // Sigue ahí.
    assert.equal((await call('GET', '/api/auth/passkeys', { token: other.token })).body.length, 1);

    assert.equal(
      (await call('DELETE', `/api/auth/passkeys/${mine}`, { token: u.token })).status,
      204,
    );
    assert.equal((await call('GET', '/api/auth/passkeys', { token: u.token })).body.length, 1);
  });

  it('quitar el último factor con la política exigiéndolo da 409; con otro factor, no', async () => {
    const u = await withSession({ tenant: true });
    const only = await addPasskey(u.id);
    const blocked = await call('DELETE', `/api/auth/passkeys/${only}`, { token: u.token });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.code, 'MFA_REQUIRED_BY_POLICY');

    // Con una segunda passkey, la primera se puede quitar...
    const second = await addPasskey(u.id, 'localhost');
    assert.equal(
      (await call('DELETE', `/api/auth/passkeys/${only}`, { token: u.token })).status,
      204,
    );
    // ...y la que queda ya es la última.
    assert.equal(
      (await call('DELETE', `/api/auth/passkeys/${second}`, { token: u.token })).status,
      409,
    );

    // Con TOTP activo, la última passkey sí se puede quitar.
    const v = await withSession({ tenant: true, totp: true });
    const p = await addPasskey(v.id);
    assert.equal((await call('DELETE', `/api/auth/passkeys/${p}`, { token: v.token })).status, 204);

    // Sin política que lo exija, también.
    const w = await withSession();
    const q = await addPasskey(w.id);
    assert.equal((await call('DELETE', `/api/auth/passkeys/${q}`, { token: w.token })).status, 204);
  });

  it('borrar una passkey deja las demás sesiones fuera y la actual', async () => {
    const u = await withSession();
    const session2 = await createSession({
      userId: u.id,
      tenantId: null,
      method: 'password',
      mfa: null,
      client: { ip: '127.0.0.1', userAgent: 'test', clientKind: 'web' },
    });
    const p = await addPasskey(u.id);
    assert.equal((await call('DELETE', `/api/auth/passkeys/${p}`, { token: u.token })).status, 204);
    const rows: any = await t.publicDb.execute(
      sql`SELECT "revokedAt" FROM public."UserSession" WHERE id = ${session2.id}`,
    );
    assert.ok((rows.rows ?? rows)[0].revokedAt);
    assert.equal((await call('GET', '/api/auth/passkeys', { token: u.token })).status, 200);
  });

  it('passkey/options y verify: reto de un solo uso y respuesta falsa rechazada', async () => {
    const bad = await call('POST', '/api/auth/passkey/options', { origin: 'https://evil.example' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'ORIGIN_NOT_ALLOWED');

    const o = await call('POST', '/api/auth/passkey/options', { body: {} });
    assert.equal(o.status, 200);
    assert.ok(o.body.challenge);
    assert.ok(o.body.options.challenge);
    assert.equal(o.body.options.userVerification, 'required');
    assert.equal(o.body.options.allowCredentials, undefined);

    const wrong = await call('POST', '/api/auth/passkey/verify', {
      body: { challenge: o.body.challenge, response: { id: 'no-existe' } },
    });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.code, 'PASSKEY_INVALID');
    // El reto se gastó con el primer intento: queda consumido en la base.
    const used: any = await t.publicDb.execute(
      sql`SELECT status FROM public."AuthChallenge"
          WHERE kind = 'webauthn' AND data::jsonb->>'challenge' = ${o.body.options.challenge}`,
    );
    assert.equal((used.rows ?? used)[0].status, 'consumed');
    const again = await call('POST', '/api/auth/passkey/verify', {
      body: { challenge: o.body.challenge, response: { id: 'no-existe' } },
    });
    assert.equal(again.body.code, 'PASSKEY_INVALID');
    const unknown = await call('POST', '/api/auth/passkey/verify', {
      body: { challenge: 'inventado', response: {} },
    });
    assert.equal(unknown.status, 400);
  });

  it('el reto MFA ofrece passkey solo si tiene una para este origen, y la respuesta falsa no entra', async () => {
    const u = await t.createUser();
    await addPasskey(u.id);
    const login = (origin: string | null) =>
      call('POST', '/api/auth/login', {
        origin,
        body: { email: u.email, password: u.password },
      });
    const web = await login(WEB);
    assert.equal(web.body.mfaRequired, true);
    assert.deepEqual(web.body.methods, ['passkey']);
    // Otro RP (el escritorio): la passkey de la web no sirve ahí.
    assert.equal(web.body.passkeyElsewhere, undefined);
    const desktop = await login('http://localhost:43123');
    assert.deepEqual(desktop.body.methods, []);
    assert.equal(desktop.body.mfaRequired, true);
    assert.equal(desktop.body.passkeyElsewhere, true);
    assert.deepEqual(desktop.body.passkeyRpIds, ['erp.passkeys-test.example']);
    assert.equal(desktop.body.code, 'MFA_NOT_AVAILABLE_HERE');

    // Opciones atadas al usuario del reto y respuesta falsa.
    const o = await call('POST', '/api/auth/passkey/options', {
      body: { challenge: web.body.challenge },
    });
    assert.equal(o.status, 200);
    assert.equal(o.body.options.allowCredentials.length, 1);
    const fake = await call('POST', '/api/auth/mfa', {
      body: {
        challenge: web.body.challenge,
        passkey: { challenge: o.body.challenge, response: { id: 'x' } },
      },
    });
    assert.equal(fake.status, 401);
    assert.equal(fake.body.code, 'MFA_INVALID');
  });

  it('un reto de passkey del segundo factor no sirve para entrar sin contraseña', async () => {
    const u = await t.createUser();
    await addPasskey(u.id);
    const web = await call('POST', '/api/auth/login', {
      body: { email: u.email, password: u.password },
    });
    const o = await call('POST', '/api/auth/passkey/options', {
      body: { challenge: web.body.challenge },
    });
    assert.equal(o.status, 200);
    const r = await call('POST', '/api/auth/passkey/verify', {
      body: { challenge: o.body.challenge, response: { id: 'cred-x' } },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'PASSKEY_INVALID');
    // Y al revés: un reto sin usuario no cierra un reto MFA.
    const free = await call('POST', '/api/auth/passkey/options', { body: {} });
    const m = await call('POST', '/api/auth/mfa', {
      body: {
        challenge: web.body.challenge,
        passkey: { challenge: free.body.challenge, response: { id: 'cred-x' } },
      },
    });
    assert.equal(m.status, 401);
    assert.equal(m.body.code, 'MFA_INVALID');
  });

  it('dos borrados a la vez de las dos últimas passkeys no dejan al usuario sin factor', async () => {
    const u = await withSession({ tenant: true });
    const a = await addPasskey(u.id);
    const b = await addPasskey(u.id, 'localhost');
    const rs = await Promise.all(
      [a, b].map((id) => call('DELETE', `/api/auth/passkeys/${id}`, { token: u.token })),
    );
    assert.deepEqual(rs.map((r) => r.status).sort(), [204, 409]);
  });
});
