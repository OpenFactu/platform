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

export const staticRoutes: RouteEntry[] = [...moduleRoutes, ...legacyRoutes];

const matchCandidates = staticRoutes.map((r) => ({ path: r.pattern }));

export function resolveRouteMeta(pathname: string): RouteMeta | null {
  const matches = matchRoutes(matchCandidates, pathname);
  if (!matches || matches.length === 0) return null;
  const matched = matches[0].route;
  const entry = staticRoutes.find((r) => r.pattern === matched.path);
  if (!entry) return null;
  return { title: entry.title, iconName: entry.iconName, permissionPath: entry.permissionPath };
}
