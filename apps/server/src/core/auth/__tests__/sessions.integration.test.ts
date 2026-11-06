import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { authTestDatabaseUrl, useAuthTestDb } from './authTestDb';
import { AuthService } from '../AuthService';
import { userSessions } from '../../../db/schema';
import {
  createSession,
  handleNotification,
  setSessionTenant,
  issueToken,
  listSessions,
  onSessionRevoked,
  resolveSession,
  revokeAllForUser,
  revokeSession,
  startSessionListener,
  touchSession,
} from '../sessions';

const client = { ip: '127.0.0.1', userAgent: 'test', clientKind: 'web' as const };

describe('sessions', { skip: !authTestDatabaseUrl }, () => {
  let t: Awaited<ReturnType<typeof useAuthTestDb>>;
  before(async () => {
    t = await useAuthTestDb();
    await startSessionListener();
  });
  after(async () => {
    if (t) await t.drop();
  });

  const open = (userId: string) =>
    createSession({ userId, tenantId: null, method: 'password', mfa: null, client });

  const mk = async () => {
    const u = await t.createUser();
    const user = { id: u.id, email: u.email, username: 'x', role: 'USER' };
    return { u, user, s: await open(u.id) };
  };

  it('crea y resuelve', async () => {
    const { user, s } = await mk();
    const r: any = await resolveSession(issueToken(s, user));
    assert.equal(r.session.id, s.id);
  });

  it('revocada da SESSION_REVOKED', async () => {
    const { user, s } = await mk();
    const token = issueToken(s, user);
    assert.ok('session' in ((await resolveSession(token)) as any));
    await revokeSession(s.id, 'test');
    assert.deepEqual(await resolveSession(token), { error: 'SESSION_REVOKED' });
  });

  it('revokeAllForUser respeta exceptSid', async () => {
    const { u, user, s } = await mk();
    const s2 = await open(u.id);
    const s3 = await open(u.id);
    const n = await revokeAllForUser(u.id, 'test', s.id);
    assert.equal(n, 2);
    assert.ok('session' in ((await resolveSession(issueToken(s, user))) as any));
    assert.deepEqual(await resolveSession(issueToken(s2, user)), { error: 'SESSION_REVOKED' });
    assert.deepEqual(await resolveSession(issueToken(s3, user)), { error: 'SESSION_REVOKED' });
    assert.equal((await listSessions(u.id)).length, 1);
  });

  it('token sin sid da INVALID', async () => {
    const { u } = await mk();
    assert.deepEqual(await resolveSession(AuthService.generateToken({ userId: u.id })), {
      error: 'INVALID',
    });
  });

  it('expira', async () => {
    const { u, user } = await mk();
    const s = await open(u.id);
    const token = issueToken(s, user);
    // Sin resolver antes, la caché no tiene la fila y se lee la caducada.
    await t.publicDb
      .update(userSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(userSessions.id, s.id));
    assert.deepEqual(await resolveSession(token), { error: 'SESSION_EXPIRED' });
  });

  it('touch no pasa del máximo absoluto', async () => {
    const { s } = await mk();
    await t.publicDb
      .update(userSessions)
      .set({ absoluteExpiresAt: new Date(Date.now() + 60_000) })
      .where(eq(userSessions.id, s.id));
    await touchSession(s.id);
    const [row] = await t.publicDb.select().from(userSessions).where(eq(userSessions.id, s.id));
    assert.ok(row.expiresAt.getTime() <= row.absoluteExpiresAt.getTime());
  });

  it('guarda mfa como texto', async () => {
    const u = await t.createUser();
    const s = await createSession({
      userId: u.id,
      tenantId: null,
      method: 'password',
      mfa: 'totp',
      client,
    });
    assert.equal(s.mfa, 'totp');
    const [row] = await t.publicDb.select().from(userSessions).where(eq(userSessions.id, s.id));
    assert.equal(row.mfa, 'totp');
  });

  it('touch desliza por el idleHours de la sesión', async () => {
    const u = await t.createUser();
    const s = await createSession({
      userId: u.id,
      tenantId: null,
      method: 'password',
      mfa: null,
      client,
      slidingHours: 1,
    });
    assert.equal(s.idleHours, 1);
    await t.publicDb
      .update(userSessions)
      .set({ expiresAt: new Date(Date.now() + 60_000) })
      .where(eq(userSessions.id, s.id));
    await touchSession(s.id);
    const [row] = await t.publicDb.select().from(userSessions).where(eq(userSessions.id, s.id));
    const diff = row.expiresAt.getTime() - Date.now();
    assert.ok(diff > 55 * 60_000 && diff <= 61 * 60_000, `diff=${diff}`);
  });

  it('los avisos de revocación se disparan una vez por sid', async () => {
    const { u, s } = await mk();
    const s2 = await open(u.id);
    const s3 = await open(u.id);
    const calls: string[] = [];
    // Otras pruebas en paralelo avisan por el mismo canal: solo cuentan los sid de esta.
    const mine = new Set([s.id, s2.id, s3.id]);
    onSessionRevoked((sid) => mine.has(sid) && calls.push(sid));
    await revokeSession(s.id, 'test');
    await revokeAllForUser(u.id, 'test');
    await new Promise((r) => setTimeout(r, 400)); // espera al eco del NOTIFY
    assert.deepEqual([...calls].sort(), [s.id, s2.id, s3.id].sort());
  });

  it('touch no revive una sesión caducada', async () => {
    const { s, user } = await mk();
    const token = issueToken(s, user);
    await t.publicDb
      .update(userSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(userSessions.id, s.id));
    await touchSession(s.id);
    assert.deepEqual(await resolveSession(token), { error: 'SESSION_EXPIRED' });
  });

  it('touch no depende de la zona horaria de la conexión', async () => {
    const u = await t.createUser();
    const s = await createSession({
      userId: u.id,
      tenantId: null,
      method: 'password',
      mfa: null,
      client,
      slidingHours: 2,
    });
    await t.publicDb.execute(sql`SET TIME ZONE 'America/New_York'`);
    await touchSession(s.id);
    const [row] = await t.publicDb.select().from(userSessions).where(eq(userSessions.id, s.id));
    const diff = row.expiresAt.getTime() - Date.now();
    assert.ok(diff > 119 * 60_000 && diff <= 121 * 60_000, `diff=${diff}`);
    assert.ok(Math.abs(row.lastSeenAt.getTime() - Date.now()) < 5000);
  });

  it('un aviso de otra instancia: update vacía la caché sin avisar; revoke avisa una vez por sid', async () => {
    const { u, user, s } = await mk();
    const s2 = await open(u.id);
    const token = issueToken(s, user);
    await resolveSession(token); // llena la caché
    // otra instancia cambia la empresa directamente en la base
    await t.publicDb
      .update(userSessions)
      .set({ tenantId: 'otra' })
      .where(eq(userSessions.id, s.id));
    const calls: string[] = [];
    onSessionRevoked((sid) => [s.id, s2.id].includes(sid) && calls.push(sid));
    handleNotification(
      JSON.stringify({ origin: 'otra-instancia', userId: u.id, sids: [s.id], kind: 'update' }),
    );
    assert.deepEqual(calls, []);
    const r: any = await resolveSession(token);
    assert.equal(r.session.tenantId, 'otra');
    handleNotification(
      JSON.stringify({ origin: 'otra-instancia', userId: u.id, sids: [s.id, s2.id] }),
    );
    assert.deepEqual(calls, [s.id, s2.id]);
  });

  it('setSessionTenant cambia la empresa y la restricción', async () => {
    const { s } = await mk();
    const r = await setSessionTenant(s.id, 'emp', 'mfa_setup');
    assert.equal(r.tenantId, 'emp');
    assert.equal(r.restricted, 'mfa_setup');
  });

  it('un aviso que lanza no impide los demás ni rompe la revocación', async () => {
    const { s } = await mk();
    const calls: string[] = [];
    onSessionRevoked(() => {
      throw new Error('falla a propósito');
    });
    // Otras pruebas en paralelo avisan por el mismo canal: solo cuentan los sid de esta.
    const mine = new Set([s.id]);
    onSessionRevoked((sid) => mine.has(sid) && calls.push(sid));
    await revokeSession(s.id, 'test');
    assert.ok(calls.includes(s.id));
  });
});
