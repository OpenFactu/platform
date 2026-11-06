import { after, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import express from 'express';
import { sql } from 'drizzle-orm';
import { authTestDatabaseUrl, useAuthTestDb } from './authTestDb';
import { listAuthEvents, recordAuthEvent } from '../authEvents';
import { runAuthCleanup } from '../authCleanupCron';
import { mailQueue } from '../../email/MailQueue';
import authRouter from '../../../api/auth';
import usersRouter from '../../../api/users';
import { mountApi } from '../apiMounts';

// IP propia de esta ejecución: los contadores de otras pruebas no se tocan ni nos afectan.
const testIp = `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;

describe(
  'historial de accesos y aviso de dispositivo nuevo',
  { skip: !authTestDatabaseUrl },
  () => {
    let t: Awaited<ReturnType<typeof useAuthTestDb>>;
    let server: http.Server;
    let base: string;
    let enqueue: ReturnType<typeof mock.method>;
    const tenantId = `at-t-${crypto.randomBytes(4).toString('hex')}`;
    const savedOrigin = process.env.WEB_ORIGIN;

    before(async () => {
      process.env.WEB_ORIGIN = 'https://erp.test';
      t = await useAuthTestDb();
      await t.publicDb.execute(
        sql`INSERT INTO public."Tenant" (id, name, "schemaName") VALUES (${tenantId}, ${tenantId}, ${'tenant_' + tenantId})`,
      );
      const app = express();
      app.set('trust proxy', true);
      app.use(express.json());
      app.use('/api/auth', authRouter);
      // Como tras el contexto de empresa, y con el mismo gate de permisos que server.ts.
      app.use('/api/users', (req: any, _res, next) => {
        const actor = String(req.headers['x-test-actor'] || 'ADMIN');
        req.user = actor.startsWith('user:')
          ? { id: actor.slice(5), role: 'USER' }
          : { id: 'admin-x', role: actor };
        req.tenantId = tenantId;
        next();
      });
      mountApi(app, '/api/users', '/users', usersRouter);
      server = http.createServer(app);
      await new Promise<void>((r) => server.listen(0, r));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    after(async () => {
      process.env.WEB_ORIGIN = savedOrigin;
      mock.restoreAll();
      await new Promise((r) => (server ? server.close(r) : r(null)));
      if (t) {
        await t.publicDb.execute(
          sql`DELETE FROM public."AuthThrottle" WHERE key LIKE ${'%:ip:' + testIp}`,
        );
        await t.publicDb.execute(sql`DELETE FROM public."Tenant" WHERE id = ${tenantId}`);
        await t.drop();
      }
    });
    beforeEach(() => {
      mock.restoreAll();
      enqueue = mock.method(mailQueue, 'enqueue', () => 'mail-id');
    });

    // Los fallos se apuntan sin esperar: se da un momento a que lleguen.
    const eventsOf = async (userId: string, n: number) => {
      for (let i = 0; i < 40; i++) {
        const e = await listAuthEvents(userId, 20);
        if (e.length >= n) return e;
        await new Promise((r) => setTimeout(r, 25));
      }
      return listAuthEvents(userId, 20);
    };

    const member = async () => {
      const u = await t.createUser();
      await t.publicDb.execute(
        sql`INSERT INTO public."UserTenantMembership" (id, "userId", "tenantId", role)
          VALUES (${crypto.randomUUID()}, ${u.id}, ${tenantId}, 'USER')`,
      );
      return u;
    };

    const call = async (
      method: string,
      path: string,
      opts: { token?: string; body?: any; headers?: Record<string, string> } = {},
    ) => {
      const res = await fetch(base + path, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': testIp,
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
          ...(opts.headers ?? {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    };

    const login = (u: { email: string; password: string }, headers: Record<string, string> = {}) =>
      call('POST', '/api/auth/login', {
        body: { email: u.email, password: u.password, selectedTenantId: tenantId },
        headers,
      });

    it('login correcto deja evento login ok', async () => {
      const u = await member();
      const r = await login(u, { 'x-keirost-device': 'dev-ok' });
      assert.equal(r.status, 200);
      const events = await listAuthEvents(u.id, 10);
      assert.equal(events.length, 1);
      assert.equal(events[0].kind, 'login');
      assert.equal(events[0].ok, true);
      assert.equal(events[0].deviceId, 'dev-ok');
      assert.equal(events[0].ip, testIp);
    });

    it('contraseña mala deja login no ok con el userId', async () => {
      const u = await member();
      const r = await login({ email: u.email, password: 'mala' });
      assert.equal(r.status, 401);
      const events = await eventsOf(u.id, 1);
      assert.equal(events.length, 1);
      assert.equal(events[0].kind, 'login');
      assert.equal(events[0].ok, false);
    });

    it('el primer login no avisa; un dispositivo nuevo encola un correo y repetirlo no', async () => {
      const u = await member();
      assert.equal((await login(u, { 'x-keirost-device': 'dev-a' })).status, 200);
      assert.equal(enqueue.mock.callCount(), 0, 'el primer login de la cuenta no es sospechoso');

      assert.equal(
        (
          await login(u, {
            'x-keirost-device': 'dev-b',
            'user-agent': 'Mozilla/5.0 (Windows) Firefox/120.0',
          })
        ).status,
        200,
      );
      assert.equal(enqueue.mock.callCount(), 1);
      const [tid, mail] = enqueue.mock.calls[0].arguments as any[];
      assert.equal(tid, tenantId);
      assert.equal(mail.to, u.email);
      assert.match(mail.html, /https:\/\/erp\.test\/profile\/security/);

      assert.equal(
        (
          await login(u, {
            'x-keirost-device': 'dev-b',
            'user-agent': 'Mozilla/5.0 (Windows) Firefox/120.0',
          })
        ).status,
        200,
      );
      assert.equal(enqueue.mock.callCount(), 1, 'el dispositivo ya es conocido');
    });

    it('dispositivo nuevo cada vez con el mismo UA: un solo correo en 24 h', async () => {
      const u = await member();
      const ua = { 'user-agent': 'Keirost Desktop test-ua' };
      await login(u, { 'x-keirost-device': 'd0', ...ua });
      for (const d of ['d1', 'd2', 'd3']) {
        assert.equal((await login(u, { 'x-keirost-device': d, ...ua })).status, 200);
      }
      assert.equal(enqueue.mock.callCount(), 1);
    });

    it('el bloqueo de la cuenta deja un evento lockout con el userId', async () => {
      const u = await member();
      for (let i = 0; i < 5; i++) await login({ email: u.email, password: 'mala' });
      await eventsOf(u.id, 6);
      const events = await listAuthEvents(u.id, 20);
      assert.ok(events.some((e) => e.kind === 'lockout' && !e.ok));
      await t.publicDb.execute(
        sql`DELETE FROM public."AuthThrottle" WHERE key LIKE ${'%:ip:' + testIp} OR key LIKE ${'%:acct:' + u.email}`,
      );
    });

    it('GET /api/auth/events devuelve el historial propio; logout y revoke dejan eventos', async () => {
      const u = await member();
      const token = (await login(u)).body.token;
      assert.equal((await call('GET', '/api/auth/events?limit=5')).status, 401);
      const r = await call('GET', '/api/auth/events?limit=5', { token });
      assert.equal(r.status, 200);
      assert.equal(r.body.events[0].kind, 'login');
      await call('POST', '/api/auth/logout', { token });
      const kinds = (await listAuthEvents(u.id, 10)).map((e) => e.kind);
      assert.ok(kinds.includes('logout'));
    });

    it('/api/users/:id: solo de la empresa; DELETE sessions cierra y deja evento', async () => {
      const u = await member();
      const token = (await login(u)).body.token;
      const s = await call('GET', `/api/users/${u.id}/sessions`);
      assert.equal(s.status, 200);
      assert.equal(s.body.sessions.length, 1);
      assert.equal(
        (await call('GET', `/api/users/${u.id}/auth-events`)).body.events[0].kind,
        'login',
      );

      const outsider = await t.createUser();
      assert.equal((await call('GET', `/api/users/${outsider.id}/sessions`)).status, 404);
      assert.equal((await call('DELETE', `/api/users/${outsider.id}/sessions`)).status, 404);

      const d = await call('DELETE', `/api/users/${u.id}/sessions`);
      assert.equal(d.status, 200);
      assert.equal(d.body.revoked, 1);
      assert.equal((await call('GET', '/api/auth/events', { token })).status, 401);
      assert.ok((await listAuthEvents(u.id, 10)).some((e) => e.kind === 'revoke'));
    });

    it('un administrador no ve ni toca a un SUPERUSER; un SUPERUSER sí', async () => {
      const su = await t.createUser({ role: 'SUPERUSER' });
      await t.publicDb.execute(
        sql`INSERT INTO public."UserTenantMembership" (id, "userId", "tenantId", role)
            VALUES (${crypto.randomUUID()}, ${su.id}, ${tenantId}, 'ADMIN')`,
      );
      await login(su);
      for (const [m, p] of [
        ['GET', 'auth-events'],
        ['GET', 'sessions'],
        ['DELETE', 'sessions'],
      ]) {
        const r = await call(m, `/api/users/${su.id}/${p}`);
        assert.equal(r.status, 404, `${m} ${p} como ADMIN`);
      }
      const asSu = { headers: { 'x-test-actor': 'SUPERUSER' } };
      assert.equal((await call('GET', `/api/users/${su.id}/auth-events`, asSu)).status, 200);
      assert.equal((await call('GET', `/api/users/${su.id}/sessions`, asSu)).status, 200);
      assert.equal((await call('DELETE', `/api/users/${su.id}/sessions`, asSu)).status, 200);
    });

    it('DELETE /api/users/:id/sessions pide escritura de /users; con solo lectura, 403', async () => {
      const target = await member();
      const reader = await t.createUser();
      await t.publicDb.execute(
        sql`INSERT INTO public."UserTenantMembership" (id, "userId", "tenantId", role, permissions)
            VALUES (${crypto.randomUUID()}, ${reader.id}, ${tenantId}, 'USER', ${JSON.stringify({ '/users': { read: true } })})`,
      );
      const asReader = { headers: { 'x-test-actor': `user:${reader.id}` } };
      assert.equal((await call('GET', `/api/users/${target.id}/sessions`, asReader)).status, 200);
      assert.equal(
        (await call('DELETE', `/api/users/${target.id}/sessions`, asReader)).status,
        403,
      );
    });

    it('el correo escapa un user agent malicioso', async () => {
      const u = await member();
      await login(u, { 'x-keirost-device': 'm0' });
      await login(u, { 'x-keirost-device': 'm1', 'user-agent': '<img src=x onerror=alert(1)>' });
      assert.equal(enqueue.mock.callCount(), 1);
      const mail = (enqueue.mock.calls[0].arguments as any[])[1];
      assert.ok(!mail.html.includes('<img'));
      assert.ok(!mail.html.includes('onerror=alert(1)>'));
    });

    it('la limpieza borra sesiones revocadas o caducadas hace más de 7 días', async () => {
      const u = await t.createUser();
      const old = new Date(Date.now() - 10 * 86400_000);
      const future = new Date(Date.now() + 86400_000);
      const ins = (id: string, expiresAt: Date, revokedAt: Date | null) =>
        t.publicDb.execute(
          sql`INSERT INTO public."UserSession" (id, "userId", "expiresAt", "absoluteExpiresAt", "revokedAt")
              VALUES (${id}, ${u.id}, ${expiresAt}, ${future}, ${revokedAt})`,
        );
      const ids = [
        's-' + crypto.randomUUID(),
        's-' + crypto.randomUUID(),
        's-' + crypto.randomUUID(),
      ];
      await ins(ids[0], old, null); // caducada hace tiempo
      await ins(ids[1], future, old); // revocada hace tiempo
      await ins(ids[2], future, null); // viva
      await runAuthCleanup();
      const rows: any = await t.publicDb.execute(
        sql`SELECT id FROM public."UserSession" WHERE "userId" = ${u.id}`,
      );
      assert.deepEqual(
        (rows.rows ?? rows).map((r: any) => r.id),
        [ids[2]],
      );
    });

    it('la limpieza borra eventos de más de 365 días y deja los recientes', async () => {
      const u = await t.createUser();
      await recordAuthEvent({
        userId: u.id,
        kind: 'login',
        ok: true,
        client: { ip: '1.1.1.1', userAgent: 'x', clientKind: 'web' },
      });
      await t.publicDb.execute(
        sql`INSERT INTO public."AuthEvent" (id, "userId", at, kind, ok) VALUES (${crypto.randomUUID()}, ${u.id}, ${new Date(Date.now() - 400 * 86400_000)}, 'login', true)`,
      );
      await runAuthCleanup();
      assert.equal((await listAuthEvents(u.id, 10)).length, 1);
    });
  },
);
