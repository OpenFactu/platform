/**
 * Ejecución segura de consultas SQL asociadas a plantillas de documento.
 *
 * El diseñador permite (solo a admins) adjuntar una lista de consultas SQL
 * `{ name, sql }` al layout. Antes de renderizar el PDF, esas consultas se
 * ejecutan sobre el `tenantClient` del documento y sus filas se inyectan en
 * el contexto Handlebars como `queries.<name>` para que la plantilla pueda
 * iterarlas con `{{#each}}`.
 *
 * Reglas de seguridad:
 *  - Solo sentencias de lectura (SELECT / WITH ... SELECT).
 *  - Se bloquea cualquier palabra clave de escritura o DDL.
 *  - Se envuelve la ejecución en una transacción READ ONLY con
 *    statement_timeout, de modo que incluso si el whitelist se escapa algo,
 *    la base no se modifica.
 *  - Se fuerza un límite máximo de filas retornadas.
 *  - Los placeholders `:nombre` se sustituyen por literales correctamente
 *    escapados (sin interpolación libre).
 */

import { sql } from 'drizzle-orm';

const MAX_ROWS = 1000;
const STATEMENT_TIMEOUT_MS = 5000;

const FORBIDDEN_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'DROP',
  'ALTER',
  'CREATE',
  'GRANT',
  'REVOKE',
  'COPY',
  'VACUUM',
  'ANALYZE',
  'REINDEX',
  'CLUSTER',
  'LOCK',
  'SECURITY',
  'COMMENT',
  'EXECUTE',
  'CALL',
  'DO',
  'SET',
  'RESET',
  'LISTEN',
  'NOTIFY',
  'UNLISTEN',
  'DISCARD',
  'REFRESH',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'SAVEPOINT',
  'PREPARE',
  'DEALLOCATE',
  'LOAD',
];

export interface TemplateQuery {
  name: string;
  sql: string;
}

export interface QueryExecutionContext {
  docId?: string | null;
  partnerId?: string | null;
  companyId?: string | null;
  tenantId?: string | null;
  /**
   * Cualquier otra clave: se acepta como placeholder (`:nombre`) en la query.
   * Útil para plantillas FREE que reciben ids arbitrarios (`itemId`, `lote`,
   * `serialId`...). Se aceptan strings, números, booleanos o null/undefined.
   */
  [extraParam: string]: unknown;
}

export interface QueryExecutionError {
  name: string;
  error: string;
}

export interface QueryResults {
  /** Resultados por nombre de query. Si una falla, se omite y se loguea en `errors`. */
  byName: Record<string, unknown[]>;
  errors: QueryExecutionError[];
}

/**
 * Valida sintácticamente (heurística) una consulta antes de ejecutarla.
 * Devuelve null si es válida, o un mensaje de error si no.
 */
/** Quita comentarios SQL (`-- línea` y `/* bloque *​/`) para validar el código real. */
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

export function validateQuery(rawSql: string): string | null {
  if (!rawSql.trim()) return 'La consulta está vacía';
  // Validamos sobre el código SIN comentarios: así una consulta que empieza con
  // un bloque comentado (`-- ...`) o que menciona una palabra reservada dentro
  // de un comentario no se rechaza por error.
  const code = stripSqlComments(rawSql).trim();
  if (!code) return 'La consulta está vacía (solo comentarios)';
  // Separador: solo permitimos una sentencia. Un `;` extra al final es OK.
  const withoutTrailingSemicolon = code.replace(/;\s*$/, '');
  if (withoutTrailingSemicolon.includes(';')) {
    return 'Solo se permite una sentencia por consulta';
  }
  const head = code.toUpperCase().replace(/^\s+/, '');
  if (!head.startsWith('SELECT') && !head.startsWith('WITH')) {
    return 'Solo se permiten consultas SELECT o WITH';
  }
  // Buscamos palabras reservadas de escritura/DDL como palabras completas.
  for (const kw of FORBIDDEN_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    if (re.test(code)) {
      return `La palabra reservada "${kw}" no está permitida en consultas de plantilla`;
    }
  }
  return null;
}

/** Convierte un escalar a literal SQL seguro (string entrecomillado, número, bool, NULL). */
function toSqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * Sustituye placeholders `:nombre` por literales SQL seguros. Acepta strings,
 * números, booleanos, null y ARRAYS (para `WHERE x IN (:param)`): un array se
 * expande a una lista de literales separados por comas. Un array vacío → `NULL`.
 */
function substituteParams(rawSql: string, ctx: QueryExecutionContext): string {
  // Aceptamos cualquier clave del contexto (los 4 estándar + extras como
  // `itemId`, `lote`, `almacenes`, ...).
  const map: Record<string, unknown> = { ...ctx };
  return rawSql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
    if (!(name in map)) {
      return `:${name}`;
    }
    const v = map[name];
    if (Array.isArray(v)) {
      // Multi-valor: lista de literales para usar dentro de un `IN (...)`.
      return v.length === 0 ? 'NULL' : v.map(toSqlLiteral).join(', ');
    }
    return toSqlLiteral(v);
  });
}

/**
 * Ejecuta todas las consultas y devuelve los resultados indexados por nombre.
 * Las consultas fallidas no abortan al resto: se registran en `errors`.
 */
export async function runTemplateQueries(
  tenantClient: any,
  queries: TemplateQuery[],
  ctx: QueryExecutionContext = {},
): Promise<QueryResults> {
  const byName: Record<string, unknown[]> = {};
  const errors: QueryExecutionError[] = [];

  if (!queries || queries.length === 0) return { byName, errors };

  for (const q of queries) {
    const name = (q.name || '').trim();
    if (!name) {
      errors.push({ name: '(sin nombre)', error: 'La consulta no tiene nombre' });
      continue;
    }
    const validation = validateQuery(q.sql);
    if (validation) {
      errors.push({ name, error: validation });
      continue;
    }
    try {
      const prepared = substituteParams(q.sql, ctx);
      // Los saltos de línea alrededor de la subconsulta evitan que un comentario
      // `-- ...` al final de la query (sin salto) comente el `)` de cierre.
      const wrapped = `
        SELECT *
        FROM (
${prepared.replace(/;\s*$/, '')}
        ) AS _template_query
        LIMIT ${MAX_ROWS}
      `;
      const rows = await tenantClient.transaction(async (tx: any) => {
        await tx.execute(sql.raw(`SET LOCAL transaction_read_only = ON`));
        await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`));
        const result: any = await tx.execute(sql.raw(wrapped));
        return (result?.rows ?? result ?? []) as unknown[];
      });
      byName[name] = Array.isArray(rows) ? rows : [];
    } catch (err: any) {
      // Drizzle envuelve el error de pg en `Failed query: <sql>` ocultando la
      // causa real (relación inexistente, columna mal escrita, tipo inválido…).
      // La extraemos de `err.cause` para devolver algo accionable, p.ej.
      // `relation "item" does not exist` cuando la tabla va sin comillas.
      const detail =
        (err?.cause?.message as string | undefined) ||
        (err?.cause?.detail as string | undefined) ||
        err?.message ||
        String(err);
      errors.push({ name, error: detail });
    }
  }

  return { byName, errors };
}
