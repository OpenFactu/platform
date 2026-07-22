import { LEGACY_NAV, type Module } from './registry';
import type { ModuleManifest, RouteEntry } from './types';
import { inventoryModule } from './inventory/module';
import { partnersModule } from './partners/module';
import { analyticsModule } from './analytics/module';
import { accountingModule } from './accounting/module';
import { reportsModule } from './reports/module';
import { documentsModule } from './documents/module';
import { documentTemplatesModule } from './document-templates/module';

/**
 * Agregador de módulos (estilo Odoo): compone CORE_MODULES (navbar) y las
 * rutas a partir de los manifiestos de cada módulo. Mientras dura la
 * migración, los módulos sin manifiesto siguen viviendo en LEGACY_NAV
 * (./registry.ts) y sus rutas en el bloque legacy de RouteRegistry.tsx.
 */
export const moduleManifests: ModuleManifest[] = [
  // Se rellena por fases: reportsModule, documentsModule, hrModule, ...
  inventoryModule,
  partnersModule,
  accountingModule,
  analyticsModule,
  reportsModule,
  documentsModule,
  documentTemplatesModule,
];

/** Orden canónico del navbar (ids de Module). */
const NAV_ORDER = [
  'home',
  'inventory',
  'sales',
  'purchases',
  'partners',
  'accounting',
  'analytics',
  'reports',
  'hr',
  'logistics',
  'assistant',
  'plugins',
  'configuration',
  'system',
];

const manifestNav: Module[] = moduleManifests.flatMap((m) =>
  Array.isArray(m.nav) ? m.nav : [m.nav],
);

export const CORE_MODULES: Module[] = NAV_ORDER.map(
  (id) => manifestNav.find((m) => m.id === id) ?? LEGACY_NAV.find((m) => m.id === id),
).filter((m): m is Module => Boolean(m));

/** Rutas aportadas por los manifiestos; RouteRegistry las combina con las legacy. */
export const moduleRoutes: RouteEntry[] = moduleManifests.flatMap((m) => m.routes);

export { findActiveModule, type Module, type SubTab } from './registry';
export type { ModuleManifest, RouteEntry, RouteMeta } from './types';
