/**
 * Comprobación del permiso de módulo en la API.
 *
 * Hasta ahora el único gate real vivía en el navegador (`PermittedRoute`), así
 * que bastaba con llamar al endpoint a mano —o con un `curl`— para saltárselo.
 * Esto lo cierra en el servidor, que es donde cuenta.
 *
 * El método decide la acción: `GET`/`HEAD` leen, `DELETE` borra y el resto
 * escribe. Es una convención, no una ley: si algún día un `POST` resulta ser
 * de lectura (una búsqueda con filtros largos en el body, por ejemplo), se le
 * pasa la acción a mano en su montaje.
 *
 * Dos excepciones deliberadas:
 *  - **ADMIN y SUPERUSER pasan siempre.** Es el mismo criterio que ya aplican
 *    `PermittedRoute` y `resolveEffectivePermissions`; cambiarlo aquí y no
 *    allí dejaría la interfaz y la API discrepando.
 *  - **Los tokens de API no se miran por aquí.** Tienen su propio sistema de
 *    scopes (`requireScope`), que es por token y no por usuario. Aplicarles
 *    además el permiso de módulo rompería las integraciones existentes sin
 *    ganar nada: el scope ya acota lo que ese token puede hacer.
 */

import type { NextFunction, Response } from 'express';
import {
  resolveEffectivePermissions,
  type Permissions,
} from '../../core/auth/resolveEffectivePermissions';
import { getPermissionEntry } from '../../core/auth/permissionCatalog';

export type PermissionAction = 'read' | 'write' | 'delete';

/** Marca que la petición pasó por algún gate. La usa el cierre por defecto. */
export const AUTHORIZED = Symbol.for('keirost.authorized');

export function actionForMethod(method: string): PermissionAction {
  const m = (method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return 'read';
  if (m === 'DELETE') return 'delete';
  return 'write';
}

/**
 * Caché corta de los permisos efectivos por usuario y empresa.
 *
 * Sin ella, cada petición de la API haría una consulta a `UserTenantMembership`
 * — y una pantalla normal dispara diez o quince peticiones. Treinta segundos
 * es poco tiempo para que a alguien le moleste el desfase y suficiente para
 * que un usuario navegando no golpee la tabla en cada clic. Los cambios de
 * permisos llaman a `invalidatePermissions` y se ven al momento.
 */
const TTL_MS = 30_000;
const cache = new Map<string, { permissions: Permissions | null; expires: number }>();

function cacheKey(userId: string, tenantId: string): string {
  return `${userId}:${tenantId}`;
}

export function invalidatePermissions(userId?: string): void {
  if (!userId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
}

/**
 * Los permisos efectivos de quien hace la petición, para los endpoints que no
 * pueden limitarse a decir sí o no y tienen que **recortar su respuesta**.
 *
 * El caso es el buscador global: una sola llamada que mira interlocutores,
 * artículos, asientos, empleados y plan contable. Denegarla entera porque el
 * usuario no vea empleados sería absurdo; lo que toca es no buscar en
 * empleados.
 *
 * `null` significa sin restricción — ADMIN, SUPERUSER o un token de API, que
 * ya viene acotado por sus propios scopes.
 */
export async function permissionsForRequest(req: any): Promise<Permissions | null> {
  if (req.apiToken) return null;
  return effectivePermissionsOf(req);
}

/** ¿Concede lectura sobre ese módulo? `null` (sin restricción) siempre sí. */
export function grantsRead(permissions: Permissions | null, path: string): boolean {
  return permissions === null || !!permissions[path]?.read;
}

async function effectivePermissionsOf(req: any): Promise<Permissions | null> {
  const userId = req.user?.id;
  const tenantId = req.tenantId;
  if (!userId || !tenantId) {
    return resolveEffectivePermissions(userId, tenantId, req.user?.role);
  }

  const key = cacheKey(userId, tenantId);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.permissions;

  const permissions = await resolveEffectivePermissions(userId, tenantId, req.user?.role);
  cache.set(key, { permissions, expires: Date.now() + TTL_MS });
  return permissions;
}

/**
 * Exige el permiso `path` sobre el módulo. `action` solo se pasa cuando el
 * método HTTP no dice la verdad sobre lo que hace el endpoint.
 */
export function requirePermission(path: string, action?: PermissionAction) {
  return async (req: any, res: Response, next: NextFunction) => {
    req[AUTHORIZED] = true;

    // Integraciones: mandan sus scopes, no los permisos de un usuario.
    if (req.apiToken) return next();

    if (!req.user?.id) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    try {
      const permissions = await effectivePermissionsOf(req);
      // `null` significa ADMIN o SUPERUSER — acceso total. Un usuario normal
      // sin nada configurado recibe `{}`, que no es lo mismo.
      if (permissions === null) return next();

      const needed = action || actionForMethod(req.method);
      if (permissions[path]?.[needed]) return next();

      const entry = getPermissionEntry(path);
      const nombre = entry ? entry.label : path;
      const verbo = needed === 'read' ? 'ver' : needed === 'delete' ? 'borrar en' : 'modificar';
      return res.status(403).json({ error: `No tienes permiso para ${verbo} ${nombre}.` });
    } catch (e: any) {
      console.error('[Permisos] Error resolviendo permisos:', e?.message);
      return res.status(500).json({ error: 'No se pudieron comprobar los permisos.' });
    }
  };
}

/**
 * Marca la petición como autorizada sin exigir permiso de módulo. Para los
 * endpoints de apoyo que usan TODAS las pantallas (catálogos de países,
 * divisas, la config de marca, las notificaciones propias): denegarlos por
 * módulo dejaría cualquier formulario a medias.
 */
export function markAuthorized() {
  return (req: any, _res: Response, next: NextFunction) => {
    req[AUTHORIZED] = true;
    next();
  };
}
