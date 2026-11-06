/**
 * Base de pruebas para el acceso (sesiones, frenos, MFA...).
 *
 * Solo corre si existe `AUTH_TEST_DATABASE_URL`, y el nombre de la base tiene que llevar
 * `auth_test`. Para prepararla:
 *
 *   docker exec platform-db-1 createdb -U openfactu keirost_auth_test
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { ClientFactory } from '../../tenant/ClientFactory';
import { AuthService } from '../AuthService';
import { stopSessionListener } from '../sessions';
import { webhookQueue } from '../../webhooks/WebhookQueue';
import { mailQueue } from '../../email/MailQueue';

export const authTestDatabaseUrl = process.env.AUTH_TEST_DATABASE_URL;

// Sin base de pruebas nadie llama a `drop()`, y estas colas arrancan al importarlas:
// sus temporizadores dejarían `npm test` colgado para siempre.
if (!authTestDatabaseUrl) {
  webhookQueue.stop();
  mailQueue.stop();
}

export async function useAuthTestDb(): Promise<{
  publicDb: any;
  createUser(
    opts?: Partial<{ role: string; totp: boolean; email: string }>,
  ): Promise<{ id: string; email: string; password: string }>;
  drop(): Promise<void>;
}> {
  if (!authTestDatabaseUrl || !/auth_test/.test(new URL(authTestDatabaseUrl).pathname)) {
    throw new Error('AUTH_TEST_DATABASE_URL tiene que apuntar a una base *auth_test*.');
  }
  await ClientFactory.setBaseUrl(authTestDatabaseUrl);
  const publicDb = ClientFactory.getClient('public');
  const file = path.join(__dirname, '../../../../sql/public-schema.sql');
  const ddl = fs.readFileSync(file, 'utf8');
  const ddlHash = crypto.createHash('sha256').update(ddl).digest('hex');
  // Cada fichero de prueba corre en su propio proceso contra la misma base. Los ALTER TABLE del
  // esquema piden bloqueos de tabla y, lanzados a la vez desde varios procesos (o mientras otro
  // ya inserta), acaban en `deadlock detected`. Un candado de aviso los pone en fila y, si el
  // esquema ya está aplicado (misma huella), nadie lo vuelve a tocar.
  await publicDb.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('keirost_auth_test_schema'))`);
    await tx.execute(
      sql`CREATE TABLE IF NOT EXISTS public."_AuthTestSchema" (id int PRIMARY KEY, hash text NOT NULL)`,
    );
    const rows: any = await tx.execute(sql`SELECT hash FROM public."_AuthTestSchema" WHERE id = 1`);
    if ((rows.rows ?? rows)[0]?.hash === ddlHash) return;
    await tx.execute(sql.raw(ddl));
    await tx.execute(
      sql`INSERT INTO public."_AuthTestSchema" (id, hash) VALUES (1, ${ddlHash})
          ON CONFLICT (id) DO UPDATE SET hash = EXCLUDED.hash`,
    );
  });

  const created: string[] = [];

  const createUser = async (opts: Partial<{ role: string; totp: boolean; email: string }> = {}) => {
    const suffix = crypto.randomBytes(5).toString('hex');
    const id = `at-${suffix}`;
    const email = opts.email ?? `at-${suffix}@test.local`;
    const password = `Pw-${crypto.randomBytes(9).toString('hex')}`;
    const hash = await AuthService.hashPassword(password);
    await publicDb.execute(
      sql`INSERT INTO public."GlobalUser" (id, email, username, password, role, "totpEnabled")
          VALUES (${id}, ${email}, ${`at_${suffix}`}, ${hash}, ${opts.role ?? 'USER'}, ${!!opts.totp})`,
    );
    created.push(id);
    return { id, email, password };
  };

  const drop = async () => {
    for (const id of created) {
      // Las sesiones y credenciales caen en cascada.
      await publicDb.execute(sql`DELETE FROM public."GlobalUser" WHERE id = ${id}`);
    }
    await stopSessionListener();
    await ClientFactory.disconnectAll();
    // Arrancan solas al importarlas y, con ellas vivas, el proceso de la prueba no acaba.
    webhookQueue.stop();
    mailQueue.stop();
  };

  return { publicDb, createUser, drop };
}
