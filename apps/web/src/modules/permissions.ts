/**
 * Qué ve cada usuario en el menú.
 *
 * Hasta ahora `IconSidebar`, `ModuleTabBar` y el buscador del sidebar
 * repetían cada uno su propio filtro, y los tres miraban lo mismo: rol y
 * feature flags. Ninguno miraba los permisos. Por eso un usuario sin acceso a
 * artículos veía igualmente el icono de Inventario y su pestaña, y solo al
 * entrar `PermittedRoute` lo devolvía al inicio. Un menú que ofrece lo que
 * luego rechaza no es un menú, es una trampa.
 *
 * Módulo puro a propósito: sin React, sin contexto, sin red. Entra el estado y
 * sale la lista, que es lo que permite probarlo.
 */

import type { Module, SubTab } from './registry';
import { permissionPathFor } from './routeLookup';

export { permissionPathFor };

export interface PermSet {
  read: boolean;
  write: boolean;
  delete: boolean;
}

/** `null` = ADMIN o SUPERUSER: acceso total. `{}` = usuario sin nada concedido. */
export type Permissions = Record<string, PermSet> | null;

export interface NavUser {
  role?: string;
  permissions?: Permissions;
}

export interface NavContext {
  user: NavUser | null | undefined;
  /**
   * Flags de la empresa (`FlagsConfig`).
   *
   * Se declara como `object` y no como `Record<string, unknown>` porque
   * `FlagsConfig` es una interfaz concreta y TypeScript no la da por asignable
   * a un índice por cadena. Los feature flags se leen por nombre en tiempo de
   * ejecución, así que el casteo tiene que estar en algún sitio: mejor una vez
   * aquí que repetido en cada componente que llame.
   */
  flags: object | null | undefined;
}

/** Lee un flag por nombre. El único punto donde se castea `FlagsConfig`. */
function flagOn(flags: NavContext['flags'], name: string): boolean {
  return !!(flags as Record<string, unknown> | null | undefined)?.[name];
}

/**
 * Pantallas que ve cualquier usuario autenticado. Espejo de
 * `ALWAYS_ALLOWED_PATHS` en el servidor: la portada y el perfil propio, que no
 * enseñan datos de negocio. Sin esto, un usuario recién creado no tendría
 * dónde aterrizar.
 */
const ALWAYS_ALLOWED = new Set(['/', '/profile']);

export function isAdminRole(role?: string): boolean {
  return role === 'ADMIN' || role === 'SUPERUSER';
}

/**
 * ¿Puede leer esta pantalla?
 *
 * Una pantalla contenedora (la portada de un grupo de informes) se ve también
 * cuando se ha concedido alguno de los informes que cuelgan de ella: si no,
 * habría que acordarse de conceder la portada además de cada informe, y nadie
 * lo adivinaría.
 */
export function canRead(user: NavUser | null | undefined, permissionPath?: string): boolean {
  if (!permissionPath) return false;
  if (ALWAYS_ALLOWED.has(permissionPath)) return true;
  if (isAdminRole(user?.role)) return true;

  const permissions = user?.permissions;
  if (permissions === null || permissions === undefined) return false;
  if (permissions[permissionPath]?.read) return true;

  const prefix = `${permissionPath}/`;
  return Object.entries(permissions).some(([path, perm]) => path.startsWith(prefix) && perm?.read);
}

/** ¿Puede ver esta entrada del menú? */
export function canSeeSubTab(sub: SubTab, ctx: NavContext): boolean {
  if (sub.adminOnly && !isAdminRole(ctx.user?.role)) return false;
  if (sub.featureFlag && !flagOn(ctx.flags, sub.featureFlag)) return false;
  if (ALWAYS_ALLOWED.has(sub.path)) return true;
  return canRead(ctx.user, permissionPathFor(sub.path));
}

export function visibleSubTabs(mod: Module, ctx: NavContext): SubTab[] {
  return mod.subTabs.filter((sub) => canSeeSubTab(sub, ctx));
}

/**
 * ¿Se pinta el icono del módulo?
 *
 * Un módulo sin ninguna pestaña visible no se enseña: sería un icono que al
 * pulsarlo no lleva a ninguna parte.
 */
export function canSeeModule(mod: Module, ctx: NavContext): boolean {
  if (mod.superuserOnly && ctx.user?.role !== 'SUPERUSER') return false;
  if (mod.adminOnly && !isAdminRole(ctx.user?.role)) return false;
  if (mod.featureFlag && !flagOn(ctx.flags, mod.featureFlag)) return false;
  if (mod.hiddenInLogisticsOnly && flagOn(ctx.flags, 'logisticsOnly')) return false;
  return visibleSubTabs(mod, ctx).length > 0;
}

export function visibleModules(modules: Module[], ctx: NavContext): Module[] {
  return modules.filter((mod) => canSeeModule(mod, ctx));
}
