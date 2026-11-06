import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import express from 'express';
import { sql } from 'drizzle-orm';
import { authenticator } from 'otplib';
import { authTestDatabaseUrl, useAuthTestDb } from './authTestDb';
import { createTestTenant, type TestTenant } from '../../tenant/__tests__/testTenant';
import { DEFAULT_POLICY, writePolicy, type AuthPolicy } from '../policy';
import { hashCode } from '../totpCrypto';
import { listSessions, touchSession } from '../sessions';
import authRouter from '../../../api/auth';
import twoFactorRouter from '../../../api/twofa';
import settingsSecurityRouter from '../../../api/settingsSecurity';
import { startEventSocket, stopEventSocket } from '../../realtime/EventSocket';
import { mfaRequiredSomewhere } from '../policy';
import { encryptSecret } from '../totpCrypto';
import WebSocket from 'ws';
import { tenantContextMiddleware } from '../../../api/middleware/tenantContext';
import { restrictedSession } from '../../../api/middleware/restrictedSession';

const testIp = `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;

describe('política de acceso por empresa', { skip: !authTestDatabaseUrl }, () => {
  let t: Awaited<ReturnType<typeof useAuthTestDb>>;
  let tenantA: TestTenant; // sin exigencias
  let tenantB: TestTenant; // 2FA para todos
  let server: http.Server;
  let base: string;

  const setPolicy = (tenant: TestTenant, patch: Partial<AuthPolicy>) =>
    writePolicy(tenant.db, { ...DEFAULT_POLICY, ...patch });

  before(async () => {
    t = await useAuthTestDb();
    const opts = {
      url: authTestDatabaseUrl,
      guard: /auth_test/,
      publicSchemaReady: true,
      keepConnections: true,
    };
    tenantA = await createTestTenant(opts);
    tenantB = await createTestTenant(opts);
    await setPolicy(tenantB, { mfa: 'all' });

    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    // Mismo orden que server.ts: /api/auth antes del contexto de empresa.
    app.use('/api/auth', authRouter);
    app.use('/api', tenantContextMiddleware);
    app.use('/api', restrictedSession);
    app.get('/api/items', (_req, res) => res.json({ ok: true }));
    app.use('/api/2fa', twoFactorRouter);
    app.use('/api/settings/security', settingsSecurityRouter);
    server = http.createServer(app);
    startEventSocket(server);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    stopEventSocket();
    await new Promise((r) => (server ? server.close(r) : r(null)));
    if (t) {
      await t.publicDb.execute(
        sql`DELETE FROM public."AuthThrottle" WHERE key LIKE ${'%:ip:' + testIp}`,
      );
    }
    if (tenantA) await tenantA.drop();
    if (tenantB) await tenantB.drop();
    if (t) await t.drop();
  });

  const call = async (method: string, path: string, body?: any, token?: string) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': testIp,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  const member = async (tenants: TestTenant[], role = 'USER') => {
    const u = await t.createUser({ role });
    for (const tn of tenants) {
      await t.publicDb.execute(
        sql`INSERT INTO public."UserTenantMembership" (id, "userId", "tenantId", role, "updatedAt")
            VALUES (${crypto.randomUUID()}, ${u.id}, ${tn.tenantId}, ${role}, now())`,
      );
    }
    return u;
  };

  const login = (u: { email: string; password: string }, tenantId: string) =>
    call('POST', '/api/auth/login', {
      email: u.email,
      password: u.password,
      selectedTenantId: tenantId,
    });

  it('switch-tenant a empresa con mfa all deja la sesión restringida', async () => {
    const u = await member([tenantA, tenantB]);
    const r = await login(u, tenantA.tenantId);
    assert.equal(r.status, 200);
    assert.equal(r.body.user.restricted, null);
    const sw = await call(
      'POST',
      '/api/auth/switch-tenant',
      { tenantId: tenantB.tenantId },
      r.body.token,
    );
    assert.equal(sw.status, 200);
    assert.equal(sw.body.user.restricted, 'mfa_setup');
    const me = await call('GET', '/api/auth/me', undefined, sw.body.token);
    assert.equal(me.body.restricted, 'mfa_setup');
    // Volver a una empresa sin exigencias levanta la restricción.
    const back = await call(
      'POST',
      '/api/auth/switch-tenant',
      { tenantId: tenantA.tenantId },
      sw.body.token,
    );
    assert.equal(back.body.user.restricted, null);
  });

  it('el login en una empresa con mfa all entra restringido', async () => {
    const u = await member([tenantB]);
    const r = await login(u, tenantB.tenantId);
    assert.equal(r.status, 200);
    assert.equal(r.body.user.restricted, 'mfa_setup');
  });

  it('refresh no quita la restricción', async () => {
    const u = await member([tenantB]);
    const r = await login(u, tenantB.tenantId);
    const rf = await call('POST', '/api/auth/refresh', {}, r.body.token);
    assert.equal(rf.status, 200);
    const me = await call('GET', '/api/auth/me', undefined, rf.body.token);
    assert.equal(me.body.restricted, 'mfa_setup');
  });

  it('sesión restringida recibe 403 en /api/items y 200 en /api/2fa/status', async () => {
    const u = await member([tenantB]);
    const r = await login(u, tenantB.tenantId);
    const items = await call('GET', '/api/items', undefined, r.body.token);
    assert.equal(items.status, 403);
    assert.equal(items.body.code, 'SESSION_RESTRICTED');
    const st = await call('GET', '/api/2fa/status', undefined, r.body.token);
    assert.equal(st.status, 200);
  });

  it('activar 2FA quita la restricción', async () => {
    const u = await member([tenantB]);
    const r = await login(u, tenantB.tenantId);
    const setup = await call('POST', '/api/2fa/setup', {}, r.body.token);
    assert.equal(setup.status, 200);
    const en = await call(
      'POST',
      '/api/2fa/enable',
      { code: authenticator.generate(setup.body.secret) },
      r.body.token,
    );
    assert.equal(en.status, 200);
    const items = await call('GET', '/api/items', undefined, r.body.token);
    assert.equal(items.status, 200);
  });

  it('un SUPERUSER nunca queda restringido', async () => {
    const u = await t.createUser({ role: 'SUPERUSER' });
    const r = await login(u, tenantB.tenantId);
    assert.equal(r.status, 200);
    assert.equal(r.body.user.restricted, null);
  });

  it('ssoRequired rechaza el login con contraseña', async () => {
    const tn = await createTestTenant({
      url: authTestDatabaseUrl,
      guard: /auth_test/,
      publicSchemaReady: true,
      keepConnections: true,
    });
    try {
      await setPolicy(tn, { ssoRequired: true });
      const u = await member([tn]);
      const r = await login(u, tn.tenantId);
      assert.equal(r.status, 403);
      assert.equal(r.body.code, 'SSO_REQUIRED');
    } finally {
      await tn.drop();
    }
  });

  it('idleHours 1 hace que la sesión caduque a la hora', async () => {
    const tn = await createTestTenant({
      url: authTestDatabaseUrl,
      guard: /auth_test/,
      publicSchemaReady: true,
      keepConnections: true,
    });
    try {
      await setPolicy(tn, { idleHours: 1 });
      const u = await member([tn]);
      const r = await login(u, tn.tenantId);
      assert.equal(r.status, 200);
      const [s] = await listSessions(u.id);
      assert.equal(s.idleHours, 1);
      const left = s.expiresAt.getTime() - Date.now();
      assert.ok(left > 55 * 60_000 && left <= 60 * 60_000, `quedan ${left} ms`);
      await touchSession(s.id);
      const [again] = await listSessions(u.id);
      const after = again.expiresAt.getTime() - Date.now();
      assert.ok(after > 55 * 60_000 && after <= 60 * 60_000, `tras renovar quedan ${after} ms`);
    } finally {
      await tn.drop();
    }
  });

  it('la regla más estricta de dos empresas gana al cambiar contraseña', async () => {
    await setPolicy(tenantA, {
      passwordRules: { enabled: true, minLength: 8, blockCommon: false },
    });
    await setPolicy(tenantB, {
      mfa: 'all',
      passwordRules: { enabled: true, minLength: 12, blockCommon: true },
    });
    try {
      const u = await member([tenantA, tenantB]);
      const reset = async (password: string) => {
        const token = crypto.randomBytes(16).toString('hex');
        await t.publicDb.execute(
          sql`UPDATE public."GlobalUser"
              SET "resetTokenHash" = ${hashCode(token)}, "resetTokenExpiresAt" = ${new Date(Date.now() + 3_600_000)}
              WHERE id = ${u.id}`,
        );
        return call('POST', '/api/auth/reset-password', { token, newPassword: password });
      };
      // 9 caracteres valen para A (8) pero no para B (12).
      const short = await reset('xk3-Vuel9');
      assert.equal(short.status, 400);
      assert.equal(short.body.code, 'PASSWORD_TOO_SHORT');
      // Larga, pero común: B bloquea las comunes aunque A no.
      const common = await reset('mailcreated5240');
      assert.equal(common.status, 400);
      assert.equal(common.body.code, 'PASSWORD_TOO_COMMON');
      const ok = await reset('xk3-Vuelo-Azul-77');
      assert.equal(ok.status, 200);
    } finally {
      await setPolicy(tenantA, {});
      await setPolicy(tenantB, { mfa: 'all' });
    }
  });

  const wsClose = (token: string, tenantId: string) =>
    new Promise<{ code: number; opened: boolean }>((resolve) => {
      const ws = new WebSocket(
        `${base.replace('http', 'ws')}/ws/events?tenant=${tenantId}&token=${token}`,
      );
      let opened = false;
      ws.on('message', () => {
        opened = true;
        ws.close();
      });
      ws.on('close', (code) => resolve({ code, opened }));
      setTimeout(() => ws.close(), 3000);
    });

  it('una sesión restringida no abre /ws/events; una normal sí', async () => {
    const u = await member([tenantA, tenantB]);
    const restricted = await login(u, tenantB.tenantId);
    const r1 = await wsClose(restricted.body.token, tenantB.tenantId);
    assert.equal(r1.code, 4403);
    assert.equal(r1.opened, false);
    const free = await login(u, tenantA.tenantId);
    const r2 = await wsClose(free.body.token, tenantA.tenantId);
    assert.equal(r2.opened, true);
  });

  it('switch-tenant respeta SSO_REQUIRED y METHOD_NOT_ALLOWED', async () => {
    const u = await member([tenantA, tenantB]);
    const r = await login(u, tenantA.tenantId);
    try {
      await setPolicy(tenantB, { ssoRequired: true });
      const sso = await call(
        'POST',
        '/api/auth/switch-tenant',
        { tenantId: tenantB.tenantId },
        r.body.token,
      );
      assert.equal(sso.status, 403);
      assert.equal(sso.body.code, 'SSO_REQUIRED');
      await setPolicy(tenantB, { allowedMethods: ['sso', 'passkey'] });
      const m = await call(
        'POST',
        '/api/auth/switch-tenant',
        { tenantId: tenantB.tenantId },
        r.body.token,
      );
      assert.equal(m.status, 403);
      assert.equal(m.body.code, 'METHOD_NOT_ALLOWED');
      // La sesión sigue en la empresa de antes.
      const me = await call('GET', '/api/auth/me', undefined, r.body.token);
      assert.equal(me.body.tenantId, tenantA.tenantId);
    } finally {
      await setPolicy(tenantB, { mfa: 'all' });
    }
  });

  it('la política no deja a un administrador fuera ni exige SSO sin proveedor', async () => {
    const admin = await member([tenantA], 'ADMIN');
    const r = await login(admin, tenantA.tenantId);
    const put = (body: any, token = r.body.token) =>
      call('PUT', '/api/settings/security', body, token);
    const noPassword = await put({ allowedMethods: ['passkey', 'email_code', 'sso'] });
    assert.equal(noPassword.status, 409);
    assert.equal(noPassword.body.code, 'POLICY_LOCKOUT');
    const sso = await put({ ssoRequired: true });
    assert.equal(sso.status, 409);
    const onlySso = await put({ allowedMethods: ['sso'] });
    assert.equal(onlySso.status, 409);
    const ok = await put({ idleHours: 8 });
    assert.equal(ok.status, 200);
    assert.equal(
      (await call('GET', '/api/settings/security', undefined, r.body.token)).body.idleHours,
      8,
    );
    // Un SUPERUSER está exento del bloqueo propio, no del check de SSO.
    const sup = await t.createUser({ role: 'SUPERUSER' });
    const sr = await login(sup, tenantA.tenantId);
    const supOk = await put({ allowedMethods: ['passkey', 'email_code'] }, sr.body.token);
    assert.equal(supOk.status, 200);
    const supSso = await put({ ssoRequired: true }, sr.body.token);
    assert.equal(supSso.status, 409);
    await setPolicy(tenantA, {});
  });

  it('no se puede desactivar el 2FA si una empresa lo exige', async () => {
    const u = await t.createUser({ totp: true });
    await t.publicDb.execute(
      sql`UPDATE public."GlobalUser" SET "totpSecret" = ${encryptSecret(authenticator.generateSecret())} WHERE id = ${u.id}`,
    );
    await t.publicDb.execute(
      sql`INSERT INTO public."UserTenantMembership" (id, "userId", "tenantId", role, "updatedAt")
          VALUES (${crypto.randomUUID()}, ${u.id}, ${tenantB.tenantId}, 'USER', now())`,
    );
    await t.publicDb.execute(
      sql`INSERT INTO public."UserTenantMembership" (id, "userId", "tenantId", role, "updatedAt")
          VALUES (${crypto.randomUUID()}, ${u.id}, ${tenantA.tenantId}, 'USER', now())`,
    );
    assert.equal(await mfaRequiredSomewhere(u.id), true);
    const only = await t.createUser({});
    await t.publicDb.execute(
      sql`INSERT INTO public."UserTenantMembership" (id, "userId", "tenantId", role, "updatedAt")
          VALUES (${crypto.randomUUID()}, ${only.id}, ${tenantA.tenantId}, 'USER', now())`,
    );
    assert.equal(await mfaRequiredSomewhere(only.id), false);
    const sup = await t.createUser({ role: 'SUPERUSER' });
    await t.publicDb.execute(
      sql`INSERT INTO public."UserTenantMembership" (id, "userId", "tenantId", role, "updatedAt")
          VALUES (${crypto.randomUUID()}, ${sup.id}, ${tenantB.tenantId}, 'SUPERUSER', now())`,
    );
    assert.equal(await mfaRequiredSomewhere(sup.id), false);
    // Por HTTP: entra con un código y, tras activar la sesión, el disable da 409.
    const sec = authenticator.generateSecret();
    await t.publicDb.execute(
      sql`UPDATE public."GlobalUser" SET "totpSecret" = ${encryptSecret(sec)} WHERE id = ${u.id}`,
    );
    const r = await call('POST', '/api/auth/login', {
      email: u.email,
      password: u.password,
      selectedTenantId: tenantA.tenantId,
      totpCode: authenticator.generate(sec),
    });
    assert.equal(r.status, 200);
    const dis = await call('POST', '/api/2fa/disable', { code: '000000' }, r.body.token);
    assert.equal(dis.status, 409);
    assert.equal(dis.body.code, 'MFA_REQUIRED_BY_POLICY');
  });
});
