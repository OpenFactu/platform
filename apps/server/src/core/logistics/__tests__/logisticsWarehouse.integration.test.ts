/**
 * Almacén y documentos: una falta corrige el albarán, los códigos son
 * correlativos y salen los PDF de bulto, packing list y hoja de ruta.
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

describe('almacén de logística', { skip: !testDatabaseUrl }, () => {
  let h: LogisticsHarness;

  before(async () => {
    h = await startLogisticsHarness();
  });
  after(async () => {
    await h?.close();
  });

  const shipmentOf = async (id: string) => (await h.api('GET', `/shipments/${id}`)).data;
  const one = async (text: string) => (await h.query(text))[0];

  /** Albarán con el stock que ya descontó al crearse: 7 en el artículo y en el almacén. */
  const noteWithStock = async (kind: 'SDN' | 'PDN', lines = 2) => {
    const note = await h.seedDeliveryNote(kind, lines);
    for (const itemId of note.itemIds) {
      await h.query(`UPDATE "Item" SET stock = 7 WHERE id = '${itemId}'`);
      await h.query(
        `INSERT INTO "ItemWarehouseStock" ("itemId", "warehouseId", stock) VALUES ('${itemId}', '${note.warehouseId}', 7)`,
      );
    }
    const table = kind === 'SDN' ? 'SalesDeliveryNote' : 'PurchaseDeliveryNote';
    const lineTable = kind === 'SDN' ? 'SalesDeliveryNoteLine' : 'PurchaseDeliveryNoteLine';
    await h.query(
      `UPDATE "${lineTable}" SET "taxRate" = 10, "taxAmount" = 3, "lineTotal" = 33 WHERE "deliveryId" = '${note.id}'`,
    );
    await h.query(
      `UPDATE "${table}" SET subtotal = ${30 * lines}, "taxTotal" = ${3 * lines}, total = ${33 * lines} WHERE id = '${note.id}'`,
    );
    return { ...note, table, lineTable };
  };

  describe('una falta en el picking', () => {
    test('corrige el albarán y devuelve el stock', async () => {
      const note = await noteWithStock('SDN');
      const { shipmentId, tasks } = (await h.api('POST', `/prep/from-sdn/${note.id}`)).data;
      const task = tasks.find((t: any) => t.docLineId === note.lineIds[0]);

      const r = await h.api('PATCH', `/prep/tasks/${task.id}`, { status: 'missing', pickedQty: 1 });
      assert.equal(r.status, 200);

      const line = await one(
        `SELECT quantity, "lineTotal", "taxAmount" FROM "${note.lineTable}" WHERE id = '${note.lineIds[0]}'`,
      );
      assert.equal(Number(line.quantity), 1);
      assert.equal(Number(line.lineTotal), 11);
      assert.equal(Number(line.taxAmount), 1);

      const header = await one(
        `SELECT subtotal, "taxTotal", total FROM "${note.table}" WHERE id = '${note.id}'`,
      );
      assert.equal(Number(header.subtotal), 40);
      assert.equal(Number(header.taxTotal), 4);
      assert.equal(Number(header.total), 44);

      const item = await one(`SELECT stock FROM "Item" WHERE id = '${note.itemIds[0]}'`);
      assert.equal(Number(item.stock), 9);
      const stock = await one(
        `SELECT stock FROM "ItemWarehouseStock" WHERE "itemId" = '${note.itemIds[0]}'`,
      );
      assert.equal(Number(stock.stock), 9);

      const [saved] = (await h.api('GET', `/prep/tasks?shipmentId=${shipmentId}`)).data.filter(
        (t: any) => t.id === task.id,
      );
      assert.equal(saved.shortageQty, 2);
      const events = (await h.api('GET', `/shipments/${shipmentId}/events`)).data;
      assert.ok(events.some((e: any) => e.kind === 'shortage' && /2/.test(e.description)));
    });

    test('el resto del albarán no se toca y el envío sigue con lo preparado', async () => {
      const note = await noteWithStock('SDN');
      const { shipmentId, tasks } = (await h.api('POST', `/prep/from-sdn/${note.id}`)).data;
      await h.api('PATCH', `/prep/tasks/${tasks[0].id}`, { pickedQty: tasks[0].requestedQty });
      await h.api('PATCH', `/prep/tasks/${tasks[1].id}`, { status: 'missing', pickedQty: 1 });
      assert.equal((await shipmentOf(shipmentId)).status, 'packed');

      const first = await one(
        `SELECT quantity FROM "${note.lineTable}" WHERE id = '${tasks[0].docLineId}'`,
      );
      assert.equal(Number(first.quantity), 3);

      const area = await h.api('POST', '/staging-areas', { name: 'Muelle faltas' });
      const moved = await h.api('POST', `/shipments/${shipmentId}/to-staging`, {
        stagingAreaId: area.data.id,
      });
      assert.equal(moved.data.packagesCreated, 1);
      const lines = await h.query(
        `SELECT l.quantity FROM "PackageLine" l JOIN "Package" p ON p.id = l."packageId" WHERE p."shipmentId" = '${shipmentId}' ORDER BY l.quantity`,
      );
      assert.deepEqual(
        lines.map((l) => Number(l.quantity)),
        [1, 3],
      );
    });

    test('si falta todo, el envío queda en incidencia y no sale vacío', async () => {
      const note = await noteWithStock('SDN', 1);
      const { shipmentId, tasks } = (await h.api('POST', `/prep/from-sdn/${note.id}`)).data;
      await h.api('PATCH', `/prep/tasks/${tasks[0].id}`, { status: 'missing', pickedQty: 0 });
      assert.equal((await shipmentOf(shipmentId)).status, 'exception');
      const line = await one(
        `SELECT quantity FROM "${note.lineTable}" WHERE id = '${note.lineIds[0]}'`,
      );
      assert.equal(Number(line.quantity), 0);
    });

    test('con lote, repone ese lote y baja su cantidad en el albarán', async () => {
      const note = await noteWithStock('SDN', 1);
      const [itemId] = note.itemIds;
      await h.query(
        `INSERT INTO "ItemBatch" (id, "itemId", "batchNum", quantity) VALUES ('b-${note.id}', '${itemId}', 'L1', 4)`,
      );
      await h.query(
        `INSERT INTO "ItemBatchStock" ("itemId", "batchNum", "warehouseId", quantity) VALUES ('${itemId}', 'L1', '${note.warehouseId}', 4)`,
      );
      await h.query(
        `INSERT INTO "SalesDeliveryNoteLineBatch" (id, "deliveryLineId", "batchNum", quantity) VALUES ('nb-${note.id}', '${note.lineIds[0]}', 'L1', 3)`,
      );
      const { tasks } = (await h.api('POST', `/prep/from-sdn/${note.id}`)).data;
      assert.equal(tasks[0].batchNumber, 'L1');

      await h.api('PATCH', `/prep/tasks/${tasks[0].id}`, { status: 'missing', pickedQty: 2 });

      const batch = await one(`SELECT quantity FROM "ItemBatch" WHERE id = 'b-${note.id}'`);
      assert.equal(Number(batch.quantity), 5);
      const stock = await one(
        `SELECT quantity FROM "ItemBatchStock" WHERE "itemId" = '${itemId}' AND "batchNum" = 'L1'`,
      );
      assert.equal(Number(stock.quantity), 5);
      const row = await one(
        `SELECT quantity FROM "SalesDeliveryNoteLineBatch" WHERE id = 'nb-${note.id}'`,
      );
      assert.equal(Number(row.quantity), 2);
    });

    test('devuelve lo servido al pedido de origen', async () => {
      const note = await noteWithStock('SDN', 1);
      const orderId = `so-${note.id}`;
      const [header] = await h.query(
        `SELECT "seriesId", "periodId", "partnerId" FROM "SalesDeliveryNote" WHERE id = '${note.id}'`,
      );
      await h.query(
        `INSERT INTO "SalesOrder" (id, "seriesId", "docNum", "periodId", "partnerId", date, status) VALUES ('${orderId}', '${header.seriesId}', 900, '${header.periodId}', '${header.partnerId}', now(), 'C')`,
      );
      await h.query(
        `INSERT INTO "SalesOrderLine" (id, "orderId", "lineNum", "itemId", quantity, price, "lineTotal", "deliveredQty") VALUES ('sol-${note.id}', '${orderId}', 1, '${note.itemIds[0]}', 3, 10, 30, 3)`,
      );
      await h.query(`UPDATE "SalesDeliveryNote" SET "orderId" = '${orderId}' WHERE id = '${note.id}'`);
      await h.query(
        `UPDATE "SalesDeliveryNoteLine" SET "baseLine" = 1 WHERE id = '${note.lineIds[0]}'`,
      );
      const { tasks } = (await h.api('POST', `/prep/from-sdn/${note.id}`)).data;
      await h.api('PATCH', `/prep/tasks/${tasks[0].id}`, { status: 'missing', pickedQty: 1 });

      const line = await one(`SELECT "deliveredQty" FROM "SalesOrderLine" WHERE id = 'sol-${note.id}'`);
      assert.equal(Number(line.deliveredQty), 1);
      const order = await one(`SELECT status FROM "SalesOrder" WHERE id = '${orderId}'`);
      assert.equal(order.status, 'P');
    });

    test('en una compra, baja el stock que entró de más', async () => {
      const note = await noteWithStock('PDN', 1);
      const { tasks } = (await h.api('POST', `/prep/from-pdn/${note.id}`)).data;
      await h.api('PATCH', `/prep/tasks/${tasks[0].id}`, { status: 'missing', pickedQty: 1 });
      const item = await one(`SELECT stock FROM "Item" WHERE id = '${note.itemIds[0]}'`);
      assert.equal(Number(item.stock), 5);
    });

    test('un albarán facturado no se toca: queda avisado', async () => {
      const note = await noteWithStock('SDN', 1);
      await h.query(`UPDATE "${note.table}" SET status = 'C' WHERE id = '${note.id}'`);
      const { shipmentId, tasks } = (await h.api('POST', `/prep/from-sdn/${note.id}`)).data;
      const r = await h.api('PATCH', `/prep/tasks/${tasks[0].id}`, {
        status: 'missing',
        pickedQty: 1,
      });
      assert.equal(r.status, 200);
      const line = await one(
        `SELECT quantity FROM "${note.lineTable}" WHERE id = '${note.lineIds[0]}'`,
      );
      assert.equal(Number(line.quantity), 3);
      const events = (await h.api('GET', `/shipments/${shipmentId}/events`)).data;
      assert.ok(events.some((e: any) => e.kind === 'shortage' && /rectificativa/.test(e.description)));
    });

    test('una falta aplicada no se puede cambiar ni repetir', async () => {
      const note = await noteWithStock('SDN');
      const { tasks } = (await h.api('POST', `/prep/from-sdn/${note.id}`)).data;
      await h.api('PATCH', `/prep/tasks/${tasks[0].id}`, { status: 'missing', pickedQty: 1 });
      const again = await h.api('PATCH', `/prep/tasks/${tasks[0].id}`, { pickedQty: 3 });
      assert.equal(again.status, 409);
      const item = await one(`SELECT stock FROM "Item" WHERE id = '${tasks[0].itemId}'`);
      assert.equal(Number(item.stock), 9);
    });
  });

  describe('numeración correlativa', () => {
    const year = new Date().getFullYear();

    test('los envíos llevan número propio, seguido', async () => {
      const a = (await h.api('POST', '/shipments', {})).data.id;
      const b = (await h.api('POST', '/shipments', {})).data.id;
      const codeA = (await shipmentOf(a)).code as string;
      const codeB = (await shipmentOf(b)).code as string;
      assert.match(codeA, new RegExp(`^ENV-${year}-\\d{5}$`));
      assert.equal(Number(codeB.slice(-5)), Number(codeA.slice(-5)) + 1);
    });

    test('las rutas sin código reciben el siguiente', async () => {
      const a = await h.api('POST', '/routes', { plannedDate: '2026-11-04' });
      const b = await h.api('POST', '/routes', { plannedDate: '2026-11-04' });
      assert.match(a.data.code, new RegExp(`^RT-${year}-\\d{5}$`));
      assert.equal(Number(b.data.code.slice(-5)), Number(a.data.code.slice(-5)) + 1);
    });

    test('un código puesto a mano se respeta', async () => {
      const r = await h.api('POST', '/routes', { code: 'MI-RUTA', plannedDate: '2026-11-04' });
      assert.equal(r.data.code, 'MI-RUTA');
    });

    test('los paquetes y las recepciones también', async () => {
      const shipment = (await h.api('POST', '/shipments', {})).data.id;
      const pkg = await h.api('POST', '/packages', { shipmentId: shipment });
      assert.match(pkg.data.code, new RegExp(`^PK-${year}-\\d{5}$`));

      const note = await noteWithStock('SDN', 1);
      const { shipmentId } = (await h.api('POST', `/prep/from-sdn/${note.id}`)).data;
      const pickup = await h.api('POST', `/shipments/${shipmentId}/schedule-pickup`, {
        warehouseId: note.warehouseId,
      });
      assert.match(pickup.data.code, new RegExp(`^REC-${year}-\\d{5}$`));
    });

    test('el número de envío está en el correo y en el seguimiento', async () => {
      const a = (await h.api('POST', '/shipments', {})).data;
      const track = await h.api('GET', `/track/${a.reportToken}`, undefined, null);
      assert.equal(track.data.code, (await shipmentOf(a.id)).code);
    });
  });

  describe('PDF', () => {
    const isPdf = (r: any) => {
      assert.equal(r.status, 200);
      assert.match(r.contentType, /application\/pdf/);
      assert.ok(String(r.data).startsWith('%PDF'));
    };

    test('etiqueta de bulto, packing list y hoja de ruta', async () => {
      const note = await noteWithStock('SDN', 1);
      const { shipmentId, tasks } = (await h.api('POST', `/prep/from-sdn/${note.id}`)).data;
      await h.api('PATCH', `/prep/tasks/${tasks[0].id}`, { pickedQty: tasks[0].requestedQty });
      const area = await h.api('POST', '/staging-areas', { name: 'Muelle PDF' });
      await h.api('POST', `/shipments/${shipmentId}/to-staging`, { stagingAreaId: area.data.id });
      const [pkg] = await h.query(`SELECT id FROM "Package" WHERE "shipmentId" = '${shipmentId}'`);
      const route = await h.api('POST', '/routes', { plannedDate: '2026-11-04' });
      await h.api('POST', `/shipments/${shipmentId}/dispatch`, { routeId: route.data.id });

      isPdf(await h.api('GET', `/packages/${pkg.id}/label.pdf`));
      isPdf(await h.api('GET', `/shipments/${shipmentId}/labels.pdf`));
      isPdf(await h.api('GET', `/shipments/${shipmentId}/packing-list.pdf`));
      isPdf(await h.api('GET', `/routes/${route.data.id}/sheet.pdf`));
      isPdf(await h.api('GET', `/staging-areas/${area.data.id}/packing-list.pdf`));
      isPdf(await h.api('GET', `/staging-areas/${area.data.id}/labels.pdf`));
    });

    test('lo que no existe da 404', async () => {
      assert.equal((await h.api('GET', '/packages/no-existe/label.pdf')).status, 404);
      assert.equal((await h.api('GET', '/routes/no-existe/sheet.pdf')).status, 404);
    });
  });
});
