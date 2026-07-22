/**
 * Utilidades compartidas por las tools del chat de IA (lectura y acciones).
 */

import { runTemplateQueries } from '../../documents/templateQueries';
import type { Permissions } from '../../auth/resolveEffectivePermissions';

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
   * Permisos granulares por módulo del usuario (mismo shape que
   * `Permissions` en apps/web/src/pages/Users.tsx, resuelto vía
   * `resolveEffectivePermissions`). Tres estados, ver `hasModuleAccess`:
   *  - `null`      → ADMIN/SUPERUSER, acceso total (igual que `PermittedRoute.tsx`).
   *  - `{}`/objeto → usuario real no-admin, deny-by-default salvo lo concedido.
   *  - `undefined` (campo omitido) → este `ChatToolContext` no participa del
   *    modelo de permisos por módulo (p.ej. el servidor MCP, cuyos tokens de
   *    API tienen su PROPIO sistema de scopes, no ligado a un usuario/
   *    membership) — no se filtra por esto, ver mcp/server.ts.
   */
  effectivePermissions?: Permissions | null;
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
 * Mismo criterio que `PermittedRoute.tsx` en el frontend:
 * ADMIN/SUPERUSER bypasean, cualquier otro rol necesita el permiso
 * concreto (`read`/`write`) para ese `permissionPath` de módulo
 * (p.ej. "/partners", "/sales/invoices" — ver PERMISSION_GROUPS en
 * apps/web/src/pages/Users.tsx).
 *
 * `effectivePermissions === undefined` (campo omitido en el ctx, no
 * resuelto) es un caso DISTINTO de `{}` (resuelto, sin nada concedido):
 * significa que este contexto no participa del modelo de permisos por
 * módulo (hoy, el servidor MCP) — se deja pasar sin filtrar, en vez de
 * denegar por defecto, para no romper tools que ya tienen su propio gate
 * (scopes del ApiToken). Un usuario real no-admin del chat interno SIEMPRE
 * llega aquí con `{}` o un objeto real (nunca `undefined`), así que sí
 * aplica deny-by-default.
 */
export function hasModuleAccess(
  ctx: ChatToolContext,
  path: string,
  action: 'read' | 'write' = 'read',
): boolean {
  if (isAdminRole(ctx.user.role)) return true;
  if (ctx.effectivePermissions === undefined) return true;
  return !!ctx.effectivePermissions?.[path]?.[action];
}

/** Mismas rutas que `RouteRegistry.tsx`/`PERMISSION_GROUPS` en
 * apps/web/src/pages/Users.tsx — usado por las tools que cubren los 6 tipos
 * de documento con un único `docType` de entrada (list_documents,
 * get_document, create_document) para resolver a qué módulo pertenece cada
 * uno y comprobar `hasModuleAccess` en runtime, por tipo. */
export const DOC_TYPE_PERMISSION_PATH: Record<string, string> = {
  SINV: '/sales/invoices',
  PINV: '/purchases/invoices',
  SO: '/sales-orders',
  PO: '/purchase-orders',
  SDN: '/sales/delivery-notes',
  PDN: '/purchases/delivery-notes',
};

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
