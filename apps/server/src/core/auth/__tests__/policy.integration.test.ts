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
});
