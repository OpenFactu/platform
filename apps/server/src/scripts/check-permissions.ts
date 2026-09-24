/**
 * Cruza las dos caras del sistema de permisos y canta lo que no encaja.
 *
 * Hay dos formas de que esto se rompa y ninguna avisa por su cuenta:
 *
 *  1. Una pantalla de la web exige un permiso que no está en el catálogo. El
 *     administrador no puede concederlo, así que la pantalla queda inaccesible
 *     para todo el que no sea admin — y nadie se entera hasta que alguien se
 *     queja. Había 27 así.
 *  2. Una ruta de la web no exige permiso ninguno, con lo que la ve cualquiera.
 *     Había 24 así, todas de Informes.
 *
 * Además lista las entradas del catálogo que ninguna ruta usa: o sobran, o
 * gobiernan solo la API (que también vale, pero conviene saberlo).
 *
 *   npx ts-node --transpile-only src/scripts/check-permissions.ts
 */

import fs from 'fs';
import path from 'path';
import { PERMISSION_CATALOG, isKnownPermission } from '../core/auth/permissionCatalog';

const WEB_MODULES = path.resolve(__dirname, '../../../web/src/modules');

interface WebRoute {
  file: string;
  pattern: string;
  permissionPath?: string;
}

/**
 * Lee los `pattern` y `permissionPath` de los manifiestos de la web.
 *
 * Con expresiones regulares y no importando los módulos: son TSX con
 * componentes de React dentro, y cargarlos desde el servidor arrastraría medio
 * árbol de dependencias del navegador. Para leer dos campos declarativos no
 * compensa.
 */
function readWebRoutes(): WebRoute[] {
  const out: WebRoute[] = [];

  for (const dir of fs.readdirSync(WEB_MODULES)) {
    for (const name of ['module.ts', 'module.tsx']) {
      const file = path.join(WEB_MODULES, dir, name);
      if (!fs.existsSync(file)) continue;

      const source = fs.readFileSync(file, 'utf8');
      // `withPermissionFromPattern([...])` rellena el permiso con el propio
      // patrón, así que esas rutas cuentan como declaradas.
      const autoFilled = source.includes('withPermissionFromPattern');

      // Forma A — un objeto por ruta: `{ pattern: '/x', permissionPath: '/x' }`.
      const chunks = source.split(/pattern:\s*/).slice(1);
      for (const chunk of chunks) {
        const patternMatch = chunk.match(/^'([^']+)'/);
        if (!patternMatch) continue;
        const pattern = patternMatch[1];
        const upToNext = chunk.split(/\n\s*\{/)[0];
        const permMatch = upToNext.match(/permissionPath:\s*'([^']+)'/);
        out.push({
          file: `${dir}/${name}`,
          pattern,
          permissionPath: permMatch ? permMatch[1] : autoFilled ? pattern : undefined,
        });
      }

      // Forma B — varias rutas de un mismo componente generadas con `.map()`:
      //   ...['/x', '/x/new', '/x/:id'].map((pattern, i) => ({ pattern, …
      // Sin esto, las 21 rutas de venta y compra quedaban invisibles para esta
      // comprobación, que es justo donde no se puede permitir un punto ciego.
      const mapped = source.matchAll(/\[((?:\s*'[^']+',?)+)\s*\]\.map\(/g);
      for (const m of mapped) {
        const patterns = [...m[1].matchAll(/'([^']+)'/g)].map((p) => p[1]);
        if (!patterns.every((p) => p.startsWith('/'))) continue;
        const rest = source.slice(m.index! + m[0].length, m.index! + m[0].length + 600);
        const permMatch = rest.match(/permissionPath:\s*'([^']+)'/);
        for (const pattern of patterns) {
          out.push({
            file: `${dir}/${name}`,
            pattern,
            permissionPath: permMatch ? permMatch[1] : autoFilled ? pattern : undefined,
          });
        }
      }
    }
  }

  return out;
}

/** Rutas que no enseñan datos de negocio y por eso no piden permiso. */
const SIN_PERMISO_A_PROPOSITO = new Set([
  '/', // portada
  '/profile', // el perfil de uno mismo
  '/driver', // app del repartidor, con su propio rol
  '/website/editor/:pageId', // cuelga de /website/pages, que sí lo pide
  '/document-templates/:id/designer',
  '/items/:itemId',
  '/logistics/shipments/:id',
]);

function main() {
  let problemas = 0;

  const rutas = readWebRoutes();
  console.log(`\n[permisos] ${rutas.length} rutas leídas de los manifiestos de la web.\n`);

  console.log('1) Rutas sin permiso declarado');
  const sinPermiso = rutas.filter(
    (r) => !r.permissionPath && !SIN_PERMISO_A_PROPOSITO.has(r.pattern),
  );
  if (sinPermiso.length === 0) {
    console.log(
      '   ✅ ninguna: todas las pantallas piden permiso o están en la lista de excepciones.',
    );
  } else {
    problemas += sinPermiso.length;
    console.log(`   ❌ ${sinPermiso.length} rutas las ve cualquier usuario autenticado:`);
    for (const r of sinPermiso) console.log(`      ${r.pattern}   (${r.file})`);
  }

  console.log('\n2) Permisos que exige la web y no existen en el catálogo');
  const desconocidos = [
    ...new Set(
      rutas
        .map((r) => r.permissionPath)
        .filter((p): p is string => !!p)
        .filter((p) => !isKnownPermission(p)),
    ),
  ];
  if (desconocidos.length === 0) {
    console.log('   ✅ ninguno: todo lo que piden las rutas se puede conceder.');
  } else {
    problemas += desconocidos.length;
    console.log(
      `   ❌ ${desconocidos.length} sin entrada en el catálogo (nadie puede concederlos):`,
    );
    for (const p of desconocidos) console.log(`      ${p}`);
  }

  console.log('\n3) Coherencia del propio catálogo');
  const vistos = new Set<string>();
  const duplicados = PERMISSION_CATALOG.filter((e) => {
    if (vistos.has(e.path)) return true;
    vistos.add(e.path);
    return false;
  });
  if (duplicados.length > 0) {
    problemas += duplicados.length;
    console.log(`   ❌ entradas repetidas: ${duplicados.map((d) => d.path).join(', ')}`);
  } else {
    console.log('   ✅ sin entradas repetidas.');
  }

  const huerfanos = PERMISSION_CATALOG.filter((e) => e.parent && !isKnownPermission(e.parent));
  if (huerfanos.length > 0) {
    problemas += huerfanos.length;
    console.log(`   ❌ con padre inexistente: ${huerfanos.map((h) => h.path).join(', ')}`);
  } else {
    console.log('   ✅ todos los "parent" apuntan a una entrada real.');
  }

  console.log('\n4) Entradas del catálogo que ninguna pantalla usa');
  const usados = new Set(rutas.map((r) => r.permissionPath).filter(Boolean));
  const soloApi = PERMISSION_CATALOG.filter((e) => !usados.has(e.path));
  if (soloApi.length === 0) {
    console.log('   · ninguna.');
  } else {
    // No es un error: hay permisos que solo gobiernan endpoints (cobros y
    // pagos, zonas de almacén). Se listan para poder revisarlos de un vistazo.
    console.log(`   · ${soloApi.length} gobiernan solo la API o son de plataforma:`);
    for (const e of soloApi) console.log(`      ${e.path}  — ${e.label}`);
  }

  console.log(
    problemas === 0
      ? '\n✅ Las dos caras del sistema de permisos concuerdan.\n'
      : `\n❌ ${problemas} problema(s).\n`,
  );
  process.exitCode = problemas === 0 ? 0 : 1;
}

main();
