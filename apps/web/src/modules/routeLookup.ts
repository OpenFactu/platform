/**
 * Qué sabe la tabla de rutas sobre una ruta del menú.
 *
 * Una entrada del menú (`SubTab`) trae poco más que su etiqueta y su ruta,
 * mientras que la ruta correspondiente ya declara el permiso que exige y el
 * icono con el que se representa. Repetir esos datos en el menú es cómo se
 * desincronizan las cosas: aquí se van a buscar.
 */

import { moduleRoutes } from './index';
import type { RouteEntry } from './types';

/**
 * La ruta que atiende un camino concreto.
 *
 * Primero exacta y luego por patrón, quedándose con el más largo que encaje
 * para no confundir `/u/:name` con `/u/:name/:id`.
 */
export function findRouteFor(path: string): RouteEntry | undefined {
  const exact = moduleRoutes.find((r) => r.pattern === path);
  if (exact) return exact;

  return moduleRoutes
    .filter((r) => r.pattern.includes(':'))
    .filter((r) => matchesPattern(r.pattern, path))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
}

function matchesPattern(pattern: string, path: string): boolean {
  const p = pattern.split('/');
  const q = path.split('/');
  if (p.length !== q.length) return false;
  return p.every((seg, i) => seg.startsWith(':') || seg === q[i]);
}

/**
 * Permiso que exige una ruta.
 *
 * Hay que preguntarlo aquí y no dar por hecho que coincide con la ruta del
 * menú: la pestaña "Tareas" apunta a `/background-tasks`, y hasta hace poco
 * esa ruta exigía el permiso de auditoría. Preguntar por el permiso
 * equivocado es tan malo como no preguntar.
 */
export function permissionPathFor(path: string): string | undefined {
  return findRouteFor(path)?.permissionPath;
}

/**
 * Icono de una entrada del menú, sacado de su ruta.
 *
 * Los `SubTab` admiten un campo `icon` desde siempre y NINGUNO lo rellenaba,
 * así que la barra de sub-secciones salía sin iconos aunque el código para
 * pintarlos estuviera escrito. El dato existía al lado, en el `iconName` de la
 * ruta; solo faltaba ir por él en vez de pedir que se escribiera dos veces.
 */
export function iconNameFor(path: string, declared?: string): string | undefined {
  return declared || findRouteFor(path)?.iconName;
}
