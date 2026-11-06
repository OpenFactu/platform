/**
 * El conductor con permiso propio: ve y opera sus rutas, y nada del centro
 * logístico. Y la flota: lo que se bloquea, lo que solo se avisa y las horas.
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
const OFFICE = { '/logistics': { read: true, write: true, delete: true } };

describe('conductor y flota', { skip: !testDatabaseUrl }, () => {
  let h: LogisticsHarness;

  before(async () => {
    h = await startLogisticsHarness();
  });
  after(async () => {
    await h?.close();
  });

  const newShipment = async (extra: Record<string, unknown> = {}) =>
    (await h.api('POST', '/shipments', { destinationAddress: 'Calle Mayor 1, Madrid', ...extra }))
      .data.id as string;
  const newRoute = async (extra: Record<string, unknown> = {}) =>
    (await h.api('POST', '/routes', { plannedDate: '2026-11-04', ...extra })).data;
  const stopsOf = async (routeId: string) => (await h.api('GET', `/routes/${routeId}/stops`)).data;

  let drivers = 0;
  const assigned = async () => {
    const driver = await h.seedUser(`conductor-${++drivers}`, DRIVER);
    const employeeId = await h.seedEmployee(driver.id);
    const shipmentId = await newShipment();
    const route = await newRoute({ driverEmployeeId: employeeId });
    await h.api('POST', `/shipments/${shipmentId}/dispatch`, { routeId: route.id });
    const [stop] = await stopsOf(route.id);
    return { driver, employeeId, routeId: route.id as string, stopId: stop.id as string, shipmentId };
  };

  describe('permiso propio de conductor', () => {
    test('cada ruta dice cómo va y su ficha trae los bultos a entregar', async () => {
      const { driver, routeId, shipmentId } = await assigned();
      const pkg = await h.api('POST', '/packages', { shipmentId, weightKg: 4 });

      const mine = await h.api('GET', '/my/routes', undefined, driver);
      assert.equal(mine.data[0].stopsTotal, 1);
      assert.equal(mine.data[0].stopsDelivered, 0);

      const detail = await h.api('GET', `/my/routes/${routeId}`, undefined, driver);
      assert.deepEqual(
        detail.data.packages.map((p: any) => [p.id, p.shipmentId, p.code, Number(p.weightKg)]),
        [[pkg.data.id, shipmentId, pkg.data.code, 4]],
      );
    });

    test('ve sus rutas y opera sus paradas', async () => {
      const { driver, routeId, stopId, shipmentId } = await assigned();
      const mine = await h.api('GET', '/my/routes', undefined, driver);
      assert.equal(mine.status, 200);
      assert.deepEqual(
        mine.data.map((r: any) => r.id),
        [routeId],
      );
      assert.equal((await h.api('GET', `/my/routes/${routeId}`, undefined, driver)).status, 200);
      assert.equal(
        (await h.api('POST', `/my/routes/${routeId}/start`, undefined, driver)).status,
        200,
      );
      assert.equal(
        (await h.api('POST', `/my/routes/${routeId}/stops/${stopId}/arrive`, undefined, driver))
          .status,
        200,
      );
      assert.equal(
        (
          await h.api(
            'POST',
            `/my/routes/${routeId}/stops/${stopId}/deliver`,
            { recipientName: 'Ana', recipientDocument: '123' },
            driver,
          )
        ).status,
        200,
      );
      assert.equal((await h.api('GET', `/shipments/${shipmentId}`)).data.status, 'delivered');
    });

    test('no entra en el centro logístico', async () => {
      const { driver, routeId, shipmentId } = await assigned();
      assert.equal((await h.api('GET', '/shipments', undefined, driver)).status, 403);
      assert.equal((await h.api('DELETE', `/routes/${routeId}`, undefined, driver)).status, 403);
      assert.equal(
        (await h.api('POST', `/shipments/${shipmentId}/cancel`, {}, driver)).status,
        403,
      );
    });

    test('no puede tocar la ruta de otro', async () => {
      const a = await assigned();
      const b = await assigned();
      assert.equal(
        (await h.api('GET', `/my/routes/${b.routeId}`, undefined, a.driver)).status,
        404,
      );
      assert.equal(
        (await h.api('POST', `/my/routes/${b.routeId}/start`, undefined, a.driver)).status,
        403,
      );
      assert.equal(
        (
          await h.api(
            'POST',
            `/my/routes/${b.routeId}/stops/${b.stopId}/deliver`,
            { recipientName: 'Otro', recipientDocument: '123' },
            a.driver,
          )
        ).status,
        403,
      );
      assert.equal((await stopsOf(b.routeId))[0].status, 'pending');
    });

    test('la oficina puede cerrar la ruta de un conductor', async () => {
      const { routeId } = await assigned();
      const office = await h.seedUser('oficina-cierra', OFFICE);
      await h.api('POST', `/routes/${routeId}/start`, undefined, office);
      const r = await h.api('POST', `/routes/${routeId}/finish`, undefined, office);
      assert.equal(r.status, 200);
    });

    test('un usuario con rol de conductor entra aunque nadie le haya marcado el permiso', async () => {
      const seeded = await h.seedUser('conductor-rol', {});
      const employeeId = await h.seedEmployee(seeded.id);
      await newRoute({ driverEmployeeId: employeeId });
      const r = await h.api('GET', '/my/routes', undefined, { id: seeded.id, role: 'DRIVER' });
      assert.equal(r.status, 200);
      assert.equal(r.data.length, 1);
    });

    test('quien no tiene ningún permiso no entra', async () => {
      const nobody = await h.seedUser('sin-permiso', {});
      assert.equal((await h.api('GET', '/my/routes', undefined, nobody)).status, 403);
    });

    test('lee un bulto y un acopio para escanearlos', async () => {
      const { driver, shipmentId } = await assigned();
      const pkg = await h.api('POST', '/packages', { shipmentId, weightKg: 4 });
      const scan = await h.api('GET', `/my/packages/${pkg.data.id}`, undefined, driver);
      assert.equal(scan.status, 200);
      assert.equal(scan.data.code, pkg.data.code);
      assert.equal(scan.data.destinationAddress, 'Calle Mayor 1, Madrid');

      const area = await h.api('POST', '/staging-areas', { name: 'Muelle escaneo' });
      const read = await h.api('GET', `/my/staging-areas/${area.data.id}`, undefined, driver);
      assert.equal(read.status, 200);
      assert.equal(read.data.staging.name, 'Muelle escaneo');
    });
  });

  describe('flota', () => {
    const vehicle = async (extra: Record<string, unknown>) =>
      (await h.api('POST', '/vehicles', { plate: `V${Date.now()}${Math.random()}`, ...extra })).data
        .id as string;

    test('un vehículo en mantenimiento no se asigna', async () => {
      const id = await vehicle({ status: 'maintenance' });
      const r = await h.api('POST', '/routes', { plannedDate: '2026-11-04', vehicleId: id });
      assert.equal(r.status, 409);
      const route = await newRoute();
      assert.equal((await h.api('PATCH', `/routes/${route.id}`, { vehicleId: id })).status, 409);
    });

    test('pasarse de capacidad avisa, no bloquea', async () => {
      const id = await vehicle({ capacityKg: 10 });
      const route = await newRoute({ vehicleId: id });
      const shipmentId = await newShipment();
      await h.api('POST', '/packages', { shipmentId, weightKg: 500 });
      const r = await h.api('POST', `/shipments/${shipmentId}/dispatch`, { routeId: route.id });
      assert.equal(r.status, 200);
      assert.deepEqual(r.data.warnings, [{ kind: 'over_capacity', loadKg: 500, capacityKg: 10 }]);

      const listed = (await h.api('GET', '/routes')).data.find((x: any) => x.id === route.id);
      assert.equal(listed.loadKg, 500);
      assert.equal(listed.capacityKg, 10);
    });

    test('un conductor con dos rutas el mismo día avisa', async () => {
      const { employeeId } = await assigned();
      const r = await h.api('POST', '/routes', {
        plannedDate: '2026-11-04',
        driverEmployeeId: employeeId,
      });
      assert.equal(r.status, 200);
      assert.equal(r.data.warnings[0].kind, 'driver_busy');
      assert.equal(r.data.warnings[0].routes.length, 1);
    });
  });

  describe('horas y ventanas', () => {
    test('al salir, cada parada recibe su hora y el cliente la ve', async () => {
      const a = await newShipment({ destinationLat: 40.0, destinationLng: -3.0 });
      const b = await newShipment({ destinationLat: 40.5, destinationLng: -3.0 });
      const route = await newRoute();
      await h.api('POST', `/shipments/${a}/dispatch`, { routeId: route.id });
      await h.api('POST', `/shipments/${b}/dispatch`, { routeId: route.id });
      await h.api('POST', `/routes/${route.id}/start`);

      const stops = await stopsOf(route.id);
      assert.ok(stops[0].plannedAt);
      assert.ok(new Date(stops[1].plannedAt) > new Date(stops[0].plannedAt));
      const shipment = (await h.api('GET', `/shipments/${b}`)).data;
      assert.equal(
        new Date(shipment.estimatedDelivery).getTime(),
        new Date(stops[1].plannedAt).getTime(),
      );
    });

    test('una fecha prevista puesta a mano no se pisa', async () => {
      const promised = '2026-12-01T10:00:00.000Z';
      const a = await newShipment({
        destinationLat: 40,
        destinationLng: -3,
        estimatedDelivery: promised,
      });
      const route = await newRoute();
      await h.api('POST', `/shipments/${a}/dispatch`, { routeId: route.id });
      await h.api('POST', `/routes/${route.id}/start`);
      const shipment = (await h.api('GET', `/shipments/${a}`)).data;
      assert.equal(new Date(shipment.estimatedDelivery).toISOString(), promised);
    });

    test('la ventana horaria se guarda y se valida', async () => {
      const a = await newShipment({ timeWindowFrom: '09:00', timeWindowTo: '14:00' });
      const shipment = (await h.api('GET', `/shipments/${a}`)).data;
      assert.equal(shipment.timeWindowFrom, '09:00');
      assert.equal(shipment.timeWindowTo, '14:00');
      const bad = await h.api('PATCH', `/shipments/${a}`, { timeWindowFrom: '25:99' });
      assert.equal(bad.status, 400);
    });
  });
});
