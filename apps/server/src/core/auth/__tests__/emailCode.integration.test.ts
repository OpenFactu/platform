import { after, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import express from 'express';
import { sql } from 'drizzle-orm';
import { authTestDatabaseUrl, useAuthTestDb } from './authTestDb';
import { createTestTenant, type TestTenant } from '../../tenant/__tests__/testTenant';
import { writeConfig } from '../../email/Mailer';
import { mailQueue } from '../../email/MailQueue';
import { DEFAULT_POLICY, writePolicy } from '../policy';
import { createHandoff, pollHandoff } from '../handoff';
import authRouter from '../../../api/auth';

// IP propia de esta ejecución: los contadores de otras pruebas no se tocan ni nos afectan.
const testIp = `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;
const WEB = 'https://erp.emailcode-test.example';

describe('código y enlace por correo', { skip: !authTestDatabaseUrl }, () => {
  let t: Awaited<ReturnType<typeof useAuthTestDb>>;
  let tenant: TestTenant;
  let server: http.Server;
  let base: string;
  let enqueue: ReturnType<typeof mock.method>;
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
    await writeConfig(tenant.db, { enabled: true, host: 'smtp.test.example' });
    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use('/api/auth', authRouter);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    mock.restoreAll();
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
  beforeEach(() => {
    mock.restoreAll();
    enqueue = mock.method(mailQueue, 'enqueue', () => 'mail-id');
  });

  const member = async () => {
    const u = await t.createUser();
    await t.publicDb.execute(
      sql`INSERT INTO public."UserTenantMembership" (id, "userId", "tenantId", role)
          VALUES (${crypto.randomUUID()}, ${u.id}, ${tenant.tenantId}, 'USER')`,
    );
    return u;
  };

  const call = async (method: string, path: string, body?: any) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': testIp,
        origin: WEB,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  // La petición responde antes de enviar: se da un momento a que el correo llegue a la cola.
  const mailsAfter = async (n: number) => {
    for (let i = 0; i < 80 && enqueue.mock.callCount() < n; i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    return enqueue.mock.callCount();
  };
  const lastMail = () => {
    const calls = enqueue.mock.calls;
    return calls[calls.length - 1].arguments[1] as any;
  };
  const codeOf = (mail: any) => /\b(\d{6})\b/.exec(mail.text)![1];
  const tokenOf = (mail: any) => /token=([\w-]+)/.exec(mail.text)![1];

  it('email inexistente responde igual y no encola', async () => {
    const known = await member();
    const a = await call('POST', '/api/auth/email-code', { email: known.email });
    const b = await call('POST', '/api/auth/email-code', { email: 'nadie@nada.test' });
    assert.equal(a.status, 202);
    assert.deepEqual(a.body, { sent: true });
    assert.equal(b.status, 202);
    assert.deepEqual(b.body, a.body);
    assert.equal(await mailsAfter(1), 1);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(enqueue.mock.callCount(), 1, 'solo el que existe recibe correo');
  });

  it('código correcto entra', async () => {
    const u = await member();
    await call('POST', '/api/auth/email-code', { email: u.email });
    await mailsAfter(1);
    const mail = lastMail();
    assert.equal(mail.to, u.email);
    assert.match(mail.text, new RegExp(`${WEB}/login/email\\?token=`));
    const r = await call('POST', '/api/auth/email-code/verify', {
      email: u.email,
      code: codeOf(mail),
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.token, 'abre sesión');
  });

  it('código usado no vale otra vez', async () => {
    const u = await member();
    await call('POST', '/api/auth/email-code', { email: u.email });
    await mailsAfter(1);
    const code = codeOf(lastMail());
    assert.equal(
      (await call('POST', '/api/auth/email-code/verify', { email: u.email, code })).status,
      200,
    );
    const again = await call('POST', '/api/auth/email-code/verify', { email: u.email, code });
    assert.equal(again.status, 401);
    assert.equal(again.body.code, 'CODE_INVALID');
  });

  it('5 códigos malos agotan el reto', async () => {
    const u = await member();
    await call('POST', '/api/auth/email-code', { email: u.email });
    await mailsAfter(1);
    const code = codeOf(lastMail());
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await call('POST', '/api/auth/email-code/verify', { email: u.email, code: wrong });
      assert.equal(r.status, 401);
    }
    const r = await call('POST', '/api/auth/email-code/verify', { email: u.email, code });
    assert.equal(r.status, 401, 'ni el bueno vale con el reto agotado');
    assert.equal(r.body.code, 'CODE_INVALID');
  });

  it('dos peticiones en 60 s envían un solo correo', async () => {
    const u = await member();
    const [a, b] = await Promise.all([
      call('POST', '/api/auth/email-code', { email: u.email }),
      call('POST', '/api/auth/email-code', { email: u.email }),
    ]);
    assert.equal(a.status, 202);
    assert.equal(b.status, 202);
    await mailsAfter(1);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(enqueue.mock.callCount(), 1);
  });

  it('enlace con handoff no entra en este navegador y aprueba el handoff', async () => {
    const u = await member();
    const h = await createHandoff({ ip: testIp, userAgent: 'x', clientKind: 'desktop' });
    await call('POST', '/api/auth/email-code', { email: u.email, handoffId: h.handoffId });
    await mailsAfter(1);
    const token = tokenOf(lastMail());

    const r = await call('POST', '/api/auth/email-link', { token });
    assert.equal(r.status, 200);
    assert.ok(r.body.handoff, 'enseña qué se aprueba');
    assert.equal(r.body.handoff.confirmCode, h.confirmCode);
    assert.equal(r.body.token, undefined, 'no abre sesión aquí');

    const ok = await call('POST', '/api/auth/email-link/approve', { token });
    assert.equal(ok.status, 200);
    const polled = await pollHandoff(h.handoffId, h.pollSecret);
    assert.equal(polled.status, 'approved');
    assert.equal((polled as any).userId, u.id);
    assert.equal((polled as any).method, 'email_code');
    assert.equal((polled as any).mfaDone, null, 'el correo no es segundo factor');

    const again = await call('POST', '/api/auth/email-link/approve', { token });
    assert.equal(again.status, 401);
  });

  it('enlace sin handoff abre sesión aquí, una vez', async () => {
    const u = await member();
    await call('POST', '/api/auth/email-code', { email: u.email });
    await mailsAfter(1);
    const token = tokenOf(lastMail());
    const r = await call('POST', '/api/auth/email-link', { token });
    assert.equal(r.status, 200);
    assert.ok(r.body.token);
    assert.equal((await call('POST', '/api/auth/email-link', { token })).status, 401);
  });

  it('el correo de una entrega no parece un acceso ni lleva código', async () => {
    const u = await member();
    const h = await createHandoff({ ip: testIp, userAgent: 'x', clientKind: 'desktop' });
    await call('POST', '/api/auth/email-code', { email: u.email, handoffId: h.handoffId });
    await mailsAfter(1);
    const mail = lastMail();
    assert.match(mail.subject, /Alguien quiere entrar/);
    assert.doesNotMatch((mail.text + mail.html).replace(/token=[\w-]+/g, ''), /\d{6}/,'sin código');
    assert.doesNotMatch(mail.text + mail.html, /entra directamente|Tu código de acceso/);
    assert.match(mail.html, /Revisar la solicitud/);
    assert.doesNotMatch(mail.html, />Entrar</);
    // Sin código, el verify no puede abrir nada con ese reto.
    for (const code of ['000000', '123456']) {
      const r = await call('POST', '/api/auth/email-code/verify', { email: u.email, code });
      assert.equal(r.status, 401);
    }
  });

  it('pedir códigos no bloquea los códigos de la víctima', async () => {
    const u = await member();
    await call('POST', '/api/auth/email-code', { email: u.email });
    await mailsAfter(1);
    const code = codeOf(lastMail());
    for (let i = 0; i < 6; i++) await call('POST', '/api/auth/email-code', { email: u.email });
    await new Promise((r) => setTimeout(r, 300));
    const r = await call('POST', '/api/auth/email-code/verify', { email: u.email, code });
    assert.equal(r.status, 200, 'las peticiones no cuentan contra la cuenta de los códigos');
  });

  it('approve con un enlace sin handoff responde 401, y mirar un enlace de handoff no lo gasta', async () => {
    const u = await member();
    await call('POST', '/api/auth/email-code', { email: u.email });
    await mailsAfter(1);
    const plain = tokenOf(lastMail());
    assert.equal(
      (await call('POST', '/api/auth/email-link/approve', { token: plain })).status,
      401,
    );
    // El enlace sigue sirviendo para entrar: approve no lo gastó.
    assert.equal((await call('POST', '/api/auth/email-link', { token: plain })).status, 200);

    const v = await member();
    const h = await createHandoff({ ip: testIp, userAgent: 'x', clientKind: 'desktop' });
    await call('POST', '/api/auth/email-code', { email: v.email, handoffId: h.handoffId });
    await mailsAfter(2);
    const token = tokenOf(lastMail());
    assert.equal((await call('POST', '/api/auth/email-link', { token })).status, 200);
    assert.equal((await call('POST', '/api/auth/email-link', { token })).status, 200);
    assert.equal((await call('POST', '/api/auth/email-link/approve', { token })).status, 200);
  });

  it('methods: refleja passkey, correo y la política de la empresa', async () => {
    const all = await call('GET', '/api/auth/methods');
    assert.equal(all.status, 200);
    assert.deepEqual(all.body, { password: true, passkey: true, emailCode: true, sso: [] });
    await writePolicy(tenant.db, { ...DEFAULT_POLICY, allowedMethods: ['sso'] });
    const some = await call('GET', `/api/auth/methods?tenantId=${tenant.tenantId}`);
    assert.deepEqual(some.body, { password: true, passkey: false, emailCode: false, sso: [] });
  });
});
