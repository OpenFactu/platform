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

export async function createTestTenant(): Promise<TestTenant> {
  if (!testDatabaseUrl || !/logistics_test/.test(new URL(testDatabaseUrl).pathname)) {
    throw new Error('LOGISTICS_TEST_DATABASE_URL tiene que apuntar a una base *logistics_test*.');
  }

  await ClientFactory.setBaseUrl(testDatabaseUrl);
  const publicDb = ClientFactory.getClient('public');
  await ensurePublicTables(publicDb);

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
    await ClientFactory.disconnectAll();
    // Arrancan solas al importarlas y, con ellas vivas, el proceso de la prueba no acaba.
    webhookQueue.stop();
    mailQueue.stop();
    await PdfRenderer.shutdown();
  };

  return { tenantId, schemaName, suffix, db, publicDb, query, drop };
}
