import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import { authTestDatabaseUrl, useAuthTestDb } from './authTestDb';
import { resolveLoginTarget } from '../../../api/auth/completeLogin';

/**
 * Sin empresa elegida (Google, passkey, código por correo desde la lista de cuentas) se entra en
 * la última empresa usada y, si no, en una a la que tenga acceso: nunca en «ninguna».
 */
describe('empresa por defecto al entrar sin elegirla', { skip: !authTestDatabaseUrl }, () => {
  let t: Awaited<ReturnType<typeof useAuthTestDb>>;
  const a = `lt-${crypto.randomBytes(5).toString('hex')}`;
  const b = `lt-${crypto.randomBytes(5).toString('hex')}`;

  before(async () => {
    t = await useAuthTestDb();
    for (const id of [a, b]) {
      await t.publicDb.execute(
        sql`INSERT INTO public."Tenant" (id, name, "schemaName") VALUES (${id}, ${id}, ${'tenant_' + id})`,
      );
    }
  });
  after(async () => {
    if (!t) return;
    // Antes de `drop()`, que cierra la conexión. Las membresías caen en cascada.
    for (const id of [a, b]) {
      await t.publicDb.execute(sql`DELETE FROM public."Tenant" WHERE id = ${id}`);
    }
    await t.drop();
  });

  const join = (userId: string, tenantId: string, role = 'USER') =>
    t.publicDb.execute(
      sql`INSERT INTO public."UserTenantMembership" (id, "userId", "tenantId", role)
          VALUES (${crypto.randomUUID()}, ${userId}, ${tenantId}, ${role})`,
    );
  const leave = (userId: string, tenantId: string) =>
    t.publicDb.execute(
      sql`DELETE FROM public."UserTenantMembership" WHERE "userId" = ${userId} AND "tenantId" = ${tenantId}`,
    );
  /** Una sesión pasada en esa empresa (`ago` minutos atrás). */
  const pastSession = (userId: string, tenantId: string, ago: number) =>
    t.publicDb.execute(
      sql`INSERT INTO public."UserSession" (id, "userId", "tenantId", "createdAt", "lastSeenAt", "expiresAt", "absoluteExpiresAt")
          VALUES (${crypto.randomBytes(12).toString('hex')}, ${userId}, ${tenantId},
                  now() - make_interval(mins => ${ago}), now() - make_interval(mins => ${ago}),
                  now() + interval '1 hour', now() + interval '1 day')`,
    );
  const asUser = (u: { id: string }, role = 'USER') => ({
    id: u.id,
    role,
    tenantId: null,
    permissions: null,
  });

  it('con una sola empresa entra en ella', async () => {
    const u = await t.createUser();
    await join(u.id, a, 'ADMIN');
    const target = await resolveLoginTarget(asUser(u), null);
    assert.equal(target?.tenantId, a);
    assert.equal(target?.role, 'ADMIN');
  });

  it('con varias, la de la última sesión', async () => {
    const u = await t.createUser();
    await join(u.id, a);
    await join(u.id, b);
    await pastSession(u.id, a, 60);
    await pastSession(u.id, b, 5);
    assert.equal((await resolveLoginTarget(asUser(u), null))?.tenantId, b);
  });

  it('la última empresa ya no vale si le quitaron el acceso', async () => {
    const u = await t.createUser();
    await join(u.id, a);
    await join(u.id, b);
    await pastSession(u.id, b, 5);
    await leave(u.id, b);
    assert.equal((await resolveLoginTarget(asUser(u), null))?.tenantId, a);
  });

  it('sin empresas no entra en ninguna', async () => {
    const u = await t.createUser();
    const target = await resolveLoginTarget(asUser(u), null);
    assert.equal(target?.tenantId ?? null, null);
  });

  it('SUPERUSER: la de su última sesión', async () => {
    const u = await t.createUser({ role: 'SUPERUSER' });
    await pastSession(u.id, b, 5);
    const target = await resolveLoginTarget(asUser(u, 'SUPERUSER'), null);
    assert.equal(target?.tenantId, b);
    assert.equal(target?.role, 'SUPERUSER');
  });

  it('SUPERUSER sin historial: alguna empresa que exista', async () => {
    const u = await t.createUser({ role: 'SUPERUSER' });
    const target = await resolveLoginTarget(asUser(u, 'SUPERUSER'), null);
    assert.ok(target?.tenantId, 'sin empresa');
    const rows: any = await t.publicDb.execute(
      sql`SELECT 1 FROM public."Tenant" WHERE id = ${target!.tenantId}`,
    );
    assert.equal((rows.rows ?? rows).length, 1);
  });

  it('la empresa elegida manda sobre la última', async () => {
    const u = await t.createUser();
    await join(u.id, a);
    await join(u.id, b);
    await pastSession(u.id, b, 5);
    assert.equal((await resolveLoginTarget(asUser(u), a))?.tenantId, a);
  });
});
