import { matchRoutes } from 'react-router-dom';
import { moduleRoutes } from '@/modules';
import type { RouteEntry, RouteMeta } from '@/modules/types';

export type { RouteEntry, RouteMeta } from '@/modules/types';

/**
 * Composición de rutas de la app: todas provienen ya de los manifiestos de
 * módulo (src/modules/<nombre>/module.ts). El array legacy quedó vacío tras
 * la modularización y se conserva solo como punto de extensión temporal.
 */
const legacyRoutes: RouteEntry[] = [];

// `staticRoutes` se calcula de forma perezosa (no como const de módulo) porque
// `moduleRoutes` viene de `@/modules`, y varias páginas de módulo importan
// `TabsContext` → `RouteRegistry` → `@/modules` de vuelta. Leer `moduleRoutes`
// en el top-level de este archivo dispara un ciclo de importación ES que
// revienta con "Cannot access 'moduleRoutes' before initialization" en cuanto
// algo (p.ej. SetupWizard) importa `@/modules` antes en el grafo de módulos.
let _staticRoutes: RouteEntry[] | null = null;
export function getStaticRoutes(): RouteEntry[] {
  if (_staticRoutes === null) _staticRoutes = [...moduleRoutes, ...legacyRoutes];
  return _staticRoutes;
}

export function resolveRouteMeta(pathname: string): RouteMeta | null {
  const routes = getStaticRoutes();
  const matchCandidates = routes.map((r) => ({ path: r.pattern }));
  const matches = matchRoutes(matchCandidates, pathname);
  if (!matches || matches.length === 0) return null;
  const matched = matches[0].route;
  const entry = routes.find((r) => r.pattern === matched.path);
  if (!entry) return null;
  return { title: entry.title, iconName: entry.iconName, permissionPath: entry.permissionPath };
}
