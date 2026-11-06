/**
 * Transportistas de verdad en el despacho, con un adaptador de prueba: el núcleo no
 * conoce a ninguno. Informes del reparto e idioma de los correos.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startLogisticsHarness, testDatabaseUrl, type LogisticsHarness } from './logisticsHarness';
import { CarrierRegistry } from '../../carriers/CarrierRegistry';
import type { TrackingSnapshot } from '../../carriers/ICarrierAdapter';

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
  return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

const created: any[] = [];
let tracking: TrackingSnapshot = { status: 'in_transit' };
let failNext = false;

CarrierRegistry.register({
  id: 'prueba',
  name: 'Transportista de prueba',
  credentialFields: [{ key: 'apiKey', label: 'API key' }],
  async createShipment(account, input) {
    if (failNext) {
      failNext = false;
      throw new Error('API del transportista caída');
    }
    created.push({ account, input });
    return { trackingNumber: `PRB-${created.length}`, labelPdf: Buffer.from('%PDF-etiqueta') };
  },
  async fetchTracking() {
    return tracking;
  },
  async generateLabel() {
    return Buffer.from('%PDF-regenerada');
  },
});

describe('transportistas e informes', { skip: !testDatabaseUrl }, () => {
  let h: LogisticsHarness;
  let accountId: string;
  let manualAccountId: string;

  before(async () => {
    h = await startLogisticsHarness();
    await h.query(
      `INSERT INTO "Carrier" (id, name, code, "adapterId") VALUES ('c-prueba', 'Prueba', 'prueba', 'prueba'), ('c-manual', 'Mensajero', 'mensajero', 'manual'), ('c-libre', 'Sin adaptador', 'libre', NULL)`,
    );
    await h.query(
      `INSERT INTO "CarrierAccount" (id, "carrierId", name, credentials) VALUES ('a-prueba', 'c-prueba', 'Cuenta', '{"apiKey":"k"}'), ('a-manual', 'c-manual', 'Cuenta manual', '{}'), ('a-libre', 'c-libre', 'Cuenta libre', '{}')`,
    );
    accountId = 'a-prueba';
    manualAccountId = 'a-manual';
  });
  after(async () => {
    await h?.close();
  });

  const newShipment = async (extra: Record<string, unknown> = {}) =>
    (await h.api('POST', '/shipments', { destinationAddress: 'Calle Mayor 1, Madrid', ...extra }))
      .data.id as string;
  const shipmentOf = async (id: string) => (await h.api('GET', `/shipments/${id}`)).data;
  const send = (id: string, body: Record<string, unknown>) =>
    h.api('POST', `/shipments/${id}/carrier-dispatch`, body);

  test('se pueden elegir las cuentas de transportista', async () => {
    const r = await h.api('GET', '/carrier-accounts');
    assert.equal(r.status, 200);
    const prueba = r.data.find((a: any) => a.id === accountId);
    assert.equal(prueba.carrierName, 'Prueba');
    assert.equal(prueba.manual, false);
    assert.equal(r.data.find((a: any) => a.id === manualAccountId).manual, true);
    assert.equal(r.data.find((a: any) => a.id === 'a-libre').manual, true);
    assert.equal('credentials' in prueba, false);
  });

  test('despachar por transportista crea el envío allí y guarda su número', async () => {
    const id = await newShipment({ recipientName: 'Ana' });
    await h.api('POST', '/packages', { shipmentId: id, weightKg: 2 });
    await h.api('POST', '/packages', { shipmentId: id, weightKg: 3 });
    const r = await send(id, { carrierAccountId: accountId });
    assert.equal(r.status, 200);
    assert.match(r.data.trackingNumber, /^PRB-/);

    const shipment = await shipmentOf(id);
    assert.equal(shipment.status, 'dispatched');
    assert.equal(shipment.carrier, 'prueba');
    assert.equal(shipment.carrierAccountId, accountId);
    assert.equal(shipment.trackingNumber, r.data.trackingNumber);

    const call = created[created.length - 1];
    assert.equal(call.account.apiKey, 'k');
    assert.equal(call.input.shipmentId, id);
    assert.equal(call.input.weightKg, 5);
    assert.equal(call.input.recipientName, 'Ana');
  });

  test('si el transportista falla, el envío no se mueve', async () => {
    const id = await newShipment();
    failNext = true;
    const r = await send(id, { carrierAccountId: accountId });
    assert.equal(r.status, 502);
    assert.match(r.data.error, /caída/);
    assert.equal((await shipmentOf(id)).status, 'pending');
  });

  test('la etiqueta se guarda y se puede volver a sacar', async () => {
    const id = await newShipment();
    await send(id, { carrierAccountId: accountId });
    const label = await h.api('GET', `/shipments/${id}/carrier-label.pdf`);
    assert.equal(label.status, 200);
    assert.match(label.contentType, /application\/pdf/);
    assert.equal(label.data, '%PDF-etiqueta');
  });

  test('la etiqueta no viaja con el envío: pesa demasiado para ir en cada listado', async () => {
    const id = await newShipment();
    await send(id, { carrierAccountId: accountId });

    const list = await h.api('GET', '/shipments?pageSize=500');
    const rows = list.data.rows ?? list.data;
    const row = rows.find((s: any) => s.id === id);
    assert.ok(row);
    assert.equal('carrierLabel' in row, false);
    assert.equal('carrierLabel' in (await shipmentOf(id)), false);
    const detail = await h.api('GET', `/shipments/${id}/detail`);
    assert.equal('carrierLabel' in detail.data.shipment, false);

    // Y volver a despachar sin integración no deja la etiqueta anterior.
    await h.api('POST', `/shipments/${id}/postpone`, { reason: 'Reintento' });
    await send(id, { carrierAccountId: manualAccountId, trackingNumber: 'NUEVO-1' });
    assert.equal((await h.api('GET', `/shipments/${id}/carrier-label.pdf`)).status, 404);
  });

  test('sin integración, el número lo escribe el usuario: no se inventa', async () => {
    const id = await newShipment();
    const missing = await send(id, { carrierAccountId: manualAccountId });
    assert.equal(missing.status, 400);
    assert.equal((await shipmentOf(id)).status, 'pending');

    const typed = await send(id, { carrierAccountId: manualAccountId, trackingNumber: 'ABC123' });
    assert.equal(typed.status, 200);
    assert.equal((await shipmentOf(id)).trackingNumber, 'ABC123');
    assert.equal((await h.api('GET', `/shipments/${id}/carrier-label.pdf`)).status, 404);
  });

  test('consultar el estado mueve el envío', async () => {
    const id = await newShipment();
    await send(id, { carrierAccountId: accountId });

    tracking = { status: 'out_for_delivery', lastLat: 40.1, lastLng: -3.1 };
    assert.equal((await h.api('POST', `/shipments/${id}/carrier-refresh`)).status, 200);
    let shipment = await shipmentOf(id);
    assert.equal(shipment.status, 'out_for_delivery');
    assert.equal(shipment.lastLat, 40.1);

    tracking = { status: 'delivered', description: 'Entregado en portería' };
    await h.api('POST', `/shipments/${id}/carrier-refresh`);
    shipment = await shipmentOf(id);
    assert.equal(shipment.status, 'delivered');

    // Una respuesta atrasada no devuelve el envío atrás.
    tracking = { status: 'in_transit' };
    const late = await h.api('POST', `/shipments/${id}/carrier-refresh`);
    assert.equal(late.status, 200);
    assert.equal(late.data.changed, false);
    assert.equal((await shipmentOf(id)).status, 'delivered');
  });

  test('una ronda de consultas pasa por todos los envíos abiertos', async () => {
    const { refreshOpenCarrierShipments } = await import('../carrierDispatch');
    const id = await newShipment();
    await send(id, { carrierAccountId: accountId });
    tracking = { status: 'in_transit' };
    const count = await refreshOpenCarrierShipments({
      db: h.db,
      tenantId: h.tenantId,
      userId: null,
      baseUrl: '',
    });
    assert.ok(count >= 1);
    assert.equal((await shipmentOf(id)).status, 'in_transit');
  });

  test('el historial sale en orden aunque dos cambios caigan en la misma operación', async () => {
    const route = await h.api('POST', '/routes', { name: 'Orden', plannedDate: '2026-11-04' });
    const id = await newShipment();
    await h.api('POST', `/shipments/${id}/dispatch`, { routeId: route.data.id });
    await h.api('POST', `/routes/${route.data.id}/start`);

    const detail = await h.api('GET', `/shipments/${id}/detail`);
    const states = detail.data.events
      .filter((e: any) => e.kind === 'status_change')
      .map((e: any) => e.status);
    assert.deepEqual(states.slice(0, 2), ['out_for_delivery', 'in_transit']);
  });

  describe('idioma de los correos', () => {
    const COUNTRIES = { ZE: 'es-ZE', ZN: 'en-ZN', ZF: 'fr-ZF' };

    before(async () => {
      // Los países no vienen en el esquema público de las pruebas: basta con lo que se lee.
      await h.query(
        `CREATE TABLE IF NOT EXISTS public."Country" (code text PRIMARY KEY, "localeDefault" text NOT NULL)`,
      );
      for (const [code, locale] of Object.entries(COUNTRIES)) {
        await h.query(
          `INSERT INTO public."Country" (code, "localeDefault") VALUES ('${code}', '${locale}') ON CONFLICT DO NOTHING`,
        );
      }
    });
    after(async () => {
      await h.query(`DELETE FROM public."Country" WHERE code IN ('ZE', 'ZN', 'ZF')`);
      await h.query(`DELETE FROM "SystemConfig" WHERE key = 'company_country'`);
    });

    const localeFor = async (partnerCountry: string | null) => {
      const { recipientLocale } = await import('../shipmentNotifications');
      const note = await h.seedDeliveryNote('SDN', 1);
      if (partnerCountry) {
        await h.query(
          `UPDATE "BusinessPartner" SET "countryCode" = '${partnerCountry}' WHERE id = '${note.partnerId}'`,
        );
      }
      return recipientLocale(h.db, { deliveryNoteId: note.id, sourceDocType: 'SDN' });
    };
    const setCompanyCountry = async (code: string) => {
      await h.query(`DELETE FROM "SystemConfig" WHERE key = 'company_country'`);
      await h.query(
        `INSERT INTO "SystemConfig" (id, key, value) VALUES (gen_random_uuid()::text, 'company_country', '${code}')`,
      );
    };

    test('va en el idioma del país del cliente', async () => {
      assert.equal(await localeFor('ZN'), 'en');
      assert.equal(await localeFor('ZE'), 'es');
    });

    test('un país cuyo idioma no tenemos recibe inglés, no español', async () => {
      assert.equal(await localeFor('ZF'), 'en');
    });

    test('el país del cliente manda sobre el de la empresa', async () => {
      await setCompanyCountry('ZE');
      assert.equal(await localeFor('ZN'), 'en');
    });

    test('sin país del cliente, el de la empresa', async () => {
      await setCompanyCountry('ZN');
      assert.equal(await localeFor(null), 'en');
      const { recipientLocale } = await import('../shipmentNotifications');
      assert.equal(await recipientLocale(h.db, {}), 'en');
    });

    test('un país que no existe no rompe el aviso', async () => {
      await setCompanyCountry('??');
      const { recipientLocale } = await import('../shipmentNotifications');
      assert.equal(await recipientLocale(h.db, {}), 'es');
    });
  });

  describe('informes', () => {
    test('entregas a tiempo, incidencias por causa y reparto por conductor', async () => {
      const route = await h.api('POST', '/routes', {
        plannedDate: '2026-11-04',
        driverName: 'Rosa',
      });
      const onTime = await newShipment({ estimatedDelivery: '2099-01-01T10:00:00Z' });
      const late = await newShipment({ estimatedDelivery: '2020-01-01T10:00:00Z' });
      const failed = await newShipment();
      for (const id of [onTime, late, failed]) {
        await h.api('POST', `/shipments/${id}/dispatch`, { routeId: route.data.id });
      }
      await h.api('POST', `/routes/${route.data.id}/start`);
      const stops = (await h.api('GET', `/routes/${route.data.id}/stops`)).data;
      const stopOf = (id: string) => stops.find((s: any) => s.shipmentId === id).id;
      const url = `/routes/${route.data.id}/stops`;
      await h.api('POST', `${url}/${stopOf(onTime)}/deliver`, { recipientName: 'Ana' });
      await h.api('POST', `${url}/${stopOf(late)}/deliver`, { recipientName: 'Ana' });
      await h.api('POST', `${url}/${stopOf(failed)}/incident`, { reason: 'Caja rota' });

      const r = await h.api('GET', '/reports/summary');
      assert.equal(r.status, 200);
      assert.equal(r.data.delivery.total >= 2, true);
      assert.ok(r.data.delivery.onTime >= 1);
      assert.ok(r.data.delivery.late >= 1);
      const cause = r.data.incidents.find((i: any) => i.reason === 'Caja rota');
      assert.equal(cause.count, 1);
      const driver = r.data.drivers.find((d: any) => d.driver === 'Rosa');
      assert.equal(driver.stops, 3);
      assert.equal(driver.delivered, 2);
      assert.equal(driver.incidents, 1);
    });

    test('filtra por fechas', async () => {
      const r = await h.api('GET', '/reports/summary?from=2000-01-01&to=2000-01-02');
      assert.equal(r.status, 200);
      assert.equal(r.data.delivery.total, 0);
      assert.deepEqual(r.data.drivers, []);
    });
  });
});
