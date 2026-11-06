import { after, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import express from 'express';
import { sql } from 'drizzle-orm';
import { authTestDatabaseUrl, useAuthTestDb } from './authTestDb';
import { createTestTenant, type TestTenant } from '../../tenant/__tests__/testTenant';
import { mailQueue } from '../../email/MailQueue';
import { encryptSecret } from '../totpCrypto';
import { createHandoff, pollHandoff } from '../handoff';
import authRouter from '../../../api/auth';
import authProvidersRouter from '../../../api/authProviders';

// IP propia de esta ejecución: los contadores de otras pruebas no se tocan ni nos afectan.
const testIp = `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;
const CLIENT_ID = 'keirost-test';
const CLIENT_SECRET = 'shh-' + crypto.randomBytes(6).toString('hex');

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** Proveedor OIDC de mentira: lo justo para un flujo de código con PKCE. */
function fakeIdp() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'k1';
  const jwk = { ...(publicKey.export({ format: 'jwk' }) as any), kid, alg: 'RS256', use: 'sig' };
  const codes = new Map<string, { nonce: string; challenge: string; claims: any }>();
  const state = { issuer: '', claims: {} as Record<string, any> };

  const sign = (payload: object) => {
    const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
    const body = b64u(JSON.stringify(payload));
    const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), privateKey);
    return `${head}.${body}.${b64u(sig)}`;
  };

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.get('/.well-known/openid-configuration', (_req, res) => {
    res.json({
      issuer: state.issuer,
      authorization_endpoint: `${state.issuer}/authorize`,
      token_endpoint: `${state.issuer}/token`,
      jwks_uri: `${state.issuer}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    });
  });
  app.get('/jwks', (_req, res) => res.json({ keys: [jwk] }));
  app.get('/authorize', (req, res) => {
    const q = req.query as Record<string, string>;
    const code = crypto.randomBytes(12).toString('hex');
    codes.set(code, { nonce: q.nonce, challenge: q.code_challenge, claims: { ...state.claims } });
    const to = new URL(q.redirect_uri);
    to.searchParams.set('code', code);
    to.searchParams.set('state', q.state);
    res.redirect(302, to.toString());
  });
  app.post('/token', (req, res) => {
    const c = codes.get(req.body.code);
    codes.delete(req.body.code);
    const pkce = crypto.createHash('sha256').update(String(req.body.code_verifier)).digest();
    if (!c || b64u(pkce) !== c.challenge) return res.status(400).json({ error: 'invalid_grant' });
    const now = Math.floor(Date.now() / 1000);
    res.json({
      access_token: crypto.randomBytes(8).toString('hex'),
      token_type: 'Bearer',
      expires_in: 300,
      id_token: sign({
        iss: state.issuer,
        aud: CLIENT_ID,
        iat: now,
        exp: now + 300,
        nonce: c.nonce,
        ...c.claims,
      }),
    });
  });
  return { app, state };
}

describe('SSO con OIDC', { skip: !authTestDatabaseUrl }, () => {
  let t: Awaited<ReturnType<typeof useAuthTestDb>>;
  let tenant: TestTenant;
  let server: http.Server;
  let idpServer: http.Server;
  let base: string;
  let idp: ReturnType<typeof fakeIdp>;
  let providerId: string;
  let enqueue: ReturnType<typeof mock.method>;
  const providers: string[] = [];
  const prevOrigin = process.env.WEB_ORIGIN;
  // Lo que pone `tenantContext` delante de `mountShared`: aquí, a mano.
  let actingUser: any = null;

  before(async () => {
    t = await useAuthTestDb();
    tenant = await createTestTenant({
      url: authTestDatabaseUrl,
      guard: /auth_test/,
      publicSchemaReady: true,
      keepConnections: true,
    });
    idp = fakeIdp();
    idpServer = http.createServer(idp.app);
    await new Promise<void>((r) => idpServer.listen(0, r));
    idp.state.issuer = `http://127.0.0.1:${(idpServer.address() as AddressInfo).port}`;

    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use(
      '/api/auth-providers',
      (req: any, _res, next) => {
        req.user = actingUser;
        next();
      },
      authProvidersRouter,
    );
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // El callback vuelve a este mismo servidor.
    process.env.WEB_ORIGIN = base;
    providerId = await addProvider({});
  });
  after(async () => {
    mock.restoreAll();
    if (prevOrigin === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = prevOrigin;
    await new Promise((r) => (server ? server.close(r) : r(null)));
    await new Promise((r) => (idpServer ? idpServer.close(r) : r(null)));
    if (t) {
      for (const id of providers) {
        await t.publicDb.execute(sql`DELETE FROM public."AuthProvider" WHERE id = ${id}`);
      }
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

  async function addProvider(opts: { trustProviderMfa?: boolean }) {
    const id = `sso-${crypto.randomBytes(5).toString('hex')}`;
    await t.publicDb.execute(
      sql`INSERT INTO public."AuthProvider"
            (id, kind, name, issuer, "clientId", "clientSecretEnc", scopes, enabled, "trustProviderMfa")
          VALUES (${id}, 'oidc', 'Pruebas', ${idp.state.issuer}, ${CLIENT_ID},
                  ${encryptSecret(CLIENT_SECRET)}, 'openid email profile', true, ${!!opts.trustProviderMfa})`,
    );
    providers.push(id);
    return id;
  }

  const member = async (opts: { totp?: boolean } = {}) => {
    const u = await t.createUser({ totp: opts.totp });
    await t.publicDb.execute(
      sql`INSERT INTO public."UserTenantMembership" (id, "userId", "tenantId", role)
          VALUES (${crypto.randomUUID()}, ${u.id}, ${tenant.tenantId}, 'USER')`,
    );
    return u;
  };

  const headers = (extra: Record<string, string> = {}) => ({
    'x-forwarded-for': testIp,
    ...extra,
  });

  const call = async (method: string, path: string, body?: any, extra?: Record<string, string>) => {
    const res = await fetch(base + path, {
      method,
      headers: headers({ 'content-type': 'application/json', ...(extra || {}) }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  };

  const cookieOf = (res: Response) =>
    (res.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(';')[0])
      .filter((c) => !c.endsWith('='))
      .join('; ');

  /**
   * Recorre el flujo como el navegador: `start` → proveedor → `callback`. Devuelve la
   * respuesta del callback y su URL (para repetirla).
   */
  async function runFlow(startUrl: string, claims: object, startInit: RequestInit = {}) {
    idp.state.claims = claims;
    const start = await fetch(startUrl, {
      redirect: 'manual',
      ...startInit,
      headers: headers((startInit.headers as any) || {}),
    });
    let location: string;
    let cookie = cookieOf(start);
    if (start.status === 302) {
      location = start.headers.get('location')!;
    } else {
      const body = await start.json();
      assert.ok(body.url, `start sin url: ${JSON.stringify(body)}`);
      location = body.url;
    }
    assert.ok(location.startsWith(idp.state.issuer), `no va al proveedor: ${location}`);
    const auth = await fetch(location, { redirect: 'manual' });
    assert.equal(auth.status, 302);
    const callbackUrl = auth.headers.get('location')!;
    const cb = await fetch(callbackUrl, { redirect: 'manual', headers: headers({ cookie }) });
    return { cb, callbackUrl, cookie };
  }

  const ticketOf = (res: Response) => {
    assert.equal(res.status, 302);
    const to = new URL(res.headers.get('location')!);
    assert.equal(to.pathname, '/login/sso', `redirige a ${to}`);
    return to.searchParams.get('ticket')!;
  };
  const errorOf = (res: Response) => {
    assert.equal(res.status, 302);
    return new URL(res.headers.get('location')!).searchParams.get('ssoError');
  };

  const startUrl = (id = providerId, q = '') => `${base}/api/auth/sso/${id}/start${q}`;
  const sub = () => `sub-${crypto.randomBytes(6).toString('hex')}`;

  it('email verificado de un usuario existente enlaza y entra', async () => {
    const u = await member();
    const s = sub();
    const { cb } = await runFlow(startUrl(), {
      sub: s,
      email: u.email.toUpperCase(),
      email_verified: true,
    });
    const ticket = ticketOf(cb);
    const r = await call('POST', '/api/auth/sso/ticket', { ticket });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.token);
    assert.equal(r.body.user.id, u.id);

    const ids: any = await t.publicDb.execute(
      sql`SELECT "userId", subject FROM public."UserIdentity" WHERE "providerId" = ${providerId} AND subject = ${s}`,
    );
    assert.equal((ids.rows ?? ids)[0]?.userId, u.id);
    const ev: any = await t.publicDb.execute(
      sql`SELECT kind FROM public."AuthEvent" WHERE "userId" = ${u.id} AND kind = 'sso_link'`,
    );
    assert.equal((ev.rows ?? ev).length, 1);
    const sess: any = await t.publicDb.execute(
      sql`SELECT method FROM public."UserSession" WHERE "userId" = ${u.id}`,
    );
    assert.equal((sess.rows ?? sess)[0]?.method, 'sso:oidc');
    assert.equal(enqueue.mock.callCount(), 1, 'avisa del enlace por correo');
    assert.equal((enqueue.mock.calls[0].arguments[1] as any).to, u.email);
  });

  it('segunda vez entra por subject aunque cambie el email', async () => {
    const u = await member();
    const s = sub();
    const first = await runFlow(startUrl(), { sub: s, email: u.email, email_verified: true });
    await call('POST', '/api/auth/sso/ticket', { ticket: ticketOf(first.cb) });
    const second = await runFlow(startUrl(), {
      sub: s,
      email: 'otro-correo@cambiado.test',
      email_verified: false,
    });
    const r = await call('POST', '/api/auth/sso/ticket', { ticket: ticketOf(second.cb) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.user.id, u.id);
    assert.equal(enqueue.mock.callCount(), 1, 'solo el primer enlace manda correo');
  });

  it('email no verificado da EMAIL_UNVERIFIED', async () => {
    const u = await member();
    const { cb } = await runFlow(startUrl(), { sub: sub(), email: u.email, email_verified: false });
    assert.equal(errorOf(cb), 'EMAIL_UNVERIFIED');
    assert.equal(new URL(cb.headers.get('location')!).pathname, '/login');
    const ids: any = await t.publicDb.execute(
      sql`SELECT id FROM public."UserIdentity" WHERE "userId" = ${u.id}`,
    );
    assert.equal((ids.rows ?? ids).length, 0);
  });

  it('sin cuenta da NO_ACCOUNT y no crea usuario', async () => {
    const email = `nadie-${crypto.randomBytes(4).toString('hex')}@sso.test`;
    const { cb } = await runFlow(startUrl(), { sub: sub(), email, email_verified: true });
    assert.equal(errorOf(cb), 'NO_ACCOUNT');
    const users: any = await t.publicDb.execute(
      sql`SELECT id FROM public."GlobalUser" WHERE lower(email) = ${email}`,
    );
    assert.equal((users.rows ?? users).length, 0);
  });

  it('state reutilizado falla', async () => {
    const u = await member();
    const { cb, callbackUrl, cookie } = await runFlow(startUrl(), {
      sub: sub(),
      email: u.email,
      email_verified: true,
    });
    ticketOf(cb);
    const again = await fetch(callbackUrl, { redirect: 'manual', headers: headers({ cookie }) });
    assert.equal(errorOf(again), 'STATE_INVALID');
  });

  it('el callback sin la cookie del navegador que empezó falla', async () => {
    const u = await member();
    idp.state.claims = { sub: sub(), email: u.email, email_verified: true };
    const start = await fetch(startUrl(), { redirect: 'manual', headers: headers() });
    const auth = await fetch(start.headers.get('location')!, { redirect: 'manual' });
    const cb = await fetch(auth.headers.get('location')!, {
      redirect: 'manual',
      headers: headers(),
    });
    assert.equal(errorOf(cb), 'STATE_INVALID');
  });

  it('ticket vale una vez', async () => {
    const u = await member();
    const { cb } = await runFlow(startUrl(), { sub: sub(), email: u.email, email_verified: true });
    const ticket = ticketOf(cb);
    const a = await call('POST', '/api/auth/sso/ticket', { ticket });
    assert.equal(a.status, 200);
    const b = await call('POST', '/api/auth/sso/ticket', { ticket });
    assert.equal(b.status, 401);
    assert.equal(b.body.code, 'TICKET_INVALID');
  });

  it('con 2FA el SSO es el primer factor', async () => {
    const u = await member({ totp: true });
    const { cb } = await runFlow(startUrl(), { sub: sub(), email: u.email, email_verified: true });
    const r = await call('POST', '/api/auth/sso/ticket', { ticket: ticketOf(cb) });
    assert.equal(r.status, 200);
    assert.equal(r.body.mfaRequired, true);
    assert.ok(!r.body.token);
  });

  it('con handoff aprueba el handoff', async () => {
    const u = await member();
    const h = await createHandoff({ ip: testIp, userAgent: 'test', clientKind: 'desktop' });
    const { cb } = await runFlow(startUrl(providerId, `?handoff=${h.handoffId}`), {
      sub: sub(),
      email: u.email,
      email_verified: true,
      amr: ['mfa'],
    });
    assert.equal(cb.status, 200);
    assert.match(cb.headers.get('content-type') || '', /text\/html/);
    assert.match(await cb.text(), /Ya puedes volver a Keirost/);
    const poll = await pollHandoff(h.handoffId, h.pollSecret);
    assert.equal(poll.status, 'approved');
    if (poll.status !== 'approved') return;
    assert.equal(poll.userId, u.id);
    assert.equal(poll.method, 'sso:oidc');
    // Sin `trustProviderMfa`, el `amr` del proveedor no vale como segundo factor.
    assert.equal(poll.mfaDone, null);
  });

  it('la página del handoff sale en inglés con Accept-Language en', async () => {
    const u = await member();
    const h = await createHandoff({ ip: testIp, userAgent: 'test', clientKind: 'desktop' });
    idp.state.claims = { sub: sub(), email: u.email, email_verified: true };
    const start = await fetch(startUrl(providerId, `?handoff=${h.handoffId}`), {
      redirect: 'manual',
      headers: headers(),
    });
    const auth = await fetch(start.headers.get('location')!, { redirect: 'manual' });
    const cb = await fetch(auth.headers.get('location')!, {
      redirect: 'manual',
      headers: headers({ cookie: cookieOf(start), 'accept-language': 'en-US,en;q=0.9' }),
    });
    assert.equal(cb.status, 200);
    assert.match(await cb.text(), /You can go back to Keirost/);
  });

  it('con trustProviderMfa y amr mfa, el proveedor cuenta como segundo factor', async () => {
    const trusted = await addProvider({ trustProviderMfa: true });
    const u = await member({ totp: true });
    const h = await createHandoff({ ip: testIp, userAgent: 'test', clientKind: 'desktop' });
    await runFlow(startUrl(trusted, `?handoff=${h.handoffId}`), {
      sub: sub(),
      email: u.email,
      email_verified: true,
      amr: ['pwd', 'mfa'],
    });
    const poll = await pollHandoff(h.handoffId, h.pollSecret);
    assert.equal(poll.status, 'approved');
    if (poll.status === 'approved') assert.equal(poll.mfaDone, 'provider');

    // Sin `amr` con mfa, el ticket pide el segundo factor.
    const { cb } = await runFlow(startUrl(trusted), {
      sub: sub(),
      email: (await member({ totp: true })).email,
      email_verified: true,
      amr: ['pwd'],
    });
    const r = await call('POST', '/api/auth/sso/ticket', { ticket: ticketOf(cb) });
    assert.equal(r.body.mfaRequired, true);
  });

  it('enlazar a mano con la sesión, listar y desenlazar', async () => {
    const u = await member();
    const login = await call('POST', '/api/auth/login', { email: u.email, password: u.password });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    const auth = { authorization: `Bearer ${login.body.token}` };

    const s = sub();
    const { cb } = await runFlow(
      `${base}/api/auth/identities/link/${providerId}`,
      // Otro correo, sin verificar: con la sesión abierta no hace falta que coincida.
      { sub: s, email: 'cuenta-personal@otra.test', email_verified: false },
      { method: 'POST', headers: auth },
    );
    assert.equal(cb.status, 302);
    const to = new URL(cb.headers.get('location')!);
    assert.equal(to.pathname, '/profile/security');
    assert.equal(to.searchParams.get('linked'), '1');

    const list = await call('GET', '/api/auth/identities', undefined, auth);
    assert.equal(list.status, 200);
    assert.equal(list.body.identities.length, 1);
    const ident = list.body.identities[0];
    assert.equal(ident.providerId, providerId);
    assert.equal(ident.email, 'cuenta-personal@otra.test');
    assert.equal(ident.subject, undefined, 'el subject no sale');

    // Ya enlazada, entra por subject.
    const again = await runFlow(startUrl(), { sub: s, email: 'x@otra.test' });
    const r = await call('POST', '/api/auth/sso/ticket', { ticket: ticketOf(again.cb) });
    assert.equal(r.body.user.id, u.id);

    // Otro usuario no puede quitarla.
    const other = await member();
    const otherLogin = await call('POST', '/api/auth/login', {
      email: other.email,
      password: other.password,
    });
    const denied = await call('DELETE', `/api/auth/identities/${ident.id}`, undefined, {
      authorization: `Bearer ${otherLogin.body.token}`,
    });
    assert.equal(denied.status, 404);

    const del = await call('DELETE', `/api/auth/identities/${ident.id}`, undefined, auth);
    assert.equal(del.status, 204);
    const after = await call('GET', '/api/auth/identities', undefined, auth);
    assert.equal(after.body.identities.length, 0);
  });

  it('enlazar sin sesión da 401', async () => {
    const r = await call('POST', `/api/auth/identities/link/${providerId}`);
    assert.equal(r.status, 401);
  });

  it('start sin WEB_ORIGIN no ofrece SSO', async () => {
    process.env.WEB_ORIGIN = '';
    try {
      const r = await fetch(startUrl(), { redirect: 'manual', headers: headers() });
      assert.equal(r.status, 503);
      assert.equal((await r.json()).code, 'SSO_NOT_CONFIGURED');
      const m = await call('GET', '/api/auth/methods');
      assert.deepEqual(m.body.sso, []);
    } finally {
      process.env.WEB_ORIGIN = base;
    }
    const m = await call('GET', '/api/auth/methods');
    const mine = m.body.sso.find((p: any) => p.id === providerId);
    assert.deepEqual(mine, { id: providerId, name: 'Pruebas', kind: 'oidc' });
  });

  it('proveedores: solo un SUPERUSER de la base, y el secreto nunca sale', async () => {
    const plain = await t.createUser();
    // El rol de la sesión dice SUPERUSER, pero en la base no lo es.
    actingUser = { id: plain.id, role: 'SUPERUSER' };
    const denied = await call('GET', '/api/auth-providers');
    assert.equal(denied.status, 403);

    const su = await t.createUser({ role: 'SUPERUSER' });
    actingUser = { id: su.id, role: 'SUPERUSER' };
    const created = await call('POST', '/api/auth-providers', {
      kind: 'google',
      name: 'Google',
      clientId: 'cid',
      clientSecret: 'muy-secreto',
      allowedDomains: ['empresa.test'],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    providers.push(created.body.id);
    assert.equal(created.body.issuer, 'https://accounts.google.com');
    assert.equal(created.body.hasSecret, true);
    assert.equal(created.body.clientSecretEnc, undefined);
    assert.ok(!JSON.stringify(created.body).includes('muy-secreto'));

    const list = await call('GET', '/api/auth-providers');
    const row = list.body.providers.find((p: any) => p.id === created.body.id);
    assert.deepEqual(row.allowedDomains, ['empresa.test']);
    assert.equal(row.clientSecretEnc, undefined);

    // Sin secreto en el PATCH, se queda el que había.
    const patched = await call('PATCH', `/api/auth-providers/${created.body.id}`, {
      enabled: false,
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.enabled, false);
    assert.equal(patched.body.hasSecret, true);

    const bad = await call('POST', '/api/auth-providers', { kind: 'saml', name: 'x' });
    assert.equal(bad.status, 400);

    const del = await call('DELETE', `/api/auth-providers/${created.body.id}`);
    assert.equal(del.status, 204);
    actingUser = null;
  });
});
