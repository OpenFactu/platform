/**
 * Un documento no se puede consumir dos veces: un pedido se recibe o se entrega hasta
 * donde pide, un albarán se factura una vez. Si no, el stock y el coste contarían doble.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startDocumentsHarness, testDatabaseUrl, type DocumentsHarness } from './documentsHarness';

const SIDES = [
  {
    name: 'compra',
    side: 'purchase' as const,
    order: 'PO',
    orderTable: 'PurchaseOrder',
    note: 'PDN',
    noteTable: 'PurchaseDeliveryNote',
    qty: 'receivedQty',
    initialStock: 0,
  },
  {
    name: 'venta',
    side: 'sales' as const,
    order: 'SO',
    orderTable: 'SalesOrder',
    note: 'SDN',
    noteTable: 'SalesDeliveryNote',
    qty: 'deliveredQty',
    initialStock: 100,
  },
];

describe('consumir un documento base', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;
  const series: Record<string, string> = {};

  before(async () => {
    h = await startDocumentsHarness();
    await h.query(
      `INSERT INTO "DocumentSeries" (id, name, "periodId", "docType", "firstNumber", "nextNumber", "lastNumber") VALUES
        ('base-so', 'Pedidos de venta', '${h.periodId}', 'SO', 1, 1, 9999),
        ('base-po', 'Pedidos de compra', '${h.periodId}', 'PO', 1, 1, 9999)`,
    );
    const rows = await h.query(`SELECT id, "docType" FROM "DocumentSeries"`);
    for (const row of rows) series[row.docType] = row.id;
  });
  after(async () => {
    await h?.close();
  });

  const create = (docType: string, lines: Array<Record<string, unknown>>, extra = {}) =>
    h.api('POST', `/documents/${docType}`, {
      seriesId: series[docType],
      periodId: h.periodId,
      partnerId: 'partner' in extra ? (extra as any).partner : undefined,
      date: '2026-06-15',
      warehouseId: h.warehouseId,
      lines: lines.map((line) => ({ taxGroupId: h.tax.general, price: 10, ...line })),
      ...extra,
    });
  const newOrder = async (docType: string, itemId: string, quantity: number) => {
    const partnerId = await h.seedPartner();
    const res = await create(docType, [{ itemId, quantity }], { partnerId });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return { id: res.data.id as string, partnerId };
  };
  const fromOrder = (
    docType: string,
    order: { id: string; partnerId: string },
    itemId: string,
    quantity: number,
  ) =>
    create(docType, [{ itemId, quantity, baseLine: 1 }], {
      partnerId: order.partnerId,
      orderId: order.id,
    });
  const orderState = async (table: string, qty: string, id: string) => {
    const [header] = await h.query(`SELECT status FROM "${table}" WHERE id = '${id}'`);
    const [line] = await h.query(
      `SELECT "${qty}" AS done FROM "${table}Line" WHERE "orderId" = '${id}'`,
    );
    return { status: header.status, done: Number(line.done) };
  };
  const notesOf = async (table: string, id: string) => {
    const [row] = await h.query(
      `SELECT count(*) AS total FROM "${table}" WHERE "orderId" = '${id}' AND status <> 'X'`,
    );
    return Number(row.total);
  };

  for (const s of SIDES) {
    describe(s.name, () => {
      test('un pedido se sirve por partes hasta completarlo', async () => {
        const itemId = await h.seedItem({ stock: s.initialStock });
        const order = await newOrder(s.order, itemId, 10);

        const first = await fromOrder(s.note, order, itemId, 4);
        assert.equal(first.status, 200, JSON.stringify(first.data));
        assert.deepEqual(await orderState(s.orderTable, s.qty, order.id), { status: 'P', done: 4 });

        const rest = await fromOrder(s.note, order, itemId, 6);
        assert.equal(rest.status, 200, JSON.stringify(rest.data));
        assert.deepEqual(await orderState(s.orderTable, s.qty, order.id), {
          status: 'C',
          done: 10,
        });
      });

      test('un pedido ya servido no se sirve otra vez', async () => {
        const itemId = await h.seedItem({ stock: s.initialStock });
        const order = await newOrder(s.order, itemId, 10);
        await fromOrder(s.note, order, itemId, 10);
        const stock = await h.stockOf(itemId);

        const again = await fromOrder(s.note, order, itemId, 1);
        assert.equal(again.status, 409, JSON.stringify(again.data));
        assert.deepEqual(await h.stockOf(itemId), stock);
        assert.equal(await notesOf(s.noteTable, order.id), 1);
        assert.equal((await orderState(s.orderTable, s.qty, order.id)).done, 10);
      });

      test('no se sirve más de lo que queda', async () => {
        const itemId = await h.seedItem({ stock: s.initialStock });
        const order = await newOrder(s.order, itemId, 10);
        await fromOrder(s.note, order, itemId, 4);
        const stock = await h.stockOf(itemId);

        const tooMuch = await fromOrder(s.note, order, itemId, 7);
        assert.equal(tooMuch.status, 409, JSON.stringify(tooMuch.data));
        assert.match(tooMuch.data.error, /6/);
        assert.deepEqual(await h.stockOf(itemId), stock);
        assert.deepEqual(await orderState(s.orderTable, s.qty, order.id), { status: 'P', done: 4 });
      });

      test('una línea que no está en el pedido no se cuela', async () => {
        const itemId = await h.seedItem({ stock: s.initialStock });
        const order = await newOrder(s.order, itemId, 10);
        const res = await create(s.note, [{ itemId, quantity: 1, baseLine: 99 }], {
          partnerId: order.partnerId,
          orderId: order.id,
        });
        assert.equal(res.status, 409, JSON.stringify(res.data));
      });

      test('dos a la vez no sirven el pedido dos veces', async () => {
        const itemId = await h.seedItem({ stock: s.initialStock });
        const order = await newOrder(s.order, itemId, 10);
        const results = await Promise.all([
          fromOrder(s.note, order, itemId, 10),
          fromOrder(s.note, order, itemId, 10),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        assert.equal(await notesOf(s.noteTable, order.id), 1);
      });

      test('cancelar el albarán devuelve lo pendiente', async () => {
        const itemId = await h.seedItem({ stock: s.initialStock });
        const order = await newOrder(s.order, itemId, 10);
        const note = await fromOrder(s.note, order, itemId, 10);
        const cancel = await h.api('POST', `/documents/${s.note}/${note.data.id}/cancel`);
        assert.equal(cancel.status, 200, JSON.stringify(cancel.data));
        assert.deepEqual(await orderState(s.orderTable, s.qty, order.id), { status: 'O', done: 0 });

        const again = await fromOrder(s.note, order, itemId, 10);
        assert.equal(again.status, 200, JSON.stringify(again.data));
      });

      test('un pedido cancelado no se sirve', async () => {
        const itemId = await h.seedItem({ stock: s.initialStock });
        const order = await newOrder(s.order, itemId, 10);
        const cancel = await h.api('POST', `/documents/${s.order}/${order.id}/cancel`);
        assert.equal(cancel.status, 200, JSON.stringify(cancel.data));
        const res = await fromOrder(s.note, order, itemId, 1);
        assert.equal(res.status, 409, JSON.stringify(res.data));
      });

      test('un albarán facturado no se factura otra vez', async () => {
        const itemId = await h.seedItem({ stock: s.initialStock });
        const partnerId = await h.seedPartner();
        const note = await create(s.note, [{ itemId, quantity: 5 }], { partnerId });
        assert.equal(note.status, 200, JSON.stringify(note.data));
        const line = { itemId, quantity: 5, baseType: s.note, baseId: note.data.id, baseLine: 1 };
        await h.invoice(s.side, [line], { partnerId });

        const res = await h.api('POST', h.invoicePath(s.side), {
          seriesId: h.seriesId[s.side],
          periodId: h.periodId,
          partnerId,
          date: '2026-06-15',
          warehouseId: h.warehouseId,
          externalRef: `OTRA-${Math.random()}`,
          lines: [{ ...line, taxGroupId: h.tax.general, price: 10 }],
        });
        assert.equal(res.status, 409, JSON.stringify(res.data));
      });

      test('dos facturas a la vez del mismo albarán: solo pasa una', async () => {
        const itemId = await h.seedItem({ stock: s.initialStock });
        const partnerId = await h.seedPartner();
        const note = await create(s.note, [{ itemId, quantity: 5 }], { partnerId });
        const invoice = () =>
          h.api('POST', h.invoicePath(s.side), {
            seriesId: h.seriesId[s.side],
            periodId: h.periodId,
            partnerId,
            date: '2026-06-15',
            warehouseId: h.warehouseId,
            externalRef: `DOBLE-${Math.random()}`,
            lines: [
              {
                itemId,
                quantity: 5,
                price: 10,
                taxGroupId: h.tax.general,
                baseType: s.note,
                baseId: note.data.id,
                baseLine: 1,
              },
            ],
          });
        const results = await Promise.all([invoice(), invoice()]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      });

      test('al cancelar su factura, el albarán se puede facturar de nuevo', async () => {
        const itemId = await h.seedItem({ stock: s.initialStock });
        const partnerId = await h.seedPartner();
        const note = await create(s.note, [{ itemId, quantity: 5 }], { partnerId });
        const line = { itemId, quantity: 5, baseType: s.note, baseId: note.data.id, baseLine: 1 };
        const invoiceId = await h.invoice(s.side, [line], { partnerId });
        const cancel = await h.api('POST', `${h.invoicePath(s.side)}/${invoiceId}/cancel`);
        assert.equal(cancel.status, 200, JSON.stringify(cancel.data));
        await h.invoice(s.side, [line], { partnerId });
      });

      test('un pedido facturado directamente no se factura otra vez', async () => {
        const itemId = await h.seedItem({ stock: s.initialStock });
        const order = await newOrder(s.order, itemId, 5);
        const line = { itemId, quantity: 5, baseType: s.order, baseId: order.id, baseLine: 1 };
        await h.invoice(s.side, [line], { partnerId: order.partnerId });
        const stock = await h.stockOf(itemId);

        const res = await h.api('POST', h.invoicePath(s.side), {
          seriesId: h.seriesId[s.side],
          periodId: h.periodId,
          partnerId: order.partnerId,
          date: '2026-06-15',
          warehouseId: h.warehouseId,
          externalRef: `OTRA-${Math.random()}`,
          lines: [{ ...line, taxGroupId: h.tax.general, price: 10 }],
        });
        assert.equal(res.status, 409, JSON.stringify(res.data));
        assert.deepEqual(await h.stockOf(itemId), stock);
      });
    });
  }

  describe('borrar movimientos de almacén', () => {
    for (const [path, stockDelta] of [
      ['/goods-receipts', 5],
      ['/goods-issues', -5],
    ] as const) {
      test(`${path}: un borrador se borra`, async () => {
        const itemId = await h.seedItem({ stock: 20 });
        const created = await h.api('POST', path, {
          warehouseId: h.warehouseId,
          lines: [{ itemId, quantity: 5 }],
        });
        const res = await h.api('DELETE', `${path}/${created.data.id}`);
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal((await h.api('GET', `${path}/${created.data.id}`)).status, 404);
      });

      test(`${path}: uno confirmado no se borra y el stock sigue`, async () => {
        const itemId = await h.seedItem({ stock: 20 });
        const created = await h.api('POST', path, {
          warehouseId: h.warehouseId,
          lines: [{ itemId, quantity: 5 }],
        });
        await h.api('POST', `${path}/${created.data.id}/post`);
        const res = await h.api('DELETE', `${path}/${created.data.id}`);
        assert.equal(res.status, 409, JSON.stringify(res.data));
        assert.equal((await h.api('GET', `${path}/${created.data.id}`)).status, 200);
        assert.equal((await h.stockOf(itemId)).global, 20 + stockDelta);
      });
    }

    test('/goods-receipts: borrar algo que no existe da 404', async () => {
      assert.equal((await h.api('DELETE', '/goods-receipts/no-existe')).status, 404);
    });

    test('un traspaso enviado no se borra, y un borrador sí', async () => {
      await h.query(
        `INSERT INTO "Warehouse" (id, name) VALUES ('wh-borrar', 'Destino') ON CONFLICT DO NOTHING`,
      );
      const itemId = await h.seedItem({ stock: 20 });
      const body = {
        fromWarehouseId: h.warehouseId,
        toWarehouseId: 'wh-borrar',
        lines: [{ itemId, quantity: 5 }],
      };
      const draft = await h.api('POST', '/transfer-notes', body);
      assert.equal((await h.api('DELETE', `/transfer-notes/${draft.data.id}`)).status, 200);

      const sent = await h.api('POST', '/transfer-notes', body);
      await h.api('POST', `/transfer-notes/${sent.data.id}/send`);
      const res = await h.api('DELETE', `/transfer-notes/${sent.data.id}`);
      assert.equal(res.status, 409, JSON.stringify(res.data));
      assert.equal((await h.stockOf(itemId)).global, 15);
    });
  });

  describe('traspasos', () => {
    test('enviar y recibir dos veces a la vez solo mueve el stock una', async () => {
      await h.query(
        `INSERT INTO "Warehouse" (id, name) VALUES ('wh-destino', 'Destino') ON CONFLICT DO NOTHING`,
      );
      const itemId = await h.seedItem({ stock: 20 });
      const created = await h.api('POST', '/transfer-notes', {
        fromWarehouseId: h.warehouseId,
        toWarehouseId: 'wh-destino',
        lines: [{ itemId, quantity: 5 }],
      });
      assert.equal(created.status, 200, JSON.stringify(created.data));
      const sent = await Promise.all([
        h.api('POST', `/transfer-notes/${created.data.id}/send`),
        h.api('POST', `/transfer-notes/${created.data.id}/send`),
      ]);
      assert.deepEqual(sent.map((r) => r.status).sort(), [200, 400]);
      assert.equal((await h.stockOf(itemId)).global, 15);

      const received = await Promise.all([
        h.api('POST', `/transfer-notes/${created.data.id}/receive`),
        h.api('POST', `/transfer-notes/${created.data.id}/receive`),
      ]);
      assert.deepEqual(received.map((r) => r.status).sort(), [200, 400]);
      assert.equal((await h.stockOf(itemId)).global, 20);
    });
  });

  describe('entradas y salidas de almacén', () => {
    for (const [path, stockDelta] of [
      ['/goods-receipts', 5],
      ['/goods-issues', -5],
    ] as const) {
      test(`${path}: confirmar dos veces a la vez solo mueve el stock una`, async () => {
        const itemId = await h.seedItem({ stock: 20 });
        const created = await h.api('POST', path, {
          warehouseId: h.warehouseId,
          lines: [{ itemId, quantity: 5 }],
        });
        assert.equal(created.status, 200, JSON.stringify(created.data));
        const results = await Promise.all([
          h.api('POST', `${path}/${created.data.id}/post`),
          h.api('POST', `${path}/${created.data.id}/post`),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
        assert.equal((await h.stockOf(itemId)).global, 20 + stockDelta);
      });
    }
  });
});
