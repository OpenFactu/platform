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
import { tenantContextMiddleware } from '../../../api/middleware/tenantContext';
import authRouter from '../../../api/auth';

// IP propia de esta ejecución: los contadores de otras pruebas no se tocan ni nos afectan.
const testIp = `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;
const client = { ip: testIp, userAgent: 'test', clientKind: 'web' as const };

/**
 * La cabecera `x-tenant-id` no puede llevar una sesión a otra empresa que la suya: la
 * política de esa otra empresa (SSO obligatorio, métodos, MFA) solo se aplica al entrar o
 * en `/switch-tenant`.
 */
describe('cabecera x-tenant-id con sesión', { skip: !authTestDatabaseUrl }, () => {
  let t: Awaited<ReturnType<typeof useAuthTestDb>>;
  let b: TestTenant;
  let server: http.Server;
  let base: string;
  const tenantA = `th-${crypto.randomBytes(5).toString('hex')}`;

  before(async () => {
    t = await useAuthTestDb();
    b = await createTestTenant({
      url: authTestDatabaseUrl,
      guard: /auth_test/,
      publicSchemaReady: true,
      keepConnections: true,
    });
    await writePolicy(b.db, { ...DEFAULT_POLICY, ssoRequired: true });
    await t.publicDb.execute(
      sql`INSERT INTO public."Tenant" (id, name, "schemaName") VALUES (${tenantA}, ${tenantA}, ${'tenant_' + tenantA})`,
    );
    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    // Mismo orden que server.ts: /api/auth va ANTES del contexto de empresa.
    app.use('/api/auth', authRouter);
    app.use('/api', tenantContextMiddleware);
    app.get('/api/probe', (req: any, res) => res.json({ tenantId: req.tenantId ?? null }));
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
    if (b) await b.drop();
    if (t) {
      await t.publicDb.execute(sql`DELETE FROM public."Tenant" WHERE id = ${tenantA}`);
      await t.drop();
    }
  });

  const call = async (
    method: string,
    path: string,
    token?: string,
    tenant?: string,
    body?: any,
  ) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': testIp,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(tenant ? { 'x-tenant-id': tenant } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  const join = async (userId: string, tenantId: string) =>
    t.publicDb.execute(
      sql`INSERT INTO public."UserTenantMembership" (id, "userId", "tenantId", role)
          VALUES (${crypto.randomUUID()}, ${userId}, ${tenantId}, 'USER')`,
    );

  const tokenFor = async (
    u: { id: string; email: string },
    tenantId: string | null,
    role = 'USER',
  ) => {
    const s = await createSession({
      userId: u.id,
      tenantId,
      method: 'password',
      mfa: null,
      client,
    });
    return issueToken(s, { id: u.id, email: u.email, username: 'x', role });
  };

  it('login con contraseña sin empresa + cabecera de una empresa con SSO obligatorio → 403', async () => {
    const u = await t.createUser();
    // Sin elegir empresa entra en la primera membresía (A); B exige SSO.
    await join(u.id, tenantA);
    await join(u.id, b.tenantId);
    const login = await call('POST', '/api/auth/login', undefined, undefined, {
      email: u.email,
      password: u.password,
    });
    assert.equal(login.status, 200);
    const r = await call('GET', '/api/probe', login.body.token, b.tenantId);
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'SWITCH_TENANT_REQUIRED');
  });

  it('login con contraseña sin empresa, con solo una que exige SSO → rechazado al entrar', async () => {
    const u = await t.createUser();
    await join(u.id, b.tenantId);
    const login = await call('POST', '/api/auth/login', undefined, undefined, {
      email: u.email,
      password: u.password,
    });
    assert.equal(login.status, 403);
    assert.equal(login.body.code, 'SSO_REQUIRED');
  });

  it('sesión en A + cabecera B → 403', async () => {
    const u = await t.createUser();
    await join(u.id, tenantA);
    await join(u.id, b.tenantId);
    const r = await call('GET', '/api/probe', await tokenFor(u, tenantA), b.tenantId);
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'SWITCH_TENANT_REQUIRED');
  });

  it('SUPERUSER + cabecera B → pasa', async () => {
    const u = await t.createUser({ role: 'SUPERUSER' });
    const r = await call('GET', '/api/probe', await tokenFor(u, null, 'SUPERUSER'), b.tenantId);
    assert.equal(r.status, 200);
    assert.equal(r.body.tenantId, b.tenantId);
  });

  it('cabecera igual a la empresa de la sesión → pasa', async () => {
    const u = await t.createUser();
    await join(u.id, b.tenantId);
    const r = await call('GET', '/api/probe', await tokenFor(u, b.tenantId), b.tenantId);
    assert.equal(r.status, 200);
    assert.equal(r.body.tenantId, b.tenantId);
  });

  it('sin cabecera usa la empresa de la sesión', async () => {
    const u = await t.createUser();
    await join(u.id, b.tenantId);
    const r = await call('GET', '/api/probe', await tokenFor(u, b.tenantId));
    assert.equal(r.status, 200);
    assert.equal(r.body.tenantId, b.tenantId);
  });
});
