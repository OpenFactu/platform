import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERMISSION_CATALOG,
  ALWAYS_ALLOWED_PATHS,
  catalogForAdmins,
  childrenOf,
  getPermissionEntry,
  isKnownPermission,
} from '../permissionCatalog';
import { actionForMethod } from '../../../api/middleware/requirePermission';

describe('catálogo de permisos', () => {
  test('no hay rutas repetidas', () => {
    const paths = PERMISSION_CATALOG.map((e) => e.path);
    assert.equal(new Set(paths).size, paths.length);
  });

  test('toda entrada tiene ruta, etiqueta y grupo', () => {
    for (const e of PERMISSION_CATALOG) {
      assert.ok(e.path.startsWith('/'), `${e.path} debería empezar por /`);
      assert.ok(e.label.length > 0, `${e.path} sin etiqueta`);
      assert.ok(e.group.length > 0, `${e.path} sin grupo`);
    }
  });

  test('los "parent" apuntan a entradas que existen', () => {
    for (const e of PERMISSION_CATALOG) {
      if (!e.parent) continue;
      assert.ok(isKnownPermission(e.parent), `${e.path} cuelga de ${e.parent}, que no existe`);
    }
  });

  test('los informes son uno por pantalla, no uno para todos', () => {
    const informes = PERMISSION_CATALOG.filter((e) => e.path.startsWith('/reports/'));
    // Es el agujero que originó todo esto: 24 pantallas sin permiso ninguno.
    assert.ok(informes.length >= 24, `solo ${informes.length} informes en el catálogo`);
    assert.ok(informes.some((e) => e.path === '/reports/accounting/vat'));
    assert.ok(informes.some((e) => e.path === '/reports/hr/labor-cost'));
  });

  test('cada informe cuelga de su portada', () => {
    const hijos = childrenOf('/reports/accounting');
    assert.ok(hijos.length >= 6);
    assert.ok(hijos.every((h) => h.path.startsWith('/reports/accounting/')));
  });

  test('lo de plataforma no se ofrece a los administradores de empresa', () => {
    const ofrecidos = catalogForAdmins().flatMap((g) => g.items.map((i) => i.path));
    assert.ok(!ofrecidos.includes('/system/cockpit'));
    assert.ok(ofrecidos.includes('/items'));
  });

  test('los grupos salen en el orden del catálogo y sin repetirse', () => {
    const grupos = catalogForAdmins().map((g) => g.group);
    assert.equal(new Set(grupos).size, grupos.length);
    assert.equal(grupos[0], 'Catálogos');
  });

  test('getPermissionEntry devuelve la etiqueta que se enseña en el 403', () => {
    assert.equal(getPermissionEntry('/reports/accounting/vat')?.label, 'Libro de IVA');
    assert.equal(getPermissionEntry('/no-existe'), undefined);
  });

  test('la portada y el perfil no piden permiso', () => {
    assert.ok(ALWAYS_ALLOWED_PATHS.has('/'));
    assert.ok(ALWAYS_ALLOWED_PATHS.has('/profile'));
    // Y no se cuelan como entradas concedibles.
    assert.ok(!isKnownPermission('/'));
  });
});

describe('acción según el método HTTP', () => {
  test('leer', () => {
    assert.equal(actionForMethod('GET'), 'read');
    assert.equal(actionForMethod('HEAD'), 'read');
    assert.equal(actionForMethod('get'), 'read');
  });

  test('escribir', () => {
    assert.equal(actionForMethod('POST'), 'write');
    assert.equal(actionForMethod('PATCH'), 'write');
    assert.equal(actionForMethod('PUT'), 'write');
  });

  test('borrar', () => {
    assert.equal(actionForMethod('DELETE'), 'delete');
  });

  test('sin método se asume lectura, que es lo menos dañino', () => {
    assert.equal(actionForMethod(''), 'read');
  });
});
