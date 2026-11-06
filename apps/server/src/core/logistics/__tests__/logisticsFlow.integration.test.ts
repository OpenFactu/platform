/**
 * El reparto de punta a punta contra la API real: lo que tiene que seguir
 * funcionando pase lo que pase por dentro.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startLogisticsHarness, testDatabaseUrl, type LogisticsHarness } from './logisticsHarness';

/** Las pruebas no salen a internet: el geocodificador se queda sin respuesta. */
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
  return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

describe('flujo de logística', { skip: !testDatabaseUrl }, () => {
  let h: LogisticsHarness;

  before(async () => {
    h = await startLogisticsHarness();
  });
  after(async () => {
    await h?.close();
  });

  const shipmentOf = async (id: string) => {
    const r = await h.api('GET', `/shipments/${id}`);
    assert.equal(r.status, 200);
    return r.data;
  };
  const stopsOf = async (routeId: string) => (await h.api('GET', `/routes/${routeId}/stops`)).data;
  const routeOf = async (routeId: string) =>
    (await h.api('GET', '/routes')).data.find((r: any) => r.id === routeId);
  const newRoute = async (code: string) => {
    const r = await h.api('POST', '/routes', { code, name: code, plannedDate: '2026-11-04' });
    assert.equal(r.status, 200);
    return r.data.id as string;
  };
  const newShipment = async (extra: Record<string, unknown> = {}) => {
    const r = await h.api('POST', '/shipments', {
      destinationAddress: 'Calle Mayor 1, Madrid',
      ...extra,
    });
    assert.equal(r.status, 200);
    return r.data as { id: string; reportToken: string };
  };
  const pickAll = async (shipmentId: string) => {
    const tasks = (await h.api('GET', `/prep/tasks?shipmentId=${shipmentId}`)).data;
    for (const task of tasks) {
      const r = await h.api('PATCH', `/prep/tasks/${task.id}`, { pickedQty: task.requestedQty });
      assert.equal(r.status, 200);
    }
    return tasks;
  };
  /** Lo que hace la app del conductor al entregar. */
  const deliver = async (routeId: string, stopId: string) => {
    const r = await h.api('POST', `/routes/${routeId}/stops/${stopId}/deliver`, {
      recipientName: 'Ana',
      signatureImage: 'data:image/png;base64,AAAA',
    });
    assert.equal(r.status, 200);
  };
  const postpone = async (routeId: string, stopId: string) => {
    const r = await h.api('POST', `/routes/${routeId}/stops/${stopId}/postpone`, {
      reason: 'No había nadie',
    });
    assert.equal(r.status, 200);
  };

  test('albarán de venta: preparar, despachar, repartir y entregar', async () => {
    const note = await h.seedDeliveryNote('SDN', 2);

    const started = await h.api('POST', `/prep/from-sdn/${note.id}`);
    assert.equal(started.status, 200);
    const shipmentId = started.data.shipmentId;
    assert.equal(started.data.tasks.length, 2);
    assert.equal((await shipmentOf(shipmentId)).preparationStatus, 'picking');

    // Volver a pulsar "Preparar" no crea otro envío.
    const again = await h.api('POST', `/prep/from-sdn/${note.id}`);
    assert.equal(again.data.shipmentId, shipmentId);
    assert.equal(again.data.reused, true);

    await pickAll(shipmentId);
    assert.equal((await shipmentOf(shipmentId)).preparationStatus, 'packed');

    assert.equal((await h.api('POST', `/shipments/${shipmentId}/ready`)).status, 200);
    assert.equal((await shipmentOf(shipmentId)).preparationStatus, 'ready');

    const routeId = await newRoute('FLUJO-1');
    const dispatched = await h.api('POST', `/shipments/${shipmentId}/dispatch`, { routeId });
    assert.equal(dispatched.status, 200);
    let shipment = await shipmentOf(shipmentId);
    assert.equal(shipment.preparationStatus, 'dispatched');
    assert.equal(shipment.status, 'dispatched');
    assert.ok(shipment.dispatchedAt);

    let stops = await stopsOf(routeId);
    assert.equal(stops.length, 1);
    assert.equal(stops[0].shipmentId, shipmentId);

    assert.equal((await h.api('POST', `/routes/${routeId}/start`)).status, 200);
    assert.equal((await routeOf(routeId)).status, 'active');
    stops = await stopsOf(routeId);
    assert.equal(stops[0].status, 'en_route');
    assert.equal((await shipmentOf(shipmentId)).status, 'out_for_delivery');

    await deliver(routeId, stops[0].id);
    shipment = await shipmentOf(shipmentId);
    assert.equal(shipment.status, 'delivered');
    assert.equal(shipment.preparationStatus, 'delivered');
    assert.ok(shipment.deliveredAt);

    // Era la única parada: la ruta se cierra sola y la prueba de entrega queda guardada.
    assert.equal((await routeOf(routeId)).status, 'completed');
    stops = await stopsOf(routeId);
    assert.equal(stops[0].status, 'delivered');
    assert.equal(stops[0].recipientName, 'Ana');
    assert.ok(stops[0].signatureImage);

    const events = (await h.api('GET', `/shipments/${shipmentId}/events`)).data;
    const seen = events.map((e: any) => e.status);
    for (const stage of ['picking', 'packed', 'ready', 'dispatched', 'delivered']) {
      assert.ok(seen.includes(stage), `falta el evento ${stage}: ${seen.join(', ')}`);
    }
  });

  test('una parada terminada hace avanzar la siguiente', async () => {
    const a = await newShipment();
    const b = await newShipment();
    const routeId = await newRoute('FLUJO-2');
    await h.api('POST', `/shipments/${a.id}/dispatch`, { routeId });
    await h.api('POST', `/shipments/${b.id}/dispatch`, { routeId });
    await h.api('POST', `/routes/${routeId}/start`);

    let stops = await stopsOf(routeId);
    assert.deepEqual(
      stops.map((s: any) => s.status),
      ['en_route', 'pending'],
    );
    assert.equal((await shipmentOf(a.id)).status, 'out_for_delivery');
    assert.equal((await shipmentOf(b.id)).status, 'in_transit');

    await deliver(routeId, stops[0].id);
    stops = await stopsOf(routeId);
    assert.equal(stops[1].status, 'en_route');
    assert.equal((await shipmentOf(b.id)).status, 'out_for_delivery');
    assert.equal((await routeOf(routeId)).status, 'active');
  });

  test('aplazar en la parada deja el envío aplazado', async () => {
    const a = await newShipment();
    const routeId = await newRoute('FLUJO-3');
    await h.api('POST', `/shipments/${a.id}/dispatch`, { routeId });
    await h.api('POST', `/routes/${routeId}/start`);
    const stops = await stopsOf(routeId);

    await postpone(routeId, stops[0].id);

    const shipment = await shipmentOf(a.id);
    assert.equal(shipment.status, 'postponed');
    assert.equal((await stopsOf(routeId))[0].status, 'postponed');
    assert.equal((await routeOf(routeId)).status, 'completed');
  });

  test('finalizar la ruta aplaza lo que quedaba sin entregar', async () => {
    const a = await newShipment();
    const b = await newShipment();
    const routeId = await newRoute('FLUJO-4');
    await h.api('POST', `/shipments/${a.id}/dispatch`, { routeId });
    await h.api('POST', `/shipments/${b.id}/dispatch`, { routeId });
    await h.api('POST', `/routes/${routeId}/start`);
    const stops = await stopsOf(routeId);
    await deliver(routeId, stops[0].id);

    const finished = await h.api('POST', `/routes/${routeId}/finish`);
    assert.equal(finished.status, 200);
    assert.equal(finished.data.postponedStops, 1);

    assert.equal((await shipmentOf(a.id)).status, 'delivered');
    assert.equal((await shipmentOf(b.id)).status, 'postponed');
    assert.equal((await routeOf(routeId)).status, 'completed');
  });

  test('cancelar un envío cierra su parada y no toca un albarán si no se pide', async () => {
    const note = await h.seedDeliveryNote('SDN', 1);
    const { shipmentId } = (await h.api('POST', `/prep/from-sdn/${note.id}`)).data;
    await pickAll(shipmentId);
    const routeId = await newRoute('FLUJO-5');
    await h.api('POST', `/shipments/${shipmentId}/dispatch`, { routeId });

    const cancelled = await h.api('POST', `/shipments/${shipmentId}/cancel`, { reason: 'Error' });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.data.deliveryNoteCancelled, false);

    const shipment = await shipmentOf(shipmentId);
    assert.equal(shipment.status, 'cancelled');
    assert.equal(shipment.preparationStatus, 'cancelled');
    assert.equal((await stopsOf(routeId))[0].status, 'cancelled');

    // Un envío cancelado deja preparar otro desde el mismo albarán.
    const redo = await h.api('POST', `/prep/from-sdn/${note.id}`);
    assert.notEqual(redo.data.shipmentId, shipmentId);
    assert.equal(redo.data.reused, undefined);
  });

  test('un envío entregado no se cancela', async () => {
    const a = await newShipment();
    const routeId = await newRoute('FLUJO-E');
    await h.api('POST', `/shipments/${a.id}/dispatch`, { routeId });
    await h.api('POST', `/routes/${routeId}/start`);
    await deliver(routeId, (await stopsOf(routeId))[0].id);
    assert.equal((await h.api('POST', `/shipments/${a.id}/cancel`)).status, 409);
  });

  test('devolver un envío crea la recepción con las líneas del albarán', async () => {
    const note = await h.seedDeliveryNote('SDN', 2);
    const { shipmentId } = (await h.api('POST', `/prep/from-sdn/${note.id}`)).data;
    await pickAll(shipmentId);
    const routeId = await newRoute('FLUJO-6');
    await h.api('POST', `/shipments/${shipmentId}/dispatch`, { routeId });
    await h.api('POST', `/routes/${routeId}/start`);
    const stops = await stopsOf(routeId);
    await deliver(routeId, stops[0].id);

    const returned = await h.api('POST', `/shipments/${shipmentId}/return`, {
      reason: 'Rechazado',
    });
    assert.equal(returned.status, 200);
    assert.ok(returned.data.receiptId);
    assert.equal((await shipmentOf(shipmentId)).status, 'returned');

    const lines = await h.query(
      `SELECT "itemId", quantity FROM "GoodsReceiptLine" WHERE "receiptId" = '${returned.data.receiptId}' ORDER BY "lineNum"`,
    );
    assert.deepEqual(
      lines.map((l) => [l.itemId, Number(l.quantity)]),
      note.itemIds.map((itemId) => [itemId, 3]),
    );
  });

  test('programar una recogida crea un envío aparte, sin duplicarlo', async () => {
    const note = await h.seedDeliveryNote('SDN', 1);
    const { shipmentId } = (await h.api('POST', `/prep/from-sdn/${note.id}`)).data;

    const pickup = await h.api('POST', `/shipments/${shipmentId}/schedule-pickup`, {
      warehouseId: note.warehouseId,
      reason: 'Producto dañado',
    });
    assert.equal(pickup.status, 200);
    const created = await shipmentOf(pickup.data.id);
    assert.equal(created.kind, 'pickup_return');
    assert.equal(created.returnWarehouseId, note.warehouseId);
    assert.equal(created.deliveryNoteId, note.id);

    const twice = await h.api('POST', `/shipments/${shipmentId}/schedule-pickup`, {
      warehouseId: note.warehouseId,
    });
    assert.equal(twice.status, 409);
    assert.equal(twice.data.pickupId, pickup.data.id);

    const routeId = await newRoute('FLUJO-7');
    await h.api('POST', `/shipments/${pickup.data.id}/dispatch`, { routeId });
    await h.api('POST', `/routes/${routeId}/start`);
    const stops = await stopsOf(routeId);
    await deliver(routeId, stops[0].id);

    const receipts = await h.query(
      `SELECT type, status, "warehouseId" FROM "GoodsReceipt" WHERE "warehouseId" = '${note.warehouseId}'`,
    );
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].type, 'return');
    assert.equal(receipts[0].status, 'draft');
  });

  test('albarán de compra: recibir', async () => {
    const note = await h.seedDeliveryNote('PDN', 1);
    const { shipmentId } = (await h.api('POST', `/prep/from-pdn/${note.id}`)).data;
    assert.equal((await shipmentOf(shipmentId)).preparationStatus, 'receiving');

    await pickAll(shipmentId);
    assert.equal((await shipmentOf(shipmentId)).preparationStatus, 'received');

    assert.equal((await h.api('POST', `/shipments/${shipmentId}/receive`)).status, 200);
    const shipment = await shipmentOf(shipmentId);
    assert.equal(shipment.preparationStatus, 'received');
    assert.ok(shipment.receivedAt);
  });

  test('un albarán de compra ya recibido no se vuelve a recepcionar', async () => {
    const note = await h.seedDeliveryNote('PDN', 1);
    const { shipmentId } = (await h.api('POST', `/prep/from-pdn/${note.id}`)).data;
    await pickAll(shipmentId);
    assert.equal((await shipmentOf(shipmentId)).preparationStatus, 'received');

    const again = await h.api('POST', `/prep/from-pdn/${note.id}`);
    assert.equal(again.status, 200, JSON.stringify(again.data));
    assert.equal(again.data.shipmentId, shipmentId);
    assert.equal(again.data.reused, true);
    const shipments = await h.query(
      `SELECT id FROM "Shipment" WHERE "sourceDocType" = 'PDN' AND "sourceDocId" = '${note.id}'`,
    );
    assert.equal(shipments.length, 1);
  });

  test('una recepción cancelada sí deja empezar otra', async () => {
    const note = await h.seedDeliveryNote('PDN', 1);
    const { shipmentId } = (await h.api('POST', `/prep/from-pdn/${note.id}`)).data;
    const cancelled = await h.api('POST', `/shipments/${shipmentId}/cancel`, {});
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
    const redo = await h.api('POST', `/prep/from-pdn/${note.id}`);
    assert.notEqual(redo.data.shipmentId, shipmentId);
    assert.equal(redo.data.reused, undefined);
  });

  test('una falta en el picking también completa la preparación', async () => {
    const note = await h.seedDeliveryNote('SDN', 2);
    const { shipmentId, tasks } = (await h.api('POST', `/prep/from-sdn/${note.id}`)).data;
    await h.api('PATCH', `/prep/tasks/${tasks[0].id}`, { pickedQty: tasks[0].requestedQty });
    assert.equal((await shipmentOf(shipmentId)).preparationStatus, 'picking');
    await h.api('PATCH', `/prep/tasks/${tasks[1].id}`, { status: 'missing', pickedQty: 0 });
    assert.equal((await shipmentOf(shipmentId)).preparationStatus, 'packed');
  });

  test('mover a un acopio materializa el paquete con lo preparado', async () => {
    const note = await h.seedDeliveryNote('SDN', 2);
    const { shipmentId } = (await h.api('POST', `/prep/from-sdn/${note.id}`)).data;
    await pickAll(shipmentId);
    const area = await h.api('POST', '/staging-areas', { code: 'AC-FLUJO', name: 'Muelle 1' });
    assert.equal(area.status, 200);

    const moved = await h.api('POST', `/shipments/${shipmentId}/to-staging`, {
      stagingAreaId: area.data.id,
    });
    assert.equal(moved.status, 200);
    assert.equal(moved.data.packagesCreated, 1);
    assert.equal((await shipmentOf(shipmentId)).preparationStatus, 'ready');

    const packages = (await h.api('GET', '/packages')).data.filter(
      (p: any) => p.shipmentId === shipmentId,
    );
    assert.equal(packages.length, 1);
    assert.equal(packages[0].stagingAreaId, area.data.id);
    const lines = (await h.api('GET', `/packages/${packages[0].id}/lines`)).data;
    assert.equal(lines.length, 2);

    const payload = await h.api('GET', `/staging-areas/${area.data.id}/payload`);
    assert.equal(payload.status, 200);
    assert.equal(payload.data.packages.length, 1);
  });

  test('seguimiento público: se ve sin sesión y sin datos internos', async () => {
    const a = await newShipment({ recipientName: 'Ana', recipientEmail: 'ana@example.com' });
    const track = await h.api('GET', `/track/${a.reportToken}`);
    assert.equal(track.status, 200);
    assert.equal(track.data.status, 'pending');
    assert.equal(track.data.destination.address, 'Calle Mayor 1, Madrid');
    const raw = JSON.stringify(track.data);
    assert.ok(!raw.includes('ana@example.com'));
    assert.ok(!raw.includes(a.reportToken));

    assert.equal((await h.api('GET', '/track/desconocido-desconocido-1234')).status, 404);
  });
});
