import type React from 'react';
import type { Module } from './registry';

export interface RouteMeta {
  title: string;
  iconName?: string;
  permissionPath?: string;
}

export interface RouteEntry extends RouteMeta {
  pattern: string;
  Component: React.ComponentType;
}

/**
 * Manifiesto de un módulo de la aplicación (estilo addon de Odoo).
 *
 * Cada módulo (src/modules/<nombre>/module.ts) declara aquí su presencia en el
 * navbar (`nav`) y sus rutas (`routes`). El agregador (src/modules/index.ts)
 * los compone en CORE_MODULES + staticRoutes. Los feature flags de Module/SubTab
 * (featureFlag, adminOnly, hiddenInLogisticsOnly...) siguen siendo el mecanismo
 * para activar/desactivar módulos por empresa.
 */
export interface ModuleManifest {
  /** Entrada(s) del navbar. Un manifiesto puede aportar varias (p.ej. documents → sales y purchases). */
  nav: Module | Module[];
  routes: RouteEntry[];
}
