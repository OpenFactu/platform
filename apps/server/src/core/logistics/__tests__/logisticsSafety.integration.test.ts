/**
 * Lo que no puede volver a pasar: falsear la posición con el enlace del
 * cliente, perder una prueba de entrega al borrar, u operar la ruta de otro.
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

const LOGISTICS = { '/logistics': { read: true, write: true, delete: true } };

describe('seguridad de logística', { skip: !testDatabaseUrl }, () => {
  let h: LogisticsHarness;

  before(async () => {
    h = await startLogisticsHarness();
  });
  after(async () => {
    await h?.close();
  });

  const newShipment = async () =>
    (await h.api('POST', '/shipments', { destinationAddress: 'Calle Mayor 1, Madrid' })).data as {
      id: string;
      reportToken: string;
      trackerToken: string;
    };
  let routeCount = 0;
  const newRoute = async (extra: Record<string, unknown> = {}) => {
    const code = `SEG-${++routeCount}`;
    const r = await h.api('POST', '/routes', {
      code,
      name: code,
      plannedDate: '2026-11-04',
      ...extra,
    });
    return r.data.id as string;
  };
  const stopsOf = async (routeId: string) => (await h.api('GET', `/routes/${routeId}/stops`)).data;
  const position = { lat: 40.4, lng: -3.7 };

  /** Una ruta terminada con su prueba de entrega. */
  const completedRoute = async () => {
    const shipment = await newShipment();
    const routeId = await newRoute();
    await h.api('POST', `/shipments/${shipment.id}/dispatch`, { routeId });
    await h.api('POST', `/routes/${routeId}/start`);
    const [stop] = await stopsOf(routeId);
    await h.api('POST', `/routes/${routeId}/stops/${stop.id}/deliver`, {
      recipientName: 'Ana',
      signatureImage: 'data:image/png;base64,AAAA',
    });
    return { routeId, stopId: stop.id as string, shipment };
  };

  describe('enlace del cliente y dispositivo del conductor', () => {
    test('el enlace del cliente no sirve para enviar la posición', async () => {
      const s = await newShipment();
      const r = await h.api('POST', `/track/${s.reportToken}/position`, position, null);
      assert.equal(r.status, 404);
      const track = await h.api('GET', `/track/${s.reportToken}`, undefined, null);
      assert.equal(track.data.lastPosition, null);
    });

    test('el token del dispositivo sí, y el cliente lo ve en su enlace', async () => {
      const s = await newShipment();
      assert.ok(s.trackerToken);
      assert.notEqual(s.trackerToken, s.reportToken);
      const r = await h.api('POST', `/track/${s.trackerToken}/position`, position, null);
      assert.equal(r.status, 200);
      const track = await h.api('GET', `/track/${s.reportToken}`, undefined, null);
      assert.equal(track.data.lastPosition.lat, position.lat);
    });

    test('el token del dispositivo no abre la página de seguimiento', async () => {
      const s = await newShipment();
      assert.equal((await h.api('GET', `/track/${s.trackerToken}`)).status, 404);
    });

    test('la página pública no enseña ningún token', async () => {
      const s = await newShipment();
      const track = await h.api('GET', `/track/${s.reportToken}`);
      const raw = JSON.stringify(track.data);
      assert.ok(!raw.includes(s.reportToken));
      assert.ok(!raw.includes(s.trackerToken));
    });

    test('una posición imposible se rechaza', async () => {
      const s = await newShipment();
      const r = await h.api('POST', `/track/${s.trackerToken}/position`, { lat: 400, lng: 0 });
      assert.equal(r.status, 400);
    });

    test('un envío terminado ya no acepta posiciones', async () => {
      const { shipment } = await completedRoute();
      const r = await h.api('POST', `/track/${shipment.trackerToken}/position`, position);
      assert.equal(r.status, 409);
    });

    test('los tokens quedan en el índice común, sin recorrer empresas', async () => {
      const s = await newShipment();
      const rows = await h.query(
        `SELECT kind, "tenantId", "shipmentId" FROM public."ShipmentToken" WHERE token IN ('${s.reportToken}', '${s.trackerToken}') ORDER BY kind`,
      );
      assert.deepEqual(
        rows.map((r) => r.kind),
        ['report', 'tracker'],
      );
      assert.ok(rows.every((r) => r.tenantId === h.tenantId && r.shipmentId === s.id));
    });

    test('el arranque indexa los envíos que no estaban en el índice', async () => {
      const { backfillShipmentTokens } = await import('../shipmentTokens');
      const s = await newShipment();
      await h.query(`DELETE FROM public."ShipmentToken" WHERE "shipmentId" = '${s.id}'`);
      assert.equal((await h.api('GET', `/track/${s.reportToken}`)).status, 404);
      await backfillShipmentTokens();
      assert.equal((await h.api('GET', `/track/${s.reportToken}`)).status, 200);
    });
  });

  describe('borrar no pierde historia', () => {
    test('borrar una ruta completada la archiva y conserva la firma', async () => {
      const { routeId, stopId } = await completedRoute();
      const r = await h.api('DELETE', `/routes/${routeId}`);
      assert.equal(r.status, 200);
      assert.equal(r.data.archived, true);

      const [stop] = await h.query(
        `SELECT "signatureImage", "recipientName" FROM "RouteStop" WHERE id = '${stopId}'`,
      );
      assert.equal(stop.recipientName, 'Ana');
      assert.ok(stop.signatureImage);

      const visible = (await h.api('GET', '/routes')).data.map((x: any) => x.id);
      assert.ok(!visible.includes(routeId));
      const all = (await h.api('GET', '/routes?includeArchived=true')).data.map((x: any) => x.id);
      assert.ok(all.includes(routeId));

      assert.equal((await h.api('POST', `/routes/${routeId}/restore`)).status, 200);
      const back = (await h.api('GET', '/routes')).data.map((x: any) => x.id);
      assert.ok(back.includes(routeId));
    });

    test('una ruta activa no se borra', async () => {
      const shipment = await newShipment();
      const routeId = await newRoute();
      await h.api('POST', `/shipments/${shipment.id}/dispatch`, { routeId });
      await h.api('POST', `/routes/${routeId}/start`);
      assert.equal((await h.api('DELETE', `/routes/${routeId}`)).status, 409);
    });

    test('una ruta planificada sin actividad sí se borra de verdad', async () => {
      const routeId = await newRoute();
      const r = await h.api('DELETE', `/routes/${routeId}`);
      assert.equal(r.status, 200);
      assert.equal(r.data.archived, false);
      assert.equal((await h.query(`SELECT 1 FROM "Route" WHERE id = '${routeId}'`)).length, 0);
    });

    test('borrar un envío entregado lo archiva con su historial', async () => {
      const { shipment } = await completedRoute();
      const r = await h.api('DELETE', `/shipments/${shipment.id}`);
      assert.equal(r.status, 200);
      assert.equal(r.data.archived, true);

      const events = await h.query(
        `SELECT 1 FROM "ShipmentEvent" WHERE "shipmentId" = '${shipment.id}'`,
      );
      assert.ok(events.length > 0);

      const list = (await h.api('GET', '/shipments')).data.map((x: any) => x.id);
      assert.ok(!list.includes(shipment.id));
      const paged = (await h.api('GET', '/shipments?page=1')).data.rows.map((x: any) => x.id);
      assert.ok(!paged.includes(shipment.id));
      const withArchived = (await h.api('GET', '/shipments?includeArchived=true')).data.rows.map(
        (x: any) => x.id,
      );
      assert.ok(withArchived.includes(shipment.id));

      // La ficha y el enlace del cliente siguen funcionando.
      assert.equal((await h.api('GET', `/shipments/${shipment.id}`)).status, 200);
      assert.equal((await h.api('GET', `/track/${shipment.reportToken}`)).status, 200);

      assert.equal((await h.api('POST', `/shipments/${shipment.id}/restore`)).status, 200);
      const back = (await h.api('GET', '/shipments')).data.map((x: any) => x.id);
      assert.ok(back.includes(shipment.id));
    });

    test('un envío en reparto no se borra: hay que cancelarlo antes', async () => {
      const shipment = await newShipment();
      const routeId = await newRoute();
      await h.api('POST', `/shipments/${shipment.id}/dispatch`, { routeId });
      assert.equal((await h.api('DELETE', `/shipments/${shipment.id}`)).status, 409);
      assert.equal((await h.api('POST', `/shipments/${shipment.id}/cancel`)).status, 200);
      const r = await h.api('DELETE', `/shipments/${shipment.id}`);
      assert.equal(r.data.archived, true);
    });

    test('un envío recién creado y sin actividad se borra de verdad y sin rastro de tokens', async () => {
      const shipment = await newShipment();
      const r = await h.api('DELETE', `/shipments/${shipment.id}`);
      assert.equal(r.status, 200);
      assert.equal(r.data.archived, false);
      assert.equal(
        (await h.query(`SELECT 1 FROM "Shipment" WHERE id = '${shipment.id}'`)).length,
        0,
      );
      const tokens = await h.query(
        `SELECT 1 FROM public."ShipmentToken" WHERE "shipmentId" = '${shipment.id}'`,
      );
      assert.equal(tokens.length, 0);
    });

    test('una parada con entrega no se puede quitar de la ruta', async () => {
      const { routeId, stopId } = await completedRoute();
      assert.equal((await h.api('DELETE', `/routes/${routeId}/stops/${stopId}`)).status, 409);
    });

    test('una parada pendiente sí', async () => {
      const shipment = await newShipment();
      const routeId = await newRoute();
      await h.api('POST', `/shipments/${shipment.id}/dispatch`, { routeId });
      const [stop] = await stopsOf(routeId);
      assert.equal((await h.api('DELETE', `/routes/${routeId}/stops/${stop.id}`)).status, 200);
    });
  });

  describe('quién opera una ruta', () => {
    const assignedRoute = async (name: string) => {
      const driver = await h.seedUser(name, LOGISTICS);
      const employeeId = await h.seedEmployee(driver.id);
      const shipment = await newShipment();
      const routeId = await newRoute({ driverEmployeeId: employeeId });
      await h.api('POST', `/shipments/${shipment.id}/dispatch`, { routeId });
      const [stop] = await stopsOf(routeId);
      return { driver, routeId, stopId: stop.id as string };
    };

    test('el conductor asignado marca sus paradas', async () => {
      const { driver, routeId, stopId } = await assignedRoute('conductor-a');
      assert.equal(
        (await h.api('POST', `/my/routes/${routeId}/start`, undefined, driver)).status,
        200,
      );
      const r = await h.api(
        'POST',
        `/my/routes/${routeId}/stops/${stopId}/arrive`,
        undefined,
        driver,
      );
      assert.equal(r.status, 200);
    });

    test('otro conductor no puede tocar esa ruta', async () => {
      const { routeId, stopId } = await assignedRoute('conductor-b');
      const other = await h.seedUser('conductor-c', LOGISTICS);
      await h.seedEmployee(other.id);

      const patch = await h.api(
        'POST',
        `/my/routes/${routeId}/stops/${stopId}/deliver`,
        { recipientName: 'Otro' },
        other,
      );
      assert.equal(patch.status, 403);
      assert.equal((await stopsOf(routeId))[0].status, 'pending');

      assert.equal(
        (await h.api('POST', `/my/routes/${routeId}/start`, undefined, other)).status,
        403,
      );
      assert.equal(
        (await h.api('POST', `/my/routes/${routeId}/finish`, undefined, other)).status,
        403,
      );
    });

    test('el administrador puede operar cualquier ruta', async () => {
      const { routeId, stopId } = await assignedRoute('conductor-d');
      const r = await h.api('POST', `/routes/${routeId}/stops/${stopId}/arrive`);
      assert.equal(r.status, 200);
    });

    test('una ruta sin conductor la opera quien tenga permiso de logística', async () => {
      const office = await h.seedUser('oficina', LOGISTICS);
      const shipment = await newShipment();
      const routeId = await newRoute();
      await h.api('POST', `/shipments/${shipment.id}/dispatch`, { routeId });
      assert.equal(
        (await h.api('POST', `/routes/${routeId}/start`, undefined, office)).status,
        200,
      );
    });

    test('una parada de otra ruta no se puede marcar por esta', async () => {
      const a = await assignedRoute('conductor-e');
      const b = await assignedRoute('conductor-f');
      const r = await h.api('POST', `/routes/${a.routeId}/stops/${b.stopId}/deliver`, {
        recipientName: 'Ana',
      });
      assert.equal(r.status, 404);
      assert.equal((await stopsOf(b.routeId))[0].status, 'pending');
    });
  });

  describe('reenviar el aviso al cliente', () => {
    test('solo se puede avisar de la etapa en la que está el envío', async () => {
      const shipment = await newShipment();
      const wrong = await h.api('POST', `/shipments/${shipment.id}/notify`, {
        stage: 'delivered',
      });
      assert.equal(wrong.status, 409);
      const ok = await h.api('POST', `/shipments/${shipment.id}/notify`, { stage: 'pending' });
      assert.equal(ok.status, 200);
      assert.equal(ok.data.stage, 'pending');
      const none = await h.api('POST', `/shipments/${shipment.id}/notify`);
      assert.equal(none.data.stage, 'pending');
    });
  });
});
