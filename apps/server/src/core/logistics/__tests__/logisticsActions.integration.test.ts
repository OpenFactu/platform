/**
 * Las acciones de reparto: una llamada, una transacción, y el envío, la parada,
 * la ruta y los paquetes siempre de acuerdo.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startLogisticsHarness, testDatabaseUrl, type LogisticsHarness } from './logisticsHarness';

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
  return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

describe('acciones de logística', { skip: !testDatabaseUrl }, () => {
  let h: LogisticsHarness;

  before(async () => {
    h = await startLogisticsHarness();
  });
  after(async () => {
    await h?.close();
  });

  const shipmentOf = async (id: string) => (await h.api('GET', `/shipments/${id}`)).data;
  const stopsOf = async (routeId: string) => (await h.api('GET', `/routes/${routeId}/stops`)).data;
  const routeOf = async (routeId: string) =>
    (await h.api('GET', '/routes')).data.find((r: any) => r.id === routeId);
  let routes = 0;
  const newRoute = async () => {
    const code = `ACC-${++routes}`;
    return (await h.api('POST', '/routes', { code, name: code, plannedDate: '2026-11-04' })).data
      .id as string;
  };
  const newShipment = async () =>
    (await h.api('POST', '/shipments', { destinationAddress: 'Calle Mayor 1, Madrid' })).data
      .id as string;
  const dispatched = async () => {
    const id = await newShipment();
    const routeId = await newRoute();
    assert.equal((await h.api('POST', `/shipments/${id}/dispatch`, { routeId })).status, 200);
    const [stop] = await stopsOf(routeId);
    return { id, routeId, stopId: stop.id as string };
  };
  const onTheRoad = async () => {
    const r = await dispatched();
    assert.equal((await h.api('POST', `/routes/${r.routeId}/start`)).status, 200);
    return r;
  };
  const eventsOf = async (id: string) =>
    (await h.api('GET', `/shipments/${id}/events`)).data as any[];

  describe('reglas de estado', () => {
    test('el estado no se cambia con un PATCH', async () => {
      const id = await newShipment();
      const r = await h.api('PATCH', `/shipments/${id}`, { status: 'delivered' });
      assert.equal(r.status, 400);
      assert.equal((await shipmentOf(id)).status, 'pending');
    });

    test('un PATCH de datos sigue funcionando', async () => {
      const id = await newShipment();
      const r = await h.api('PATCH', `/shipments/${id}`, { notes: 'Llamar antes', destinationLat: 40 });
      assert.equal(r.status, 200);
      const s = await shipmentOf(id);
      assert.equal(s.notes, 'Llamar antes');
      assert.equal(s.destinationLat, 40);
    });

    test('no se entrega de golpe un envío sin despachar', async () => {
      const id = await newShipment();
      assert.equal((await h.api('POST', `/shipments/${id}/deliver`)).status, 409);
      assert.equal((await shipmentOf(id)).status, 'pending');
    });

    test('un entregado no vuelve a listo', async () => {
      const { id, routeId, stopId } = await onTheRoad();
      await h.api('POST', `/routes/${routeId}/stops/${stopId}/deliver`, { recipientName: 'Ana' });
      assert.equal((await h.api('POST', `/shipments/${id}/ready`)).status, 409);
      assert.equal((await shipmentOf(id)).status, 'delivered');
    });

    test('una salida no se recibe', async () => {
      const id = await newShipment();
      assert.equal((await h.api('POST', `/shipments/${id}/receive`)).status, 409);
    });

    test('las dos columnas van siempre iguales', async () => {
      const id = await newShipment();
      const check = async () => {
        const s = await shipmentOf(id);
        assert.equal(s.preparationStatus, s.status);
      };
      await check();
      await h.api('POST', `/shipments/${id}/ready`);
      await check();
      const routeId = await newRoute();
      await h.api('POST', `/shipments/${id}/dispatch`, { routeId });
      await check();
      await h.api('POST', `/routes/${routeId}/start`);
      await check();
    });

    test('el estado de una ruta tampoco se cambia con un PATCH', async () => {
      const routeId = await newRoute();
      await h.api('PATCH', `/routes/${routeId}`, { status: 'completed', notes: 'Con cuidado' });
      const route = await routeOf(routeId);
      assert.equal(route.status, 'planned');
      assert.equal(route.notes, 'Con cuidado');
    });
  });

  describe('entregar', () => {
    test('una sola llamada deja parada, envío, ruta y paquetes de acuerdo', async () => {
      const { id, routeId, stopId } = await dispatched();
      await h.api('POST', '/packages', { code: `P-${id.slice(0, 6)}`, shipmentId: id });
      await h.api('POST', `/routes/${routeId}/start`);

      const r = await h.api('POST', `/routes/${routeId}/stops/${stopId}/deliver`, {
        recipientName: 'Ana',
        recipientDocument: '123',
        signatureImage: 'data:image/png;base64,AAAA',
        photoImage: null,
        podNotes: 'En portería',
      });
      assert.equal(r.status, 200);

      const shipment = await shipmentOf(id);
      assert.equal(shipment.status, 'delivered');
      assert.ok(shipment.deliveredAt);
      const [stop] = await stopsOf(routeId);
      assert.equal(stop.status, 'delivered');
      assert.equal(stop.recipientName, 'Ana');
      assert.equal(stop.podNotes, 'En portería');
      assert.ok(stop.departedAt);
      assert.equal((await routeOf(routeId)).status, 'completed');
      const [pkg] = await h.query(`SELECT status FROM "Package" WHERE "shipmentId" = '${id}'`);
      assert.equal(pkg.status, 'delivered');
    });

    test('si el móvil repite la llamada no pasa nada dos veces', async () => {
      const { id, routeId, stopId } = await onTheRoad();
      const url = `/routes/${routeId}/stops/${stopId}/deliver`;
      assert.equal((await h.api('POST', url, { recipientName: 'Ana' })).status, 200);
      const before = (await eventsOf(id)).length;
      const again = await h.api('POST', url, { recipientName: 'Otro' });
      assert.equal(again.status, 200);
      assert.equal(again.data.already, true);
      assert.equal((await eventsOf(id)).length, before);
      assert.equal((await stopsOf(routeId))[0].recipientName, 'Ana');
    });

    test('si el envío no se puede entregar, la parada no cambia', async () => {
      const { id, routeId, stopId } = await onTheRoad();
      await h.query(
        `UPDATE "Shipment" SET status = 'cancelled', "preparationStatus" = 'cancelled' WHERE id = '${id}'`,
      );
      const r = await h.api('POST', `/routes/${routeId}/stops/${stopId}/deliver`, {
        recipientName: 'Ana',
      });
      assert.equal(r.status, 409);
      const [stop] = await stopsOf(routeId);
      assert.equal(stop.status, 'en_route');
      assert.equal(stop.recipientName, null);
    });

    test('entregar desde la oficina cierra su parada', async () => {
      const { id, routeId } = await onTheRoad();
      assert.equal((await h.api('POST', `/shipments/${id}/deliver`)).status, 200);
      assert.equal((await stopsOf(routeId))[0].status, 'delivered');
      assert.equal((await routeOf(routeId)).status, 'completed');
    });

    test('llegar a la parada deja el envío en reparto', async () => {
      const { id, routeId, stopId } = await dispatched();
      const r = await h.api('POST', `/routes/${routeId}/stops/${stopId}/arrive`);
      assert.equal(r.status, 200);
      const [stop] = await stopsOf(routeId);
      assert.equal(stop.status, 'arrived');
      assert.ok(stop.arrivedAt);
      assert.equal((await shipmentOf(id)).status, 'out_for_delivery');
      // Llegar a una parada sin haber pulsado "Iniciar" pone la ruta en marcha.
      assert.equal((await routeOf(routeId)).status, 'active');
    });
  });

  describe('aplazar y reintentar', () => {
    const postponed = async () => {
      const r = await onTheRoad();
      const out = await h.api('POST', `/routes/${r.routeId}/stops/${r.stopId}/postpone`, {
        reason: 'No había nadie',
      });
      assert.equal(out.status, 200);
      return r;
    };

    test('aplazar guarda el motivo y cierra la ruta si no queda nada', async () => {
      const { id, routeId } = await postponed();
      assert.equal((await shipmentOf(id)).status, 'postponed');
      const [stop] = await stopsOf(routeId);
      assert.equal(stop.status, 'postponed');
      assert.equal(stop.podNotes, 'No había nadie');
      assert.equal((await routeOf(routeId)).status, 'completed');
      const seen = (await eventsOf(id)).find((e) => e.status === 'postponed');
      assert.equal(seen.description, 'No había nadie');
    });

    test('un aplazado vuelve a salir en "sin ruta"', async () => {
      const { id } = await postponed();
      const list = (await h.api('GET', '/shipments/unrouted')).data.map((s: any) => s.id);
      assert.ok(list.includes(id));
    });

    test('un envío en una ruta no sale en "sin ruta"', async () => {
      const { id } = await dispatched();
      const list = (await h.api('GET', '/shipments/unrouted')).data.map((s: any) => s.id);
      assert.ok(!list.includes(id));
    });

    test('reintentar crea una parada nueva y deja la antigua como historia', async () => {
      const { id, routeId: oldRoute } = await postponed();
      const retry = await newRoute();
      assert.equal((await h.api('POST', `/shipments/${id}/dispatch`, { routeId: retry })).status, 200);

      assert.equal((await shipmentOf(id)).status, 'dispatched');
      assert.equal((await stopsOf(oldRoute))[0].status, 'postponed');
      const [fresh] = await stopsOf(retry);
      assert.equal(fresh.status, 'pending');
      assert.equal(fresh.shipmentId, id);

      await h.api('POST', `/routes/${retry}/start`);
      assert.equal((await stopsOf(retry))[0].status, 'en_route');
      assert.equal((await shipmentOf(id)).status, 'out_for_delivery');
      const [stop] = await stopsOf(retry);
      await h.api('POST', `/routes/${retry}/stops/${stop.id}/deliver`, { recipientName: 'Ana' });
      assert.equal((await shipmentOf(id)).status, 'delivered');
      assert.equal((await routeOf(retry)).status, 'completed');
    });

    test('reintentar en una ruta ya en marcha sale al momento', async () => {
      const { id } = await postponed();
      const { routeId: running } = await onTheRoad();
      const [first] = await stopsOf(running);
      await h.api('POST', `/routes/${running}/stops/${first.id}/deliver`, { recipientName: 'Ana' });
      // La ruta sigue abierta solo si tiene más paradas: usamos otra con dos.
      const a = await newShipment();
      const b = await newShipment();
      const open = await newRoute();
      await h.api('POST', `/shipments/${a}/dispatch`, { routeId: open });
      await h.api('POST', `/shipments/${b}/dispatch`, { routeId: open });
      await h.api('POST', `/routes/${open}/start`);

      assert.equal((await h.api('POST', `/shipments/${id}/dispatch`, { routeId: open })).status, 200);
      assert.equal((await shipmentOf(id)).status, 'in_transit');
      const stops = await stopsOf(open);
      assert.equal(stops[stops.length - 1].shipmentId, id);
      assert.equal(stops[stops.length - 1].status, 'pending');
    });

    test('una ruta terminada no admite más paradas', async () => {
      const { id, routeId } = await postponed();
      assert.equal((await h.api('POST', `/shipments/${id}/dispatch`, { routeId })).status, 409);
    });

    test('despachar dos veces a la misma ruta no duplica la parada ni el aviso', async () => {
      const { id, routeId } = await dispatched();
      const before = (await eventsOf(id)).length;
      assert.equal((await h.api('POST', `/shipments/${id}/dispatch`, { routeId })).status, 200);
      assert.equal((await stopsOf(routeId)).length, 1);
      assert.equal((await eventsOf(id)).length, before);
    });

    test('despachar a otra ruta mueve la parada si aún no ha salido', async () => {
      const { id, routeId } = await dispatched();
      const other = await newRoute();
      assert.equal((await h.api('POST', `/shipments/${id}/dispatch`, { routeId: other })).status, 200);
      assert.equal((await stopsOf(routeId)).length, 0);
      assert.equal((await stopsOf(other)).length, 1);
    });

    test('lo que ya ha salido no se mueve de ruta', async () => {
      const { id } = await onTheRoad();
      const other = await newRoute();
      assert.equal((await h.api('POST', `/shipments/${id}/dispatch`, { routeId: other })).status, 409);
    });

    test('quitar la parada devuelve el envío a listo', async () => {
      const { id, routeId, stopId } = await dispatched();
      assert.equal((await h.api('DELETE', `/routes/${routeId}/stops/${stopId}`)).status, 200);
      assert.equal((await shipmentOf(id)).status, 'ready');
    });

    test('borrar una ruta planificada devuelve sus envíos a listo', async () => {
      const { id, routeId } = await dispatched();
      const r = await h.api('DELETE', `/routes/${routeId}`);
      assert.equal(r.data.archived, false);
      assert.equal((await shipmentOf(id)).status, 'ready');
      const list = (await h.api('GET', '/shipments/unrouted')).data.map((s: any) => s.id);
      assert.ok(list.includes(id));
    });
  });

  describe('incidencias', () => {
    test('en la parada: motivo obligatorio, envío en incidencia y parada cerrada', async () => {
      const { id, routeId, stopId } = await onTheRoad();
      const url = `/routes/${routeId}/stops/${stopId}/incident`;
      assert.equal((await h.api('POST', url, { reason: '  ' })).status, 400);
      assert.equal((await h.api('POST', url, { reason: 'Caja rota' })).status, 200);
      assert.equal((await shipmentOf(id)).status, 'exception');
      const [stop] = await stopsOf(routeId);
      assert.equal(stop.status, 'exception');
      assert.equal(stop.podNotes, 'Caja rota');
    });

    test('resolverla sin parada viva lo deja listo para volver a salir', async () => {
      const { id, routeId, stopId } = await onTheRoad();
      await h.api('POST', `/routes/${routeId}/stops/${stopId}/incident`, { reason: 'Caja rota' });
      const r = await h.api('POST', `/shipments/${id}/resolve`);
      assert.equal(r.status, 200);
      assert.equal((await shipmentOf(id)).status, 'ready');
      const list = (await h.api('GET', '/shipments/unrouted')).data.map((s: any) => s.id);
      assert.ok(list.includes(id));
    });

    test('desde la oficina, con su parada viva, vuelve al reparto al resolverla', async () => {
      const { id, routeId } = await onTheRoad();
      assert.equal(
        (await h.api('POST', `/shipments/${id}/incident`, { reason: 'Llamó el cliente' })).status,
        200,
      );
      assert.equal((await shipmentOf(id)).status, 'exception');
      assert.equal((await stopsOf(routeId))[0].status, 'en_route');
      await h.api('POST', `/shipments/${id}/resolve`);
      assert.equal((await shipmentOf(id)).status, 'out_for_delivery');
    });

    test('un entregado no pasa a incidencia: se devuelve o se recoge', async () => {
      const { id, routeId, stopId } = await onTheRoad();
      await h.api('POST', `/routes/${routeId}/stops/${stopId}/deliver`, { recipientName: 'Ana' });
      assert.equal((await h.api('POST', `/shipments/${id}/incident`, { reason: 'Mal' })).status, 409);
    });

    test('solo se resuelve lo que está en incidencia', async () => {
      const id = await newShipment();
      assert.equal((await h.api('POST', `/shipments/${id}/resolve`)).status, 409);
    });
  });

  describe('los paquetes siguen a su envío', () => {
    test('salen, vuelven y se devuelven', async () => {
      const { id, routeId } = await dispatched();
      const created = await h.api('POST', '/packages', {
        code: `PK-${id.slice(0, 6)}`,
        shipmentId: id,
        status: 'sealed',
      });
      const statusOf = async () =>
        (await h.query(`SELECT status FROM "Package" WHERE id = '${created.data.id}'`))[0].status;

      assert.equal(await statusOf(), 'sealed');
      await h.api('POST', `/routes/${routeId}/start`);
      assert.equal(await statusOf(), 'shipped');
      await h.api('POST', `/routes/${routeId}/finish`);
      assert.equal((await shipmentOf(id)).status, 'postponed');
      assert.equal(await statusOf(), 'sealed');
      await h.api('POST', `/shipments/${id}/return`, { reason: 'Rechazado' });
      assert.equal(await statusOf(), 'returned');
    });
  });

  describe('devoluciones y recogidas', () => {
    test('lo que no ha salido no se devuelve: se cancela', async () => {
      const id = await newShipment();
      assert.equal((await h.api('POST', `/shipments/${id}/return`)).status, 409);
    });

    test('la recogida crea la recepción con las líneas del albarán', async () => {
      const note = await h.seedDeliveryNote('SDN', 2);
      const { shipmentId } = (await h.api('POST', `/prep/from-sdn/${note.id}`)).data;
      const pickup = await h.api('POST', `/shipments/${shipmentId}/schedule-pickup`, {
        warehouseId: note.warehouseId,
      });
      const routeId = await newRoute();
      await h.api('POST', `/shipments/${pickup.data.id}/dispatch`, { routeId });
      await h.api('POST', `/routes/${routeId}/start`);
      const [stop] = await stopsOf(routeId);
      await h.api('POST', `/routes/${routeId}/stops/${stop.id}/deliver`, { recipientName: 'Ana' });

      const [receipt] = await h.query(
        `SELECT id FROM "GoodsReceipt" WHERE "warehouseId" = '${note.warehouseId}'`,
      );
      const lines = await h.query(
        `SELECT "itemId", quantity FROM "GoodsReceiptLine" WHERE "receiptId" = '${receipt.id}' ORDER BY "lineNum"`,
      );
      assert.deepEqual(
        lines.map((l) => [l.itemId, Number(l.quantity)]),
        note.itemIds.map((itemId) => [itemId, 3]),
      );
    });
  });

  describe('migración a un solo estado', () => {
    test('unifica las dos columnas sin cambiar lo que ve el cliente', async () => {
      const file = path.join(__dirname, '../../tenant/migrations/085_shipment_single_state.sql');
      const fixtures: Array<[string, string, string]> = [
        ['draft', 'pending', 'pending'],
        ['picking', 'pending', 'picking'],
        ['ready', 'delivered', 'delivered'],
        ['received', 'pending', 'received'],
        ['received', 'delivered', 'received'],
        ['receiving', 'delivered', 'received'],
        ['returned', 'delivered', 'returned'],
        ['in_transit', 'exception', 'exception'],
        ['draft', 'patata', 'pending'],
      ];
      const ids: string[] = [];
      for (const [prep, status] of fixtures) {
        const id = await newShipment();
        ids.push(id);
        await h.query(
          `UPDATE "Shipment" SET status = '${status}', "preparationStatus" = '${prep}' WHERE id = '${id}'`,
        );
      }
      const sql = fs.readFileSync(file, 'utf8');
      await h.query(sql);
      for (let i = 0; i < ids.length; i++) {
        const s = await shipmentOf(ids[i]);
        assert.equal(s.status, fixtures[i][2], JSON.stringify(fixtures[i]));
        assert.equal(s.preparationStatus, fixtures[i][2], JSON.stringify(fixtures[i]));
      }
      // Se puede repetir sin efectos.
      await h.query(sql);
      assert.equal((await shipmentOf(ids[0])).status, 'pending');
    });
  });
});
