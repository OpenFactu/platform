/**
 * El montaje y el cierre por defecto, con una app de Express de mentira: lo
 * que se comprueba es qué middleware se aplica a cada ruta y qué pasa con lo
 * que no se declaró, no que la base de datos responda.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  mountApi,
  mountApiBySubpath,
  mountShared,
  mountPublic,
  denyUndeclared,
  registeredMounts,
  resetMounts,
  mountReport,
  PUBLIC_SUBPATH,
} from '../apiMounts';
import { AUTHORIZED } from '../../../api/middleware/requirePermission';

const router = express.Router();

describe('registro de montajes', () => {
  beforeEach(() => resetMounts());

  test('mountApi apunta el permiso exigido', () => {
    mountApi(express(), '/api/items', '/items', router);
    assert.deepEqual(registeredMounts(), [
      { path: '/api/items', kind: 'permission', permission: '/items' },
    ]);
  });

  test('un permiso que no está en el catálogo revienta AL ARRANCAR', () => {
    // Es deliberado: una errata dejaría el módulo inaccesible para todo el
    // mundo menos los admins, y eso tarda días en salir a la luz.
    assert.throws(
      () => mountApi(express(), '/api/x', '/no-existe-en-el-catalogo', router),
      /PERMISSION_CATALOG/,
    );
  });

  test('mountShared y mountPublic exigen decir por qué', () => {
    const app = express();
    mountShared(app, '/api/geo', 'catálogo de países', router);
    mountPublic(app, '/api/auth', 'login', router);

    const mounts = registeredMounts();
    assert.equal(mounts[0].kind, 'shared');
    assert.equal(mounts[0].reason, 'catálogo de países');
    assert.equal(mounts[1].kind, 'public');
  });

  test('el informe de arranque cuenta cada tipo', () => {
    const app = express();
    mountApi(app, '/api/items', '/items', router);
    mountShared(app, '/api/geo', 'países', router);
    mountPublic(app, '/api/auth', 'login', router);

    const report = mountReport();
    assert.match(report, /3 montajes/);
    assert.match(report, /1 con permiso/);
    assert.match(report, /Públicos: \/api\/auth/);
  });

  test('mountApiBySubpath registra un montaje por sub-ruta', () => {
    mountApiBySubpath(
      express(),
      '/api/reports',
      { '/vat': '/reports/accounting/vat', '/pl': '/reports/accounting/pl' },
      router,
    );

    const paths = registeredMounts().map((m) => m.path);
    assert.ok(paths.includes('/api/reports/vat'));
    assert.ok(paths.includes('/api/reports/pl'));
  });

  test('una sub-ruta pública se registra como tal, no como permiso', () => {
    mountApiBySubpath(
      express(),
      '/api/memberships',
      { '/tenants-for-user': PUBLIC_SUBPATH, '': '/users' },
      router,
    );

    const mounts = registeredMounts();
    const publica = mounts.find((m) => m.path === '/api/memberships/tenants-for-user');
    assert.equal(publica?.kind, 'public');
    // El comodín queda apuntado con su permiso.
    assert.ok(mounts.some((m) => m.path === '/api/memberships/*' && m.permission === '/users'));
  });
});

describe('cierre por defecto', () => {
  function fakeRes() {
    const res: any = { statusCode: 0, body: null };
    res.status = (c: number) => {
      res.statusCode = c;
      return res;
    };
    res.json = (b: any) => {
      res.body = b;
      return res;
    };
    return res;
  }

  test('deja pasar lo que ya pasó por un gate', () => {
    const req: any = { path: '/api/items', method: 'GET', [AUTHORIZED]: true };
    const res = fakeRes();
    let siguiente = false;
    denyUndeclared()(req, res, () => {
      siguiente = true;
    });
    assert.equal(siguiente, true);
  });

  test('deniega lo que llegó sin gate', () => {
    const req: any = { path: '/api/inventado', method: 'GET' };
    const res = fakeRes();
    denyUndeclared()(req, res, () => assert.fail('no debería continuar'));
    assert.equal(res.statusCode, 403);
    assert.match(res.body.error, /no tiene permiso declarado/);
  });

  test('no se mete con lo que no es de la API', () => {
    const req: any = { path: '/site/mi-empresa', method: 'GET' };
    const res = fakeRes();
    let siguiente = false;
    denyUndeclared()(req, res, () => {
      siguiente = true;
    });
    assert.equal(siguiente, true);
  });
});
