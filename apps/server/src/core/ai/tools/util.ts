/**
 * Utilidades compartidas por las tools del chat de IA (lectura y acciones).
 */

import { runTemplateQueries } from '../../documents/templateQueries';

export interface ChatToolContext {
  tenantClient: any;
  tenantId: string;
  /**
   * Nombre físico del schema Postgres del tenant (p.ej. "tenant_acme").
   * Obligatorio: sin esto, `sandboxQuery` no puede acotar el `search_path` y
   * una query sin cualificar como `"ApiToken"` resolvería contra la tabla
   * pública homónima, filtrando datos de TODOS los tenants (la conexión del
   * tenant incluye `public` en su search_path por diseño). Ver
   * `runTemplateQueries` en templateQueries.ts.
   */
  tenantSchema: string;
  user: { id: string; role?: string; email?: string; username?: string };
  /**
   * Origen (protocolo+host) del propio server, tal como lo vio el navegador
   * en esta request — usado por `render_component` para compilar TSX con
   * `transpileSource` (mismo mecanismo que los widgets de dashboard tipo
   * 'code'), cuyos imports externos (react, @openfactu/ui...) se reescriben
   * a URLs absolutas de ESTE host.
   */
  apiBase?: string;
}

export function isAdminRole(role?: string): boolean {
  return role === 'ADMIN' || role === 'SUPERUSER';
}

/**
 * Ejecuta UNA consulta de lectura por el sandbox de plantillas (transacción
 * READ ONLY + statement_timeout + límite de filas + placeholders escapados +
 * search_path acotado al schema del tenant) y devuelve las filas, o lanza con
 * el error real de Postgres.
 */
export async function sandboxQuery(
  ctx: ChatToolContext,
  rawSql: string,
  params: Record<string, unknown> = {},
): Promise<unknown[]> {
  const result = await runTemplateQueries(
    ctx.tenantClient,
    [{ name: 'q', sql: rawSql }],
    { tenantId: ctx.tenantId, ...params },
    ctx.tenantSchema,
  );
  if (result.errors.length > 0) throw new Error(result.errors[0].error);
  return result.byName['q'] ?? [];
}
