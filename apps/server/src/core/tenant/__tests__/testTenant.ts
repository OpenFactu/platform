/**
 * Una empresa de verdad, con todas las migraciones, en una base de datos aparte.
 *
 * Solo corre si existe `LOGISTICS_TEST_DATABASE_URL`, y el nombre de la base tiene
 * que llevar `logistics_test`: así no hay forma de lanzarlo contra la base de nadie
 * por error. Para prepararla basta con:
 *
 *   docker exec platform-db-1 createdb -U openfactu keirost_logistics_test
 */
import '../../documents/registerDocumentTypes';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { PdfRenderer } from '@openfactu/pdf';
import { ClientFactory } from '../ClientFactory';
import { MigrationManager } from '../MigrationManager';
import { webhookQueue } from '../../webhooks/WebhookQueue';
import { mailQueue } from '../../email/MailQueue';

export const testDatabaseUrl = process.env.LOGISTICS_TEST_DATABASE_URL;

// Sin base de pruebas nadie llama a `drop()`, y estas colas arrancan al importarlas:
// sus temporizadores dejarían `npm test` colgado para siempre.
if (!testDatabaseUrl) {
  webhookQueue.stop();
  mailQueue.stop();
}

export interface TestTenant {
  tenantId: string;
  schemaName: string;
  suffix: string;
  db: any;
  publicDb: any;
  query: <T = any>(text: string) => Promise<T[]>;
  drop: () => Promise<void>;
}

/** El mismo SQL con el que arranca el servidor. */
async function ensurePublicTables(publicDb: any) {
  const file = path.join(__dirname, '../../../../sql/public-schema.sql');
  await publicDb.execute(sql.raw(fs.readFileSync(file, 'utf8')));
}

export interface TestTenantOptions {
  /** Otra base de pruebas (por defecto, la de logística). Su nombre tiene que casar con `guard`. */
  url?: string;
  guard?: RegExp;
  /** El esquema `public` ya lo aplicó quien llama (con su propio candado): no se toca. */
  publicSchemaReady?: boolean;
  /** `drop()` solo borra lo suyo y deja las conexiones y colas a quien llama. */
  keepConnections?: boolean;
}

export async function createTestTenant(opts: TestTenantOptions = {}): Promise<TestTenant> {
  const url = opts.url ?? testDatabaseUrl;
  const guard = opts.guard ?? /logistics_test/;
  if (!url || !guard.test(new URL(url).pathname)) {
    throw new Error(
      opts.url
        ? `La URL de pruebas tiene que apuntar a una base que case con ${guard}.`
        : 'LOGISTICS_TEST_DATABASE_URL tiene que apuntar a una base *logistics_test*.',
    );
  }

  // Quien ya dejó la base lista no quiere que se cierren sus conexiones.
  if (!opts.publicSchemaReady) await ClientFactory.setBaseUrl(url);
  const publicDb = ClientFactory.getClient('public');
  if (!opts.publicSchemaReady) await ensurePublicTables(publicDb);

  const suffix = crypto.randomBytes(5).toString('hex');
  const schemaName = `tenant_lt_${suffix}`;
  const tenantId = crypto.randomUUID();
  await publicDb.execute(sql.raw(`CREATE SCHEMA "${schemaName}"`));
  await MigrationManager.syncTenant(schemaName);
  await publicDb.execute(
    sql.raw(
      `INSERT INTO public."Tenant" (id, name, "schemaName") VALUES ('${tenantId}', 'Prueba ${suffix}', '${schemaName}')`,
    ),
  );

  const db = ClientFactory.getClient(schemaName);
  const query = async <T = any>(text: string): Promise<T[]> =>
    (await db.execute(sql.raw(text))).rows as T[];

  const drop = async () => {
    await publicDb.execute(sql.raw(`DROP SCHEMA "${schemaName}" CASCADE`));
    await publicDb.execute(sql`DELETE FROM public."AuditLog" WHERE "tenantId" = ${tenantId}`);
    await publicDb.execute(sql`DELETE FROM public."PluginField" WHERE "tenantId" = ${tenantId}`);
    await publicDb.execute(sql`DELETE FROM public."PluginTable" WHERE "tenantId" = ${tenantId}`);
    await publicDb.execute(
      sql`DELETE FROM public."UserTenantMembership" WHERE "tenantId" = ${tenantId}`,
    );
    await publicDb.execute(sql`DELETE FROM public."GlobalUser" WHERE id LIKE ${`%-${suffix}`}`);
    await publicDb.execute(sql`DELETE FROM public."Tenant" WHERE id = ${tenantId}`);
    if (opts.keepConnections) return;
    await ClientFactory.disconnectAll();
    // Arrancan solas al importarlas y, con ellas vivas, el proceso de la prueba no acaba.
    webhookQueue.stop();
    mailQueue.stop();
    await PdfRenderer.shutdown();
  };

  return { tenantId, schemaName, suffix, db, publicDb, query, drop };
}
