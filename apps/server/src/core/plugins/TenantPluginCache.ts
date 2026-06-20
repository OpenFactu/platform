import { ClientFactory } from '../tenant/ClientFactory';
import { eq, and } from 'drizzle-orm';
import * as crypto from 'crypto';
import * as schema from '../../db/schema';

/**
 * Caché en memoria del estado de activación de plugins por tenant.
 * Evita queries a la BD en cada trigger de hook.
 */
export class TenantPluginCache {
  private static cache: Map<string, Set<string>> = new Map();

  /**
   * Carga toda la tabla TenantPlugin en memoria.
   * Llamar una vez al arrancar el servidor (después de cargar plugins).
   */
  static async loadAll(): Promise<void> {
    const db = ClientFactory.getClient('public');
    const rows = await db
      .select()
      .from(schema.tenantPlugins)
      .where(eq(schema.tenantPlugins.isActive, true));

    this.cache.clear();
    for (const row of rows) {
      if (!this.cache.has(row.tenantId)) {
        this.cache.set(row.tenantId, new Set());
      }
      this.cache.get(row.tenantId)!.add(row.pluginId);
    }

    console.log(
      `[TenantPluginCache] Cargados ${rows.length} registros activos para ${this.cache.size} tenants`,
    );
  }

  /**
   * Lookup síncrono en memoria. Rendimiento O(1).
   */
  static isActive(tenantId: string, pluginId: string): boolean {
    return this.cache.get(tenantId)?.has(pluginId) ?? false;
  }

  /**
   * Lista de plugins activos para un tenant.
   */
  static getActivePlugins(tenantId: string): string[] {
    const set = this.cache.get(tenantId);
    return set ? Array.from(set) : [];
  }

  /**
   * Activa un plugin para un tenant. Escribe en BD y actualiza caché.
   */
  static async activate(tenantId: string, pluginId: string): Promise<void> {
    const db = ClientFactory.getClient('public');

    // Upsert: si la fila existe, actualizar; si no, insertar
    const [existing] = await db
      .select()
      .from(schema.tenantPlugins)
      .where(
        and(
          eq(schema.tenantPlugins.tenantId, tenantId),
          eq(schema.tenantPlugins.pluginId, pluginId),
        ),
      );

    if (existing) {
      await db
        .update(schema.tenantPlugins)
        .set({ isActive: true, activatedAt: new Date(), deactivatedAt: null })
        .where(eq(schema.tenantPlugins.id, existing.id));
    } else {
      await db.insert(schema.tenantPlugins).values({
        id: crypto.randomUUID(),
        tenantId,
        pluginId,
        isActive: true,
        activatedAt: new Date(),
      });
    }

    // Actualizar caché
    if (!this.cache.has(tenantId)) {
      this.cache.set(tenantId, new Set());
    }
    this.cache.get(tenantId)!.add(pluginId);
  }

  /**
   * Desactiva un plugin para un tenant. Escribe en BD y actualiza caché.
   */
  static async deactivate(tenantId: string, pluginId: string): Promise<void> {
    const db = ClientFactory.getClient('public');

    const [existing] = await db
      .select()
      .from(schema.tenantPlugins)
      .where(
        and(
          eq(schema.tenantPlugins.tenantId, tenantId),
          eq(schema.tenantPlugins.pluginId, pluginId),
        ),
      );

    if (existing) {
      await db
        .update(schema.tenantPlugins)
        .set({ isActive: false, deactivatedAt: new Date() })
        .where(eq(schema.tenantPlugins.id, existing.id));
    }

    // Actualizar caché
    this.cache.get(tenantId)?.delete(pluginId);
  }

  /**
   * Inserta filas por defecto para un tenant nuevo (todos inactivos).
   */
  static async initTenantDefaults(tenantId: string, pluginIds: string[]): Promise<void> {
    if (pluginIds.length === 0) return;

    const db = ClientFactory.getClient('public');

    for (const pluginId of pluginIds) {
      const [existing] = await db
        .select()
        .from(schema.tenantPlugins)
        .where(
          and(
            eq(schema.tenantPlugins.tenantId, tenantId),
            eq(schema.tenantPlugins.pluginId, pluginId),
          ),
        );

      if (!existing) {
        await db.insert(schema.tenantPlugins).values({
          id: crypto.randomUUID(),
          tenantId,
          pluginId,
          isActive: false,
        });
      }
    }

    console.log(
      `[TenantPluginCache] Defaults creados para tenant ${tenantId}: ${pluginIds.length} plugins (inactivos)`,
    );
  }

  /**
   * Invalida la caché (uno o todos los tenants).
   */
  static invalidate(tenantId?: string): void {
    if (tenantId) {
      this.cache.delete(tenantId);
    } else {
      this.cache.clear();
    }
  }
}
