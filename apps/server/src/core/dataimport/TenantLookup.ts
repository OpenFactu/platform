/**
 * Búsquedas contra el schema del tenant que necesita el importador:
 *
 *  - **Referencias**: el fichero trae "CLIENTES" o "ITM-001" donde el endpoint
 *    espera un id. Se busca por las columnas que declare el campo, en orden.
 *  - **Clave natural**: en modo actualización/upsert hay que averiguar si la
 *    fila corresponde a un registro que ya existe.
 *
 * Con caché en memoria por trabajo: un fichero de 5.000 líneas de un mismo
 * grupo haría 5.000 consultas idénticas. La caché guarda también los fallos
 * ("este grupo no existe"), que en una migración con una columna mal puesta
 * son la mayoría.
 *
 * Los identificadores (schema, tabla, columna) se validan contra una lista
 * blanca de caracteres antes de interpolarse; los VALORES van siempre como
 * parámetro, nunca concatenados.
 */

import { sql } from 'drizzle-orm';
import type { ImportFieldRef } from './ImportRegistry';

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertIdentifier(value: string, what: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error(`Identificador de ${what} inválido: ${value}`);
  }
  return value;
}

export class TenantLookup {
  private cache = new Map<string, string | null>();

  constructor(
    private tenantClient: any,
    private tenantSchema: string,
  ) {
    assertIdentifier(tenantSchema, 'schema');
  }

  /** Id de la fila cuyo `column` case (sin distinguir mayúsculas) con `value`. */
  async findId(table: string, columns: string[], value: string): Promise<string | null> {
    const key = `${table}|${columns.join(',')}|${value.toLowerCase()}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    assertIdentifier(table, 'tabla');

    let found: string | null = null;
    for (const column of columns) {
      assertIdentifier(column, 'columna');
      const target = sql.raw(`"${this.tenantSchema}"."${table}"`);
      const col = sql.raw(`"${column}"`);
      const result: any = await this.tenantClient.execute(
        sql`SELECT "id" FROM ${target} WHERE lower(${col}::text) = lower(${value}) LIMIT 1`,
      );
      const rows: any[] = result?.rows ?? result ?? [];
      if (rows.length > 0) {
        found = rows[0].id as string;
        break;
      }
    }

    this.cache.set(key, found);
    return found;
  }

  /** Resuelve el valor de un campo `type: 'ref'` a su id. */
  async resolveRef(ref: ImportFieldRef, value: string): Promise<string | null> {
    return this.findId(ref.table, ref.matchBy, value);
  }

  /** Busca el registro existente que corresponde a esta fila, si lo hay. */
  async findExisting(table: string, column: string, value: string): Promise<string | null> {
    return this.findId(table, [column], value);
  }

  /**
   * Invalida lo cacheado de una tabla. El importador la llama después de
   * crear un registro: sin esto, un fichero que primero da de alta el grupo
   * "CLIENTES" y luego lo referencia seguiría viendo el "no existe" cacheado.
   */
  invalidate(table: string): void {
    const prefix = `${table}|`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }
}
