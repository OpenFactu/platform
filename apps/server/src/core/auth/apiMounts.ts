/**
 * Montaje de routers con su permiso declarado al lado.
 *
 * El problema que resuelve no es técnico, es de vigilancia: con `app.use()` a
 * secas, añadir un router nuevo y olvidarse del permiso no se nota. Así es
 * como los 24 informes acabaron abiertos a cualquiera durante meses.
 *
 * Con esto hay tres formas de montar y las tres se leen en una palabra:
 *
 *   mountApi(app, '/api/items', '/items', itemsRouter)   ← exige permiso
 *   mountShared(app, '/api/geo', 'catálogo de países', geoRouter)  ← autenticado
 *   mountPublic(app, '/api/auth', 'login', authRouter)   ← sin autenticar
 *
 * Cada montaje queda apuntado, así que al arrancar se puede imprimir la tabla
 * completa y `check-permissions.ts` puede comprobar que no falta ninguno. Y lo
 * que se cuele sin pasar por aquí lo caza `denyUndeclared`, que devuelve 403 a
 * cualquier petición de `/api` que llegue al final sin haber sido autorizada.
 */

import type { Express, RequestHandler, Response, NextFunction } from 'express';
import {
  AUTHORIZED,
  markAuthorized,
  requirePermission,
  type PermissionAction,
} from '../../api/middleware/requirePermission';
import { isKnownPermission } from './permissionCatalog';

export type MountKind = 'permission' | 'shared' | 'public';

export interface ApiMount {
  path: string;
  kind: MountKind;
  /** Permiso exigido, en los de tipo `permission`. */
  permission?: string;
  /** Por qué no exige permiso, en los de tipo `shared`/`public`. */
  reason?: string;
}

const mounts: ApiMount[] = [];

export function registeredMounts(): ApiMount[] {
  return [...mounts];
}

/** Solo para los tests: deja el registro como estaba. */
export function resetMounts(): void {
  mounts.length = 0;
}

/**
 * Monta un router que exige permiso de módulo.
 *
 * Si el permiso no está en el catálogo, revienta AL ARRANCAR en vez de
 * denegar en silencio en producción: una errata en la ruta del permiso
 * dejaría el módulo inaccesible para todo el mundo menos los administradores,
 * y eso tardaría días en salir a la luz.
 */
export function mountApi(
  app: Express,
  path: string,
  permission: string,
  ...handlers: RequestHandler[]
): void {
  if (!isKnownPermission(permission)) {
    throw new Error(
      `[Permisos] El montaje ${path} pide "${permission}", que no está en PERMISSION_CATALOG. ` +
        `Añádelo al catálogo o corrige la ruta.`,
    );
  }
  mounts.push({ path, kind: 'permission', permission });
  app.use(path, requirePermission(permission), ...handlers);
}

/** Igual, pero forzando la acción cuando el método HTTP no la refleja. */
export function mountApiWithAction(
  app: Express,
  path: string,
  permission: string,
  action: PermissionAction,
  ...handlers: RequestHandler[]
): void {
  if (!isKnownPermission(permission)) {
    throw new Error(
      `[Permisos] El montaje ${path} pide "${permission}", que no está en el catálogo.`,
    );
  }
  mounts.push({ path, kind: 'permission', permission });
  app.use(path, requirePermission(permission, action), ...handlers);
}

/**
 * Un router que sirve VARIAS pantallas, con un permiso por sub-ruta.
 *
 * `/api/reports` es el caso: un solo router con veintinueve endpoints que son
 * el libro diario, el balance, los márgenes y el coste laboral. Un permiso
 * único para todos ellos volvería a juntar lo que precisamente se quería
 * separar.
 *
 * Casa por prefijo más largo, así `/vat/pdf` hereda el permiso de `/vat` sin
 * tener que repetirlo. Lo que no case con ninguna entrada se deniega: dentro
 * de un router mixto, olvidarse de una sub-ruta es igual de fácil que
 * olvidarse de un router entero.
 */
export function mountApiBySubpath(
  app: Express,
  path: string,
  table: Record<string, string>,
  ...handlers: RequestHandler[]
): void {
  // La clave '' es el comodín: lo que no case con ninguna sub-ruta concreta.
  // Sin comodín, lo no listado se deniega.
  const fallback = table[''];
  const entries = Object.entries(table)
    .filter(([sub]) => sub !== '')
    .sort((a, b) => b[0].length - a[0].length);

  const validar = (sub: string, permission: string) => {
    if (permission !== PUBLIC_SUBPATH && !isKnownPermission(permission)) {
      throw new Error(
        `[Permisos] ${path}${sub} pide "${permission}", que no está en PERMISSION_CATALOG.`,
      );
    }
  };

  for (const [sub, permission] of entries) {
    validar(sub, permission);
    mounts.push({
      path: `${path}${sub}`,
      kind: permission === PUBLIC_SUBPATH ? 'public' : 'permission',
      permission: permission === PUBLIC_SUBPATH ? undefined : permission,
      reason: permission === PUBLIC_SUBPATH ? 'sub-ruta declarada pública' : undefined,
    });
  }
  if (fallback !== undefined) {
    validar('/*', fallback);
    mounts.push({ path: `${path}/*`, kind: 'permission', permission: fallback });
  }

  const gateFor = (permission: string) =>
    permission === PUBLIC_SUBPATH ? markAuthorized() : requirePermission(permission);
  const gates = new Map(entries.map(([sub, permission]) => [sub, gateFor(permission)]));
  const fallbackGate = fallback !== undefined ? gateFor(fallback) : null;

  app.use(path, (req: any, res: Response, next: NextFunction) => {
    const match = entries.find(([sub]) => req.path === sub || req.path.startsWith(`${sub}/`));
    if (match) return gates.get(match[0])!(req, res, next);
    if (fallbackGate) return fallbackGate(req, res, next);

    req[AUTHORIZED] = true;
    console.warn(`[Permisos] ${path}${req.path} no tiene permiso asignado en su tabla.`);
    return res.status(403).json({ error: 'Este endpoint no tiene permiso declarado.' });
  });

  app.use(path, ...handlers);
}

/**
 * Marca una sub-ruta como abierta dentro de un router que por lo demás exige
 * permiso. El caso es el selector de empresa del login: vive en el router de
 * membresías, que es de administración, pero se consulta ANTES de existir
 * sesión alguna.
 */
export const PUBLIC_SUBPATH = '__public__';

/**
 * Endpoint de apoyo: hace falta estar dentro de la empresa, pero no tiene un
 * módulo propio que conceder. `reason` es obligatorio y se imprime en el
 * informe de arranque — sirve para que la excepción tenga que justificarse.
 */
export function mountShared(
  app: Express,
  path: string,
  reason: string,
  ...handlers: RequestHandler[]
): void {
  mounts.push({ path, kind: 'shared', reason });
  app.use(path, markAuthorized(), ...handlers);
}

/** Endpoint abierto: login, alta inicial, seguimiento público, métricas. */
export function mountPublic(
  app: Express,
  path: string,
  reason: string,
  ...handlers: RequestHandler[]
): void {
  mounts.push({ path, kind: 'public', reason });
  app.use(path, markAuthorized(), ...handlers);
}

/**
 * Cierre por defecto. Va DESPUÉS de todos los montajes: si una petición a
 * `/api/...` llega hasta aquí sin haber pasado por ningún gate, es que su
 * router se montó a mano, y la respuesta es 403.
 *
 * Es lo que convierte "denegar por defecto" en algo real y no en una promesa
 * que depende de que nadie se despiste.
 */
export function denyUndeclared() {
  return (req: any, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/api/') && req.path !== '/api') return next();
    if (req[AUTHORIZED]) return next();

    console.warn(
      `[Permisos] ${req.method} ${req.originalUrl} llegó sin gate: su router no se montó con ` +
        `mountApi/mountShared/mountPublic.`,
    );
    return res.status(403).json({
      error: 'Este endpoint no tiene permiso declarado y se deniega por defecto.',
    });
  };
}

/** Tabla "montaje → permiso" para el arranque. */
export function mountReport(): string {
  const byKind = {
    permission: mounts.filter((m) => m.kind === 'permission'),
    shared: mounts.filter((m) => m.kind === 'shared'),
    public: mounts.filter((m) => m.kind === 'public'),
  };

  const lines = [
    `[Permisos] ${mounts.length} montajes: ${byKind.permission.length} con permiso, ` +
      `${byKind.shared.length} de apoyo, ${byKind.public.length} públicos.`,
  ];
  if (byKind.public.length > 0) {
    lines.push(`[Permisos] Públicos: ${byKind.public.map((m) => m.path).join(', ')}`);
  }
  return lines.join('\n');
}
