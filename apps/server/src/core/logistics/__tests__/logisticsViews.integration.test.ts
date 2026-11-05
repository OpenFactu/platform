/** Lo que leen las pantallas: listados con cliente y documento, ficha completa y el día. */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startLogisticsHarness, testDatabaseUrl, type LogisticsHarness } from './logisticsHarness';

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
  return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

describe('vistas de logística', { skip: !testDatabaseUrl }, () => {
  let h: LogisticsHarness;

  before(async () => {
    h = await startLogisticsHarness();
  });
  after(async () => {
    await h?.close();
  });

  /** Albarán → preparado, en una ruta en marcha y con su paquete. */
  const onTheRoad = async () => {
    const note = await h.seedDeliveryNote('SDN', 1);
    const { shipmentId, tasks } = (await h.api('POST', `/prep/from-sdn/${note.id}`)).data;
    await h.api('PATCH', `/prep/tasks/${tasks[0].id}`, { pickedQty: tasks[0].requestedQty });
    const area = await h.api('POST', '/staging-areas', { name: `Muelle ${shipmentId.slice(0, 5)}` });
    await h.api('POST', `/shipments/${shipmentId}/to-staging`, { stagingAreaId: area.data.id });
    const route = await h.api('POST', '/routes', {
      plannedDate: new Date().toISOString().slice(0, 10),
      driverName: 'Rosa',
      vehiclePlate: '1234ABC',
    });
    await h.api('POST', `/shipments/${shipmentId}/dispatch`, { routeId: route.data.id });
    await h.api('POST', `/routes/${route.data.id}/start`);
    return { note, shipmentId, routeId: route.data.id as string, routeCode: route.data.code };
  };

  test('el listado de envíos dice cliente, documento, sentido, ruta y conductor', async () => {
    const { shipmentId, routeCode } = await onTheRoad();
    const { rows } = (await h.api('GET', '/shipments?page=1')).data;
    const row = rows.find((r: any) => r.id === shipmentId);
    assert.match(row.partnerName, /^Cliente/);
    assert.equal(row.counterparty, row.partnerName);
    assert.ok(row.documentNumber);
    assert.equal(row.direction, 'out');
    assert.equal(row.routeCode, routeCode);
    assert.equal(row.routeDriver, 'Rosa');
    assert.equal(row.routeVehicle, '1234ABC');
    assert.equal(row.state, 'out_for_delivery');
  });

  test('una compra sale como entrada y una recogida como recogida', async () => {
    const purchase = await h.seedDeliveryNote('PDN', 1);
    const inbound = (await h.api('POST', `/prep/from-pdn/${purchase.id}`)).data.shipmentId;
    const manual = await h.api('POST', '/shipments', {
      kind: 'pickup_return',
      recipientName: 'Ana',
    });
    const { rows } = (await h.api('GET', '/shipments?page=1')).data;
    assert.equal(rows.find((r: any) => r.id === inbound).direction, 'in');
    const pickup = rows.find((r: any) => r.id === manual.data.id);
    assert.equal(pickup.direction, 'pickup');
    assert.equal(pickup.counterparty, 'Ana');
  });

  test('se busca por número de envío y por cliente', async () => {
    const { shipmentId } = await onTheRoad();
    const shipment = (await h.api('GET', `/shipments/${shipmentId}`)).data;
    const byCode = await h.api('GET', `/shipments?q=${shipment.code}`);
    assert.deepEqual(
      byCode.data.rows.map((r: any) => r.id),
      [shipmentId],
    );
    const partner = byCode.data.rows[0].partnerName;
    const byPartner = await h.api('GET', `/shipments?q=${encodeURIComponent(partner)}`);
    assert.ok(byPartner.data.rows.some((r: any) => r.id === shipmentId));
  });

  test('la ficha trae historial, paquetes con contenido y prueba de entrega', async () => {
    const { shipmentId, routeId, note } = await onTheRoad();
    const [stop] = (await h.api('GET', `/routes/${routeId}/stops`)).data;
    await h.api('POST', `/routes/${routeId}/stops/${stop.id}/deliver`, {
      recipientName: 'Ana',
      signatureImage: 'data:image/png;base64,AAAA',
    });

    const r = await h.api('GET', `/shipments/${shipmentId}/detail`);
    assert.equal(r.status, 200);
    assert.equal(r.data.shipment.id, shipmentId);
    assert.match(r.data.shipment.partnerName, /^Cliente/);
    assert.ok(r.data.events.some((e: any) => e.status === 'delivered'));
    assert.equal(r.data.packages.length, 1);
    assert.equal(r.data.packages[0].lines[0].itemCode.length > 0, true);
    assert.equal(r.data.packages[0].lines[0].quantity, 3);
    assert.equal(r.data.stops.length, 1);
    assert.equal(r.data.stops[0].recipientName, 'Ana');
    assert.ok(r.data.stops[0].signatureImage);
    assert.ok(r.data.stops[0].routeCode);
    assert.ok(note.id);
  });

  test('una ficha que no existe da 404', async () => {
    assert.equal((await h.api('GET', '/shipments/no-existe/detail')).status, 404);
  });

  test('el resumen del día cuenta y señala', async () => {
    const before = (await h.api('GET', '/today')).data.counts;

    await onTheRoad();
    const old = await h.api('POST', '/routes', { plannedDate: '2026-01-05' });
    const stuck = (await h.api('POST', '/shipments', {})).data.id;
    await h.api('POST', `/shipments/${stuck}/dispatch`, { routeId: old.data.id });
    await h.api('POST', `/routes/${old.data.id}/start`);
    const broken = (await h.api('POST', '/shipments', {})).data.id;
    await h.api('POST', `/shipments/${broken}/incident`, { reason: 'Caja rota' });
    const ready = (await h.api('POST', '/shipments', {})).data.id;
    await h.api('POST', `/shipments/${ready}/ready`);

    const { counts, late, incidents, readyForRoute, staleRoutes } = (await h.api('GET', '/today'))
      .data;
    assert.equal(counts.onRoute, before.onRoute + 2);
    assert.equal(counts.incidents, before.incidents + 1);
    assert.equal(counts.readyForRoute, before.readyForRoute + 1);
    assert.equal(counts.late, before.late + 1);
    assert.equal(counts.staleRoutes, before.staleRoutes + 1);
    assert.ok(late.some((s: any) => s.id === stuck));
    assert.ok(incidents.some((s: any) => s.id === broken));
    assert.ok(readyForRoute.some((s: any) => s.id === ready));
    assert.ok(staleRoutes.some((r: any) => r.id === old.data.id));
  });

  test('el listado de rutas dice cuánto llevan hecho', async () => {
    const { routeId } = await onTheRoad();
    const route = (await h.api('GET', '/routes')).data.find((r: any) => r.id === routeId);
    assert.equal(route.stopsTotal, 1);
    assert.equal(route.stopsOpen, 1);
    assert.equal(route.stopsDelivered, 0);
  });

  test('el listado de paquetes dice de qué envío y cliente son', async () => {
    const { shipmentId } = await onTheRoad();
    const shipment = (await h.api('GET', `/shipments/${shipmentId}`)).data;
    const pkg = (await h.api('GET', '/packages')).data.find(
      (p: any) => p.shipmentId === shipmentId,
    );
    assert.equal(pkg.shipmentCode, shipment.code);
    assert.match(pkg.counterparty, /^Cliente/);
    assert.equal(pkg.status, 'shipped');
  });

  test('la página pública trae la marca de la empresa', async () => {
    const s = (await h.api('POST', '/shipments', {})).data;
    const track = await h.api('GET', `/track/${s.reportToken}`, undefined, null);
    assert.ok('branding' in track.data);
    assert.ok('colorPrimary' in track.data.branding);
  });
});
