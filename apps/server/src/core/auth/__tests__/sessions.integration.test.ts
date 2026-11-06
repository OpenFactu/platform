import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { authTestDatabaseUrl, useAuthTestDb } from './authTestDb';
import { AuthService } from '../AuthService';
import { userSessions } from '../../../db/schema';
import {
  createSession,
  issueToken,
  listSessions,
  resolveSession,
  revokeAllForUser,
  revokeSession,
  touchSession,
} from '../sessions';

const client = { ip: '127.0.0.1', userAgent: 'test', clientKind: 'web' as const };

describe('sessions', { skip: !authTestDatabaseUrl }, () => {
  let t: Awaited<ReturnType<typeof useAuthTestDb>>;
  before(async () => {
    t = await useAuthTestDb();
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
});
