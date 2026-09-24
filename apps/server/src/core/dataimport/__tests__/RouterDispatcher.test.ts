/**
 * El dispatcher es la pieza de la que depende todo el importador: si el
 * `req`/`res` sintetizado no se comporta como el de Express, las filas se
 * escriben mal o no se escriben. Estos tests no tocan la base de datos —
 * montan routers de mentira y comprueban el contrato.
 *
 * La contraparte contra la API real (numeración por prefijo de grupo,
 * auditoría, campos de plugin) está en `src/scripts/check-router-dispatch.ts`,
 * que sí necesita Postgres.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from 'express';
import { callRouter, extractErrorMessage } from '../RouterDispatcher';

const ctx = {
  tenantClient: { marker: 'cliente-del-tenant' } as any,
  tenantId: 'tenant-1',
  tenantSchema: 'tenant_pruebas',
  user: { id: 'user-1', role: 'ADMIN', email: 'admin@test.local' },
};

describe('callRouter', () => {
  test('ejecuta el handler y devuelve lo que respondió', async () => {
    const router = Router();
    router.post('/', (req: any, res) => res.json({ id: 'nuevo', recibido: req.body }));

    const result = await callRouter(router, {
      method: 'POST',
      url: '/',
      body: { name: 'Ferretería' },
      ctx,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.data.id, 'nuevo');
    assert.deepEqual(result.data.recibido, { name: 'Ferretería' });
  });

  test('inyecta el contexto del tenant igual que tenantContextMiddleware', async () => {
    const router = Router();
    router.post('/', (req: any, res) =>
      res.json({
        tenantId: req.tenantId,
        tenantSchema: req.tenantSchema,
        userId: req.user?.id,
        clientMarker: req.tenantClient?.marker,
        headerTenant: req.headers['x-tenant-id'],
      }),
    );

    const { data } = await callRouter(router, { method: 'POST', url: '/', body: {}, ctx });

    assert.equal(data.tenantId, 'tenant-1');
    assert.equal(data.tenantSchema, 'tenant_pruebas');
    assert.equal(data.userId, 'user-1');
    assert.equal(data.clientMarker, 'cliente-del-tenant');
    // `partners.ts` audita leyendo la cabecera, no req.tenantId.
    assert.equal(data.headerTenant, 'tenant-1');
  });

  test('resuelve los parámetros de ruta', async () => {
    const router = Router();
    router.patch('/:id', (req: any, res) => res.json({ id: req.params.id }));

    const { data } = await callRouter(router, {
      method: 'PATCH',
      url: '/abc-123',
      body: {},
      ctx,
    });

    assert.equal(data.id, 'abc-123');
  });

  test('un status de error no lanza: vuelve como ok:false', async () => {
    const router = Router();
    router.post('/', (_req, res) => res.status(400).json({ error: 'NIF inválido' }));

    const result = await callRouter(router, { method: 'POST', url: '/', body: {}, ctx });

    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.data.error, 'NIF inválido');
  });

  test('una excepción del handler se convierte en 500 con el mensaje real', async () => {
    const router = Router();
    router.post('/', () => {
      throw new Error('se rompió por dentro');
    });

    const result = await callRouter(router, { method: 'POST', url: '/', body: {}, ctx });

    assert.equal(result.status, 500);
    assert.match(result.data.error, /se rompió por dentro/);
  });

  test('un rechazo asíncrono también se captura', async () => {
    const router = Router();
    router.post('/', async (_req, _res, next) => {
      next(new Error('falló la consulta'));
    });

    const result = await callRouter(router, { method: 'POST', url: '/', body: {}, ctx });

    assert.equal(result.status, 500);
    assert.match(result.data.error, /falló la consulta/);
  });

  test('una ruta que no existe es 404, no un cuelgue', async () => {
    const router = Router();
    router.post('/', (_req, res) => res.json({}));

    const result = await callRouter(router, {
      method: 'POST',
      url: '/no-existe',
      body: {},
      ctx,
      timeoutMs: 2000,
    });

    assert.equal(result.status, 404);
  });

  test('un handler que nunca responde corta por timeout', async () => {
    const router = Router();
    router.post('/', () => {
      /* nunca responde */
    });

    const result = await callRouter(router, {
      method: 'POST',
      url: '/',
      body: {},
      ctx,
      timeoutMs: 150,
    });

    assert.equal(result.status, 504);
    assert.match(result.data.error, /no respondió/);
  });

  test('los middlewares del router se ejecutan en orden', async () => {
    const pasos: string[] = [];
    const router = Router();
    router.use((_req, _res, next) => {
      pasos.push('middleware');
      next();
    });
    router.post('/', (_req, res) => {
      pasos.push('handler');
      res.json({ ok: true });
    });

    await callRouter(router, { method: 'POST', url: '/', body: {}, ctx });

    assert.deepEqual(pasos, ['middleware', 'handler']);
  });

  test('un middleware que corta con 403 impide llegar al handler', async () => {
    let llegó = false;
    const router = Router();
    router.use((_req, res) => res.status(403).json({ error: 'Falta el scope' }));
    router.post('/', (_req, res) => {
      llegó = true;
      res.json({});
    });

    const result = await callRouter(router, { method: 'POST', url: '/', body: {}, ctx });

    assert.equal(result.status, 403);
    assert.equal(llegó, false);
  });

  test('solo cuenta la primera respuesta aunque el handler siga trabajando', async () => {
    const router = Router();
    router.post('/', (_req, res) => {
      res.json({ primera: true });
      // `partners.ts` hace justo esto: responde y luego audita sin await.
      setTimeout(() => {
        try {
          res.json({ segunda: true });
        } catch {
          /* ignorado */
        }
      }, 10);
    });

    const result = await callRouter(router, { method: 'POST', url: '/', body: {}, ctx });
    await new Promise((r) => setTimeout(r, 30));

    assert.deepEqual(result.data, { primera: true });
  });

  test('res.status().send() también resuelve', async () => {
    const router = Router();
    router.delete('/:id', (_req, res) => res.status(204).send());

    const result = await callRouter(router, { method: 'DELETE', url: '/x', ctx });

    assert.equal(result.status, 204);
    assert.equal(result.ok, true);
  });
});

describe('extractErrorMessage', () => {
  test('prefiere el detalle de Postgres, que es el que dice qué pasó', () => {
    const err: any = new Error('Failed query: insert into ...');
    err.cause = { detail: 'Key (code)=(CLI-001) already exists.' };
    assert.match(extractErrorMessage(err), /already exists/);
  });

  test('cae al mensaje de la causa y luego al del error', () => {
    const conCausa: any = new Error('Failed query');
    conCausa.cause = { message: 'null value in column "name"' };
    assert.match(extractErrorMessage(conCausa), /null value/);
    assert.equal(extractErrorMessage(new Error('plano')), 'plano');
  });

  test('nunca devuelve vacío', () => {
    assert.equal(extractErrorMessage({}), 'Error desconocido');
  });
});
