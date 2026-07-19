/**
 * Introspección del esquema del tenant activo (tablas + columnas).
 *
 * Compartido por:
 *  - GET /api/document-templates/schema-info (FieldExplorer del diseñador)
 *  - POST /api/document-templates/generate (contexto del generador con IA)
 *  - la tool `get_schema_info` del chat de IA
 */

import { sql } from 'drizzle-orm';

export interface SchemaTableInfo {
  schema: string;
  name: string;
  columns: Array<{ name: string; type: string; nullable: boolean }>;
}

export async function fetchSchemaInfo(tenantClient: any): Promise<SchemaTableInfo[]> {
  const result: any = await tenantClient.execute(
    sql.raw(`
      SELECT
        c.table_schema,
        c.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable
      FROM information_schema.columns c
      WHERE c.table_schema = ANY (current_schemas(false))
        AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY c.table_schema, c.table_name, c.ordinal_position
      LIMIT 5000
    `),
  );
  const rows: any[] = result?.rows ?? result ?? [];
  const tablesMap = new Map<string, SchemaTableInfo>();
  for (const r of rows) {
    const key = `${r.table_schema}.${r.table_name}`;
    if (!tablesMap.has(key)) {
      tablesMap.set(key, { schema: r.table_schema, name: r.table_name, columns: [] });
    }
    tablesMap.get(key)!.columns.push({
      name: r.column_name,
      type: r.data_type,
      nullable: r.is_nullable === 'YES',
    });
  }
  return Array.from(tablesMap.values());
}

/** Versión compacta de una línea por tabla — para prompts de IA. */
export function schemaInfoToCompactText(tables: SchemaTableInfo[]): string {
  return tables
    .map((t) => `"${t.name}"(${t.columns.map((c) => `${c.name} ${c.type}`).join(', ')})`)
    .join('\n');
}

/** Nombre de schema Postgres válido — mismo criterio que templateQueries.ts. */
const SAFE_SCHEMA_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Solo los nombres de tabla del schema del tenant (sin `public`). Barato: lo
 * usa la tool `list_tables` del chat de IA para no volcar TODO el esquema
 * (100+ tablas, ~20k tokens en este proyecto) en cada turno — el modelo pide
 * columnas solo de las tablas que le interesan con `get_table_columns`.
 */
export async function fetchTenantTableNames(
  tenantClient: any,
  tenantSchema: string,
): Promise<string[]> {
  if (!SAFE_SCHEMA_NAME.test(tenantSchema)) throw new Error(`Schema inválido: ${tenantSchema}`);
  const result: any = await tenantClient.execute(
    sql.raw(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = '${tenantSchema}'
      ORDER BY table_name
    `),
  );
  const rows: any[] = result?.rows ?? result ?? [];
  return rows.map((r) => r.table_name);
}

/** Columnas de una lista concreta de tablas, acotado al schema del tenant. */
export async function fetchTenantTableColumns(
  tenantClient: any,
  tenantSchema: string,
  tableNames: string[],
): Promise<SchemaTableInfo[]> {
  if (!SAFE_SCHEMA_NAME.test(tenantSchema)) throw new Error(`Schema inválido: ${tenantSchema}`);
  const names = tableNames.filter((t) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t));
  if (names.length === 0) return [];
  const inList = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(', ');
  const result: any = await tenantClient.execute(
    sql.raw(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = '${tenantSchema}' AND table_name IN (${inList})
      ORDER BY table_name, ordinal_position
    `),
  );
  const rows: any[] = result?.rows ?? result ?? [];
  const tablesMap = new Map<string, SchemaTableInfo>();
  for (const r of rows) {
    if (!tablesMap.has(r.table_name)) {
      tablesMap.set(r.table_name, { schema: tenantSchema, name: r.table_name, columns: [] });
    }
    tablesMap.get(r.table_name)!.columns.push({
      name: r.column_name,
      type: r.data_type,
      nullable: r.is_nullable === 'YES',
    });
  }
  return Array.from(tablesMap.values());
}
