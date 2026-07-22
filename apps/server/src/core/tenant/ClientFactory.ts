import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.join(__dirname, '../../../../../.env') });
}

export class ClientFactory {
  private static clients: Map<string, any> = new Map();
  private static pools: Map<string, Pool> = new Map();
  private static baseUrl: string = '';

  /**
   * Configura la URL base de la base de datos dinámicamente.
   */
  public static async setBaseUrl(url: string) {
    console.log(`[DrizzleFactory] Cambiando URL base y reiniciando conexiones...`);
    this.baseUrl = url;
    // Limpiar clientes existentes para forzar reconexión con la nueva URL
    await this.disconnectAll();
  }

  private static getBaseUrl(): string {
    if (!this.baseUrl) {
      this.baseUrl = process.env.DATABASE_URL || '';
    }
    return this.baseUrl;
  }

  /**
   * Obtiene un cliente de Drizzle configurado para un esquema específico.
   */
  public static getClient(schemaName: string = 'public') {
    if (this.clients.has(schemaName)) {
      return this.clients.get(schemaName);
    }

    const baseDbUrl = this.getBaseUrl();

    // Inyectar el esquema directamente en la URL de conexión (Postgres-native way)
    // Esto asegura que cada conexión física del Pool nazca ya en el esquema correcto
    const tenantDbUrl = `${baseDbUrl}${baseDbUrl.includes('?') ? '&' : '?'}options=-csearch_path%3D${schemaName}%2Cpublic`;

    const pool = new Pool({
      connectionString: tenantDbUrl,
    });

    // En Drizzle no hay motor binario, solo pasamos el pool
    const db = drizzle(pool, { schema });

    this.clients.set(schemaName, db);
    this.pools.set(schemaName, pool);

    console.log(`[DrizzleFactory] Cliente listo para el esquema: ${schemaName}`);
    return db;
  }

  /**
   * Resuelve un ID de tenant a un cliente de Drizzle.
   */
  public static async getTenantClient(tenantId: string) {
    const publicDb = this.getClient('public');

    const [tenant] = await publicDb
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId));

    if (!tenant) throw new Error(`Tenant con ID ${tenantId} no encontrado`);

    return this.getClient(tenant.schemaName);
  }

  /**
   * Cierra y descarta el pool cacheado de un único schema (p.ej. tras borrar
   * un tenant). Sin esto, una conexión cacheada seguiría apuntando a un
   * schema que ya no existe físicamente en Postgres.
   */
  public static async evict(schemaName: string): Promise<void> {
    const pool = this.pools.get(schemaName);
    this.clients.delete(schemaName);
    this.pools.delete(schemaName);
    if (pool) {
      try {
        await pool.end();
      } catch (e: any) {
        console.warn(`[DrizzleFactory] Error cerrando pool de ${schemaName}:`, e.message);
      }
    }
  }

  public static async disconnectAll() {
    const poolCount = this.pools.size;
    if (poolCount > 0) {
      console.log(`[DrizzleFactory] Cerrando ${poolCount} pools de conexión...`);
      for (const [name, pool] of this.pools.entries()) {
        try {
          await pool.end();
          console.log(`   ✅ Pool ${name} cerrado.`);
        } catch (e) {
          console.error(`   ❌ Error al cerrar pool ${name}:`, e);
        }
      }
    }
    this.clients.clear();
    this.pools.clear();
  }
}
