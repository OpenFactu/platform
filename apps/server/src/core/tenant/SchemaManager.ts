import { ClientFactory } from './ClientFactory';
import { MigrationManager } from './MigrationManager';
import { TenantPluginCache } from '../plugins/TenantPluginCache';
import { sql, eq, or } from 'drizzle-orm';
import crypto from 'crypto';
import * as schema from '../../db/schema';

/**
 * SchemaManager gestiona la creación física de esquemas en Postgres
 * e industrializa el proceso de alta de nuevos tenants.
 */
export class SchemaManager {
  /**
   * Crea una nueva empresa: Esquema físico + Registro en Global.
   * Si las migraciones o el seed fallan, revierte el Tenant recién creado y
   * el esquema físico para no dejar estado inconsistente.
   */
  public static async createTenantSchema(name: string, schemaName: string, config: any = {}) {
    const publicDb = ClientFactory.getClient('public');

    console.log(`[SchemaManager] Iniciando provisión de empresa: ${name} (${schemaName})`);

    // 1. Verificar si ya existe (update-in-place) para no crear duplicados
    const [existing] = await publicDb
      .select()
      .from(schema.tenants)
      .where(or(eq(schema.tenants.name, name), eq(schema.tenants.schemaName, schemaName)));

    let tenantId: string;
    const isNewTenant = !existing;

    if (existing) {
      console.log(
        `[SchemaManager] Empresa existente detectada (${existing.id}). Actualizando datos...`,
      );
      tenantId = existing.id;
      await publicDb
        .update(schema.tenants)
        .set({
          name,
          schemaName,
          config: JSON.stringify({
            ...JSON.parse(existing.config || '{}'),
            ...config,
            updatedAt: new Date(),
          }),
          updatedAt: new Date(),
        })
        .where(eq(schema.tenants.id, tenantId));
    } else {
      tenantId = crypto.randomUUID();
      await publicDb.insert(schema.tenants).values({
        id: tenantId,
        name,
        schemaName,
        config: JSON.stringify({ ...config, createdAt: new Date() }),
        updatedAt: new Date(),
      });
    }

    try {
      // 2. Crear esquema físico si no existe
      await publicDb.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`));

      // 3. Ejecutar migraciones iniciales sobre el nuevo esquema
      await MigrationManager.syncTenant(schemaName);

      // 4. Inicializar estado de plugins para el nuevo tenant (todos inactivos)
      if (isNewTenant) {
        try {
          const { activePlugins } = await import('../../plugins/loader');
          await TenantPluginCache.initTenantDefaults(tenantId, activePlugins);
        } catch (e) {
          console.warn(`[SchemaManager] No se pudieron inicializar plugins para ${name}:`, e);
        }
      }

      console.log(`[SchemaManager] ✅ Empresa ${name} lista para operar.`);
      return tenantId;
    } catch (error: any) {
      console.error(`[SchemaManager] Error en la provisión del tenant:`, error.message);

      // Rollback: solo cuando el tenant era nuevo (no queremos borrar una empresa existente por un retry fallido)
      if (isNewTenant) {
        try {
          await publicDb.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`));
          await publicDb.delete(schema.auditLogs).where(eq(schema.auditLogs.tenantId, tenantId));
          await publicDb
            .delete(schema.userTenantMemberships)
            .where(eq(schema.userTenantMemberships.tenantId, tenantId));
          await publicDb.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
          console.log(`[SchemaManager] Rollback completado para ${schemaName}`);
        } catch (cleanupErr: any) {
          console.error(
            `[SchemaManager] Error durante rollback de ${schemaName}:`,
            cleanupErr.message,
          );
        }
      }

      throw error;
    }
  }

  /**
   * Borra un tenant por completo: filas en `public` que no cascadean por FK
   * (GlobalUser.tenantId se pone a null; AuditLog/DevApiKey se borran),
   * la fila `Tenant`, el schema físico y la conexión cacheada.
   *
   * Usado por el borrado explícito de empresa (`DELETE /api/admin/tenants/:id`)
   * y por el rollback de `TenantBackup.importFromZip` cuando la restauración
   * del backup falla a medias — sin esto, un fallo tras crear el tenant deja
   * una empresa fantasma en `public.Tenant` sin schema físico detrás.
   */
  public static async deleteTenantCompletely(tenantId: string, schemaName: string): Promise<void> {
    const publicDb = ClientFactory.getClient('public');
    await publicDb
      .update(schema.globalUsers)
      .set({ tenantId: null })
      .where(eq(schema.globalUsers.tenantId, tenantId));
    await publicDb.delete(schema.auditLogs).where(eq(schema.auditLogs.tenantId, tenantId));
    await publicDb.delete(schema.devApiKeys).where(eq(schema.devApiKeys.tenantId, tenantId));
    await publicDb.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    await publicDb.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`));
    await ClientFactory.evict(schemaName);
  }
}
