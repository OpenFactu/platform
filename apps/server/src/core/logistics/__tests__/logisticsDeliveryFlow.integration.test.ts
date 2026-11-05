/**
 * Cada empresa decide cómo se reparte: qué se pide al cargar y al entregar, y si se
 * pueden dejar bultos en un acopio. Lo que pide la empresa lo hace cumplir el servidor,
 * no solo la pantalla.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startLogisticsHarness, testDatabaseUrl, type LogisticsHarness } from './logisticsHarness';

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
  return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

const DRIVER = { '/driver': { read: true, write: true, delete: false } };
const SIGNATURE = 'data:image/png;base64,AAAA';
const PHOTO = 'data:image/jpeg;base64,BBBB';

describe('cómo reparte cada empresa', { skip: !testDatabaseUrl }, () => {
  let h: LogisticsHarness;
  let drivers = 0;

  before(async () => {
    h = await startLogisticsHarness();
  });
  after(async () => {
    await h?.close();
  });

  const setFlow = async (patch: Record<string, unknown>) => {
    const current = (await h.api('GET', '/delivery-flow')).data;
    const saved = await h.api('PUT', '/delivery-flow', { ...current, ...patch });
    assert.equal(saved.status, 200);
    return saved.data;
  };
  const resetFlow = () => h.query(`DELETE FROM "SystemConfig" WHERE key = 'logistics_delivery_flow'`);

  /** Una ruta sin salir, con su conductor, un envío y dos bultos. */
  const assigned = async () => {
    const driver = await h.seedUser(`flujo-${++drivers}`, DRIVER);
    const employeeId = await h.seedEmployee(driver.id);
    const shipmentId = (
      await h.api('POST', '/shipments', { destinationAddress: 'Calle Mayor 1', recipientName: 'Ana' })
    ).data.id as string;
    const first = (await h.api('POST', '/packages', { shipmentId, weightKg: 1 })).data;
    const second = (await h.api('POST', '/packages', { shipmentId, weightKg: 2 })).data;
    const route = (
      await h.api('POST', '/routes', { plannedDate: '2026-11-04', driverEmployeeId: employeeId })
    ).data;
    await h.api('POST', `/shipments/${shipmentId}/dispatch`, { routeId: route.id });
    const [stop] = (await h.api('GET', `/routes/${route.id}/stops`)).data;
    return {
      driver,
      shipmentId,
      routeId: route.id as string,
      stopId: stop.id as string,
      packages: [first.id as string, second.id as string],
    };
  };

  const deliver = (a: Awaited<ReturnType<typeof assigned>>, proof: Record<string, unknown>) =>
    h.api('POST', `/my/routes/${a.routeId}/stops/${a.stopId}/deliver`, proof, a.driver);
  const started = async () => {
    const a = await assigned();
    await h.api('POST', `/routes/${a.routeId}/start`);
    return a;
  };

  describe('la configuración', () => {
    test('sin tocar nada, firma o documento y foto opcional', async () => {
      await resetFlow();
      const { status, data } = await h.api('GET', '/delivery-flow');
      assert.equal(status, 200);
      assert.equal(data.signature, 'required');
      assert.equal(data.allowDocument, true);
      assert.equal(data.photo, 'optional');
      assert.equal(data.loadOut, 'check');
      assert.equal(data.loadOutRequired, false);
      assert.ok(data.reasons.some((r: any) => r.id === 'nobody' && r.kind === 'postpone'));
    });

    test('se guarda por empresa y lo que no vale se queda como estaba', async () => {
      await resetFlow();
      const saved = await setFlow({ signature: 'off', photo: 'tal-vez', handover: ['customer', 'marte'] });
      assert.equal(saved.signature, 'off');
      assert.equal(saved.photo, 'optional');
      assert.deepEqual(saved.handover, ['customer']);
      assert.equal((await h.api('GET', '/delivery-flow')).data.signature, 'off');
    });

    test('sin foto no se puede dejar en un sitio seguro: no habría prueba', async () => {
      await resetFlow();
      const saved = await setFlow({ photo: 'off', handover: ['customer', 'safePlace'] });
      assert.deepEqual(saved.handover, ['customer']);
    });

    test('se pueden añadir motivos propios, y "otro motivo" siempre está', async () => {
      await resetFlow();
      const saved = await setFlow({
        reasons: [
          { id: 'nobody', kind: 'postpone', enabled: false },
          { id: 'perro', kind: 'incident', enabled: true, label: 'Perro suelto' },
          { id: 'mal', kind: 'nada', enabled: true, label: 'No vale' },
        ],
      });
      assert.equal(saved.reasons.find((r: any) => r.id === 'perro').label, 'Perro suelto');
      assert.equal(saved.reasons.find((r: any) => r.id === 'nobody').enabled, false);
      assert.equal(saved.reasons.some((r: any) => r.id === 'mal'), false);
      assert.equal(saved.reasons.find((r: any) => r.id === 'other').enabled, true);
    });

    test('un conductor no puede cambiarla', async () => {
      const a = await assigned();
      const denied = await h.api('PUT', '/delivery-flow', { signature: 'off' }, a.driver);
      assert.equal(denied.status, 403);
    });

    test('el conductor la recibe con su ruta', async () => {
      await resetFlow();
      await setFlow({ photo: 'required' });
      const a = await assigned();
      const detail = await h.api('GET', `/my/routes/${a.routeId}`, undefined, a.driver);
      assert.equal(detail.data.flow.photo, 'required');
      assert.equal(detail.data.packages.length, 2);
      assert.equal(detail.data.packages[0].loadedAt, null);
    });
  });

  describe('lo que se pide al entregar', () => {
    test('por defecto hace falta la firma o el documento', async () => {
      await resetFlow();
      assert.equal((await deliver(await started(), { recipientName: 'Ana' })).status, 400);
      assert.equal(
        (await deliver(await started(), { recipientName: 'Ana', signatureImage: SIGNATURE })).status,
        200,
      );
      assert.equal(
        (await deliver(await started(), { recipientName: 'Ana', recipientDocument: '123' })).status,
        200,
      );
    });

    test('si la empresa no acepta el documento, solo vale la firma', async () => {
      await resetFlow();
      await setFlow({ allowDocument: false });
      assert.equal((await deliver(await started(), { recipientDocument: '123' })).status, 400);
    });

    test('si la empresa no pide firma, no hace falta', async () => {
      await resetFlow();
      await setFlow({ signature: 'off' });
      assert.equal((await deliver(await started(), { recipientName: 'Ana' })).status, 200);
    });

    test('si la empresa exige foto, sin foto no se entrega', async () => {
      await resetFlow();
      await setFlow({ signature: 'off', photo: 'required' });
      assert.equal((await deliver(await started(), {})).status, 400);
      assert.equal((await deliver(await started(), { photoImage: PHOTO })).status, 200);
    });

    test('en un sitio seguro no hay quien firme, pero siempre hay foto', async () => {
      await resetFlow();
      await setFlow({ handover: ['customer', 'safePlace'] });
      const without = await started();
      assert.equal((await deliver(without, { handover: 'safePlace' })).status, 400);
      const a = await started();
      assert.equal((await deliver(a, { handover: 'safePlace', photoImage: PHOTO })).status, 200);
      const [stop] = (await h.api('GET', `/routes/${a.routeId}/stops`)).data;
      assert.equal(stop.handover, 'safePlace');
    });

    test('no se puede dejar donde la empresa no permite', async () => {
      await resetFlow();
      const a = await started();
      const refused = await deliver(a, { handover: 'neighbor', signatureImage: SIGNATURE });
      assert.equal(refused.status, 400);
    });

    test('la oficina puede marcar entregado sin prueba', async () => {
      await resetFlow();
      const a = await started();
      const office = await h.api('POST', `/routes/${a.routeId}/stops/${a.stopId}/deliver`, {});
      assert.equal(office.status, 200);
    });
  });

  describe('cargar antes de salir', () => {
    const load = (a: Awaited<ReturnType<typeof assigned>>, id: string, loaded = true) =>
      h.api('POST', `/my/routes/${a.routeId}/packages/${id}/load`, { loaded }, a.driver);
    const packagesOf = async (a: Awaited<ReturnType<typeof assigned>>) =>
      (await h.api('GET', `/my/routes/${a.routeId}`, undefined, a.driver)).data.packages;

    test('marcar y desmarcar un bulto', async () => {
      await resetFlow();
      const a = await assigned();
      assert.equal((await load(a, a.packages[0])).status, 200);
      let rows = await packagesOf(a);
      assert.ok(rows.find((p: any) => p.id === a.packages[0]).loadedAt);
      await load(a, a.packages[0], false);
      rows = await packagesOf(a);
      assert.equal(rows.find((p: any) => p.id === a.packages[0]).loadedAt, null);
    });

    test('un bulto de otra ruta no se carga', async () => {
      await resetFlow();
      const a = await assigned();
      const b = await assigned();
      assert.equal((await load(a, b.packages[0])).status, 404);
    });

    test('otro conductor no toca la carga ajena', async () => {
      await resetFlow();
      const a = await assigned();
      const b = await assigned();
      const denied = await h.api(
        'POST',
        `/my/routes/${a.routeId}/packages/${a.packages[0]}/load`,
        { loaded: true },
        b.driver,
      );
      assert.equal(denied.status, 403);
    });

    test('si la empresa lo exige, no se sale sin cargarlo todo', async () => {
      await resetFlow();
      await setFlow({ loadOut: 'scan', loadOutRequired: true });
      const a = await assigned();
      await load(a, a.packages[0]);
      const refused = await h.api('POST', `/my/routes/${a.routeId}/start`, undefined, a.driver);
      assert.equal(refused.status, 409);
      assert.match(refused.data.error, /1/);
      await load(a, a.packages[1]);
      assert.equal(
        (await h.api('POST', `/my/routes/${a.routeId}/start`, undefined, a.driver)).status,
        200,
      );
    });

    test('si no lo exige, se puede salir', async () => {
      await resetFlow();
      const a = await assigned();
      assert.equal(
        (await h.api('POST', `/my/routes/${a.routeId}/start`, undefined, a.driver)).status,
        200,
      );
    });

    test('al salir, lo cargado deja de estar en el acopio; lo demás sigue allí', async () => {
      await resetFlow();
      const area = (await h.api('POST', '/staging-areas', { code: 'AC-1', name: 'Nave' })).data;
      const a = await assigned();
      await h.api('POST', `/shipments/${a.shipmentId}/to-staging`, { stagingAreaId: area.id });
      await load(a, a.packages[0]);
      await h.api('POST', `/my/routes/${a.routeId}/start`, undefined, a.driver);
      const rows = await packagesOf(a);
      assert.equal(rows.find((p: any) => p.id === a.packages[0]).stagingAreaId, null);
      assert.equal(rows.find((p: any) => p.id === a.packages[1]).stagingAreaId, area.id);
    });
  });

  describe('los mapas de la empresa', () => {
    const setMap = async (patch: Record<string, unknown>) => {
      const current = (await h.api('GET', '/delivery-flow')).data;
      return (await setFlow({ map: { ...current.map, ...patch } })).map;
    };

    test('de serie, el mapa normal con satélite y navegando con Google', async () => {
      await resetFlow();
      const { map } = (await h.api('GET', '/delivery-flow')).data;
      assert.equal(map.provider, 'standard');
      assert.equal(map.satellite, true);
      assert.equal(map.navigationApp, 'google');
    });

    test('se puede elegir el mapa, también un servidor propio', async () => {
      await resetFlow();
      assert.equal((await setMap({ provider: 'dark' })).provider, 'dark');
      const custom = await setMap({
        provider: 'custom',
        tileUrl: 'https://mapas.ejemplo.com/{z}/{x}/{y}.png',
        attribution: '© Mapas',
      });
      assert.equal(custom.provider, 'custom');
      assert.equal(custom.tileUrl, 'https://mapas.ejemplo.com/{z}/{x}/{y}.png');
      assert.equal(custom.attribution, '© Mapas');
    });

    test('un servidor propio que no vale vuelve al de serie, sin romper los mapas', async () => {
      await resetFlow();
      for (const tileUrl of ['', 'http://inseguro.com/{z}/{x}/{y}.png', 'https://sin-huecos.com/mapa.png']) {
        const map = await setMap({ provider: 'custom', tileUrl });
        assert.equal(map.provider, 'standard');
      }
    });

    test('sin satélite, no puede ser el mapa con el que se abre', async () => {
      await resetFlow();
      const map = await setMap({ satellite: false, defaultStyle: 'satellite' });
      assert.equal(map.defaultStyle, 'standard');
    });

    test('elegir con qué app se navega', async () => {
      await resetFlow();
      assert.equal((await setMap({ navigationApp: 'waze' })).navigationApp, 'waze');
      assert.equal((await setMap({ navigationApp: 'marte' })).navigationApp, 'google');
    });

    test('el conductor recibe el mapa de su empresa', async () => {
      await resetFlow();
      await setMap({ provider: 'light' });
      const a = await assigned();
      const map = await h.api('GET', '/my/map-config', undefined, a.driver);
      assert.equal(map.status, 200);
      assert.equal(map.data.provider, 'light');
    });

    test('el seguimiento público recibe el mapa y nada más de la configuración', async () => {
      await resetFlow();
      await setMap({ provider: 'light' });
      const a = await assigned();
      const [shipment] = await h.query(
        `SELECT "reportToken" FROM "Shipment" WHERE id = '${a.shipmentId}'`,
      );
      const track = await h.api('GET', `/track/${shipment.reportToken}`, undefined, null);
      assert.equal(track.status, 200);
      assert.equal(track.data.map.provider, 'light');
      assert.equal('navigationApp' in track.data.map, false);
      assert.equal('signature' in track.data, false);
      assert.equal('flow' in track.data, false);
    });

    describe('un proveedor externo con clave', () => {
      const THIRD_PARTY = {
        provider: 'custom',
        tileUrl: 'https://api.ejemplo.com/calles/{z}/{x}/{y}.png?key={key}',
        satelliteUrl: 'https://api.ejemplo.com/satelite/{z}/{x}/{y}.jpg?key={key}',
        apiKey: 'a b/c',
        attribution: '© Ejemplo',
        maxZoom: 18,
      };

      test('guarda la clave, el satélite y el zoom máximo', async () => {
        await resetFlow();
        const map = await setMap({ ...THIRD_PARTY, apiKey: '  a b/c  ' });
        assert.equal(map.provider, 'custom');
        assert.equal(map.tileUrl, THIRD_PARTY.tileUrl);
        assert.equal(map.satelliteUrl, THIRD_PARTY.satelliteUrl);
        assert.equal(map.apiKey, 'a b/c');
        assert.equal(map.maxZoom, 18);
      });

      test('una dirección que pide clave no vale sin ella', async () => {
        await resetFlow();
        const map = await setMap({ ...THIRD_PARTY, apiKey: '   ' });
        assert.equal(map.provider, 'standard');
        assert.equal(map.tileUrl, '');
      });

      test('una clave que la dirección no usa no se guarda', async () => {
        await resetFlow();
        const map = await setMap({
          provider: 'custom',
          tileUrl: 'https://mapas.ejemplo.com/{z}/{x}/{y}.png',
          apiKey: 'sobra',
        });
        assert.equal(map.provider, 'custom');
        assert.equal(map.apiKey, '');
      });

      test('el satélite y el zoom que no valen se ignoran', async () => {
        await resetFlow();
        const map = await setMap({
          ...THIRD_PARTY,
          satelliteUrl: 'http://inseguro.com/{z}/{x}/{y}.jpg',
          maxZoom: 99,
        });
        assert.equal(map.provider, 'custom');
        assert.equal(map.satelliteUrl, '');
        assert.equal(map.maxZoom, null);
      });

      test('volver a un mapa de serie quita la clave', async () => {
        await resetFlow();
        await setMap(THIRD_PARTY);
        const map = await setMap({ provider: 'light' });
        assert.equal(map.apiKey, '');
        assert.equal(map.tileUrl, '');
        assert.equal(map.satelliteUrl, '');
        assert.equal(map.maxZoom, null);
      });

      const KEYED_TILES = 'https://api.ejemplo.com/calles/{z}/{x}/{y}.png?key=a%20b%2Fc';
      const KEYED_SATELLITE = 'https://api.ejemplo.com/satelite/{z}/{x}/{y}.jpg?key=a%20b%2Fc';

      test('el conductor recibe la dirección con la clave puesta, no la clave aparte', async () => {
        await resetFlow();
        await setMap(THIRD_PARTY);
        const a = await assigned();
        const { data: map } = await h.api('GET', '/my/map-config', undefined, a.driver);
        assert.equal(map.tileUrl, KEYED_TILES);
        assert.equal(map.satelliteUrl, KEYED_SATELLITE);
        assert.equal(map.maxZoom, 18);
        assert.equal(map.navigationApp, 'google');
        assert.equal('apiKey' in map, false);
      });

      test('el detalle de la ruta tampoco lleva la clave aparte', async () => {
        await resetFlow();
        await setMap(THIRD_PARTY);
        const a = await assigned();
        const { data } = await h.api('GET', `/my/routes/${a.routeId}`, undefined, a.driver);
        assert.equal(data.flow.map.navigationApp, 'google');
        assert.equal('apiKey' in data.flow.map, false);
      });

      test('el seguimiento público recibe la dirección con la clave puesta, no la clave aparte', async () => {
        await resetFlow();
        await setMap(THIRD_PARTY);
        const a = await assigned();
        const [shipment] = await h.query(
          `SELECT "reportToken" FROM "Shipment" WHERE id = '${a.shipmentId}'`,
        );
        const { data } = await h.api('GET', `/track/${shipment.reportToken}`, undefined, null);
        assert.equal(data.map.tileUrl, KEYED_TILES);
        assert.equal(data.map.satelliteUrl, KEYED_SATELLITE);
        assert.equal(data.map.maxZoom, 18);
        assert.equal('apiKey' in data.map, false);
      });

      test('una configuración guardada antes de existir la clave sigue valiendo', async () => {
        await resetFlow();
        await setMap({ provider: 'light' });
        await h.query(
          `UPDATE "SystemConfig" SET value = '${JSON.stringify({
            map: { provider: 'custom', tileUrl: 'https://mapas.ejemplo.com/{z}/{x}/{y}.png' },
          })}' WHERE key = 'logistics_delivery_flow'`,
        );
        const { map } = (await h.api('GET', '/delivery-flow')).data;
        assert.equal(map.provider, 'custom');
        assert.equal(map.apiKey, '');
        assert.equal(map.satelliteUrl, '');
        assert.equal(map.maxZoom, null);
      });
    });
  });

  describe('reportes de la aplicación', () => {
    const report = (user: any, body: Record<string, unknown>) =>
      h.api('POST', '/my/app-reports', body, user);

    test('el conductor cuenta un problema y la oficina lo ve con su contexto', async () => {
      const a = await assigned();
      const sent = await report(a.driver, {
        category: 'bug',
        message: 'No carga el mapa',
        context: { path: '/driver', userAgent: 'Prueba/1.0', routeId: a.routeId },
      });
      assert.equal(sent.status, 200);

      const list = await h.api('GET', '/app-reports');
      assert.equal(list.status, 200);
      const row = list.data.find((r: any) => r.id === sent.data.id);
      assert.equal(row.message, 'No carga el mapa');
      assert.equal(row.category, 'bug');
      assert.equal(row.status, 'open');
      assert.equal(row.userId, a.driver.id);
      assert.equal(row.context.userAgent, 'Prueba/1.0');
    });

    test('el aviso llega a los administradores, no a toda la empresa', async () => {
      const a = await assigned();
      const b = await assigned();
      const admin = await h.seedUser(`jefe-${++drivers}`, {});
      await h.query(
        `UPDATE public."UserTenantMembership" SET role = 'ADMIN' WHERE "userId" = '${admin.id}'`,
      );
      await report(a.driver, { message: 'Aviso' });
      const count = async (userId: string) =>
        Number(
          (await h.query(`SELECT count(*) AS n FROM "Notification" WHERE "userId" = '${userId}'`))[0].n,
        );
      assert.equal(await count(admin.id), 1);
      assert.equal(await count(b.driver.id), 0);
    });

    test('sin texto no se envía', async () => {
      const a = await assigned();
      assert.equal((await report(a.driver, { message: '   ' })).status, 400);
    });

    test('una categoría que no existe queda como "otro"', async () => {
      const a = await assigned();
      const sent = await report(a.driver, { category: 'marte', message: 'Algo' });
      const row = (await h.api('GET', '/app-reports')).data.find((r: any) => r.id === sent.data.id);
      assert.equal(row.category, 'other');
    });

    test('la foto no viaja en el listado, pero se puede abrir', async () => {
      const a = await assigned();
      const sent = await report(a.driver, { message: 'Con foto', photo: PHOTO });
      const row = (await h.api('GET', '/app-reports')).data.find((r: any) => r.id === sent.data.id);
      assert.equal('photo' in row, false);
      assert.equal(row.hasPhoto, true);
      const full = await h.api('GET', `/app-reports/${sent.data.id}`);
      assert.equal(full.data.photo, PHOTO);
    });

    test('solo se guarda como foto lo que es una imagen', async () => {
      const a = await assigned();
      const sent = await report(a.driver, { message: 'Sin foto', photo: 'https://malo.test/x.png' });
      const full = await h.api('GET', `/app-reports/${sent.data.id}`);
      assert.equal(full.data.photo, null);
    });

    test('la oficina lo da por resuelto y lo puede reabrir', async () => {
      const a = await assigned();
      const sent = await report(a.driver, { message: 'Resolver' });
      const url = `/app-reports/${sent.data.id}`;
      assert.equal((await h.api('PATCH', url, { status: 'resolved' })).status, 200);
      let row = (await h.api('GET', '/app-reports')).data.find((r: any) => r.id === sent.data.id);
      assert.equal(row.status, 'resolved');
      assert.ok(row.resolvedAt);
      await h.api('PATCH', url, { status: 'open' });
      row = (await h.api('GET', '/app-reports')).data.find((r: any) => r.id === sent.data.id);
      assert.equal(row.status, 'open');
      assert.equal(row.resolvedAt, null);
    });

    test('un reporte que no existe da error', async () => {
      assert.equal((await h.api('PATCH', '/app-reports/nada', { status: 'resolved' })).status, 404);
      assert.equal((await h.api('GET', '/app-reports/nada')).status, 404);
    });

    test('un conductor no lee los reportes de los demás', async () => {
      const a = await assigned();
      assert.equal((await h.api('GET', '/app-reports', undefined, a.driver)).status, 403);
    });
  });

  describe('dejar bultos en un acopio', () => {
    let areaId: string;
    before(async () => {
      areaId = (await h.api('POST', '/staging-areas', { code: 'AC-2', name: 'Almacén sur' })).data.id;
    });
    const drop = (a: Awaited<ReturnType<typeof assigned>>, shipmentIds: string[], area = areaId) =>
      h.api(
        'POST',
        `/my/routes/${a.routeId}/drop`,
        { stagingAreaId: area, shipmentIds },
        a.driver,
      );

    test('el conductor ve los acopios', async () => {
      const a = await assigned();
      const list = await h.api('GET', '/my/staging-areas', undefined, a.driver);
      assert.equal(list.status, 200);
      assert.ok(list.data.some((row: any) => row.id === areaId && row.name === 'Almacén sur'));
    });

    test('los bultos pasan al acopio y la parada queda aplazada', async () => {
      await resetFlow();
      const a = await started();
      await h.api(
        'POST',
        `/my/routes/${a.routeId}/packages/${a.packages[0]}/load`,
        { loaded: true },
        a.driver,
      );
      const dropped = await drop(a, [a.shipmentId]);
      assert.equal(dropped.status, 200);

      const detail = (await h.api('GET', `/my/routes/${a.routeId}`, undefined, a.driver)).data;
      for (const pkg of detail.packages) {
        assert.equal(pkg.stagingAreaId, areaId);
        assert.equal(pkg.loadedAt, null);
      }
      assert.equal(detail.stops[0].status, 'postponed');
      const events = (await h.api('GET', `/shipments/${a.shipmentId}/events`)).data;
      assert.ok(events.some((e: any) => e.kind === 'staging' && /Almacén sur/.test(e.description)));
    });

    test('lo ya entregado no se puede dejar', async () => {
      await resetFlow();
      const a = await started();
      await deliver(a, { signatureImage: SIGNATURE });
      assert.equal((await drop(a, [a.shipmentId])).status, 409);
    });

    test('un envío de otra ruta no se puede dejar', async () => {
      await resetFlow();
      const a = await started();
      const b = await started();
      assert.equal((await drop(a, [b.shipmentId])).status, 404);
    });

    test('si la empresa no lo permite, no se puede', async () => {
      await resetFlow();
      await setFlow({ stagingDrop: false });
      const a = await started();
      assert.equal((await drop(a, [a.shipmentId])).status, 403);
    });

    test('un acopio que no existe da error', async () => {
      await resetFlow();
      const a = await started();
      assert.equal((await drop(a, [a.shipmentId], 'no-existe')).status, 404);
    });
  });
});
