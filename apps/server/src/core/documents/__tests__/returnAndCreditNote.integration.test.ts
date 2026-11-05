/**
 * La devolución de logística y el abono hablan de la misma mercancía: lo que vuelve por un
 * camino no puede volver por el otro, y lo devuelto no se factura ni se devuelve al cancelar.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startDocumentsHarness, testDatabaseUrl, type DocumentsHarness } from './documentsHarness';

// Las pruebas no salen a internet: el geocodificador se queda sin respuesta.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
  return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

describe('la devolución de logística y el abono', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;
  let sdnSeries: string;
  let pdnSeries: string;

  before(async () => {
    h = await startDocumentsHarness();
    await h.query(
      `INSERT INTO "DocumentType" (id, code, name, "docCategory", "isRectify", "isActive", "sortOrder")
       VALUES ('dt-rect', 'RECT', 'Rectificativa', 'credit_note', true, true, 1)`,
    );
    const rows = await h.query(
      `SELECT id, "docType" FROM "DocumentSeries" WHERE "periodId" = '${h.periodId}' AND "docType" IN ('SDN', 'PDN')`,
    );
    sdnSeries = rows.find((r) => r.docType === 'SDN').id;
    pdnSeries = rows.find((r) => r.docType === 'PDN').id;
  });
  after(async () => {
    await h?.close();
  });

  const newNote = async (itemId: string, quantity = 4, extra: Record<string, unknown> = {}) => {
    const partnerId = await h.seedPartner();
    const res = await h.api('POST', '/documents/SDN', {
      seriesId: sdnSeries,
      periodId: h.periodId,
      partnerId,
      date: '2026-06-15',
      warehouseId: h.warehouseId,
      lines: [{ itemId, quantity, price: 10, taxGroupId: h.tax.general, ...extra }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return { id: res.data.id as string, partnerId };
  };
  const invoiceOf = (
    note: { id: string; partnerId: string },
    itemId: string,
    quantity = 4,
    extra: Record<string, unknown> = {},
  ) =>
    h.invoice(
      'sales',
      [{ itemId, quantity, baseType: 'SDN', baseId: note.id, baseLine: 1, ...extra }],
      { partnerId: note.partnerId },
    );
  /** El envío de un albarán, ya entregado: lo único que puede devolverse. */
  const delivered = async (noteId: string) => {
    const prep = await h.api('POST', `/logistics/prep/from-sdn/${noteId}`);
    assert.equal(prep.status, 200, JSON.stringify(prep.data));
    const { shipmentId } = prep.data;
    await h.query(
      `UPDATE "Shipment" SET status = 'delivered', "preparationStatus" = 'delivered' WHERE id = '${shipmentId}'`,
    );
    return shipmentId as string;
  };
  const giveBack = async (noteId: string, body: Record<string, unknown> = {}) => {
    const shipmentId = await delivered(noteId);
    const res = await h.api('POST', `/logistics/shipments/${shipmentId}/return`, {
      reason: 'Rechazado',
      ...body,
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data;
  };
  const postReceipt = async (id: string) => {
    const res = await h.api('POST', `/goods-receipts/${id}/post`);
    assert.equal(res.status, 200, JSON.stringify(res.data));
  };
  const receiptLines = (id: string) =>
    h.query(`SELECT * FROM "GoodsReceiptLine" WHERE "receiptId" = '${id}' ORDER BY "lineNum"`);
  const lineOf = async (table: string, fk: string, id: string) => {
    const [row] = await h.query(`SELECT * FROM "${table}" WHERE "${fk}" = '${id}'`);
    return row;
  };
  const credit = async (invoiceId: string, quantity: number, returnStock: boolean) =>
    h.api('POST', `/sales/invoices/${invoiceId}/credit-note`, {
      reason: 'Devolución',
      lines: [
        {
          lineId: (await lineOf('SalesInvoiceLine', 'invoiceId', invoiceId)).id,
          quantity,
          returnStock,
        },
      ],
    });
  const averageOf = async (itemId: string) => {
    const [row] = await h.query(`SELECT "averageCost" FROM "Item" WHERE id = '${itemId}'`);
    return Number(row.averageCost);
  };

  describe('la entrada de mercancía', () => {
    test('queda ligada al albarán, línea a línea', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const { receiptId } = await giveBack(note.id);
      const [receipt] = await h.query(`SELECT * FROM "GoodsReceipt" WHERE id = '${receiptId}'`);
      assert.equal(receipt.sourceDocType, 'SDN');
      assert.equal(receipt.sourceDocId, note.id);
      const [line] = await receiptLines(receiptId);
      const noteLine = await lineOf('SalesDeliveryNoteLine', 'deliveryId', note.id);
      assert.equal(line.sourceLineId, noteLine.id);
      assert.equal(Number(line.quantity), 4);
    });

    test('vuelve al coste con el que salió', async () => {
      const item = await h.seedItem({ stock: 0 });
      await h.post(
        'purchase',
        await h.invoice('purchase', [{ itemId: item, quantity: 10, price: 10 }]),
      );
      const note = await newNote(item);
      await h.post(
        'purchase',
        await h.invoice('purchase', [{ itemId: item, quantity: 6, price: 30 }]),
      );
      assert.equal(await averageOf(item), 20);
      const { receiptId } = await giveBack(note.id);
      assert.equal(Number((await receiptLines(receiptId))[0].unitCost), 10);
      await postReceipt(receiptId);
      assert.equal((await h.stockOf(item)).global, 16);
      assert.equal(await averageOf(item), 17.5);
      const [move] = await h.query(
        `SELECT kind FROM "ItemCostMovement" WHERE "itemId" = '${item}' ORDER BY "createdAt" DESC LIMIT 1`,
      );
      assert.equal(move.kind, 'sales_return');
    });

    test('un envío sin albarán sigue dando una entrada vacía', async () => {
      const shipment = await h.api('POST', '/logistics/shipments', {
        destinationAddress: 'Calle Mayor 1, Madrid',
      });
      assert.equal(shipment.status, 200, JSON.stringify(shipment.data));
      await h.query(
        `UPDATE "Shipment" SET status = 'delivered', "preparationStatus" = 'delivered' WHERE id = '${shipment.data.id}'`,
      );
      const res = await h.api('POST', `/logistics/shipments/${shipment.data.id}/return`, {
        warehouseId: h.warehouseId,
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal((await receiptLines(res.data.receiptId)).length, 0);
    });
  });

  describe('no vuelve dos veces', () => {
    test('lo que vuelve por logística no se devuelve con el abono', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const invoice = await invoiceOf(note, item);
      await h.post('sales', invoice);
      await giveBack(note.id);
      const res = await credit(invoice, 4, true);
      assert.equal(res.status, 409, JSON.stringify(res.data));
      assert.match(res.data.error, /logística/);
    });

    test('el abono sin devolver sí se hace', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const invoice = await invoiceOf(note, item);
      await h.post('sales', invoice);
      const { receiptId } = await giveBack(note.id);
      await postReceipt(receiptId);
      const res = await credit(invoice, 4, false);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      await h.post('sales', res.data.id);
      assert.equal((await h.stockOf(item)).global, 10);
    });

    test('lo que ya volvió con un abono no entra otra vez por logística', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const invoice = await invoiceOf(note, item);
      await h.post('sales', invoice);
      const partial = await credit(invoice, 1, true);
      assert.equal(partial.status, 200, JSON.stringify(partial.data));
      const { receiptId } = await giveBack(note.id);
      assert.equal(Number((await receiptLines(receiptId))[0].quantity), 3);
    });

    test('si ya volvió todo con un abono, no se crea entrada', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const invoice = await invoiceOf(note, item);
      await h.post('sales', invoice);
      const full = await credit(invoice, 4, true);
      assert.equal(full.status, 200, JSON.stringify(full.data));
      const result = await giveBack(note.id);
      assert.equal(result.receiptId, null);
      assert.equal(result.alreadyReturned, true);
    });

    test('un abono cancelado no cuenta', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const invoice = await invoiceOf(note, item);
      await h.post('sales', invoice);
      const draft = await credit(invoice, 4, true);
      await h.api('POST', `/sales/invoices/${draft.data.id}/cancel`);
      const { receiptId } = await giveBack(note.id);
      assert.equal(Number((await receiptLines(receiptId))[0].quantity), 4);
    });

    test('borrar la entrada en borrador deja devolver con el abono', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const invoice = await invoiceOf(note, item);
      await h.post('sales', invoice);
      const { receiptId } = await giveBack(note.id);
      assert.equal((await h.api('DELETE', `/goods-receipts/${receiptId}`)).status, 200);
      const res = await credit(invoice, 4, true);
      assert.equal(res.status, 200, JSON.stringify(res.data));
    });

    test('con lotes, cada uno vuelve una vez', async () => {
      const item = await h.seedItem({ stock: 0, manageBy: 'B' });
      const buy = await h.invoice('purchase', [
        {
          itemId: item,
          quantity: 4,
          price: 10,
          batchDetails: [
            { batchNum: 'A', quantity: 2 },
            { batchNum: 'B', quantity: 2 },
          ],
        },
      ]);
      await h.post('purchase', buy);
      const note = await newNote(item, 4, {
        batchDetails: [
          { batchNum: 'A', quantity: 2 },
          { batchNum: 'B', quantity: 2 },
        ],
      });
      const invoice = await invoiceOf(note, item, 4, {
        batchDetails: [
          { batchNum: 'A', quantity: 2 },
          { batchNum: 'B', quantity: 2 },
        ],
      });
      await h.post('sales', invoice);
      assert.equal((await credit(invoice, 3, true)).status, 200);
      const { receiptId } = await giveBack(note.id);
      const lines = await receiptLines(receiptId);
      assert.deepEqual(
        lines.map((l) => [l.batchNum, Number(l.quantity)]),
        [['B', 1]],
      );
    });

    test('un artículo en otra unidad cuenta bien', async () => {
      const item = await h.seedItem({ stock: 100 });
      const note = await newNote(item, 2, { uomFactor: 5 });
      const invoice = await h.invoice(
        'sales',
        [
          {
            itemId: item,
            quantity: 2,
            uomFactor: 5,
            baseType: 'SDN',
            baseId: note.id,
            baseLine: 1,
          },
        ],
        { partnerId: note.partnerId },
      );
      await h.post('sales', invoice);
      const { receiptId } = await giveBack(note.id);
      assert.equal(Number((await receiptLines(receiptId))[0].quantity), 10);
      const preparation = await h.api('GET', `/sales/invoices/${invoice}/credit-note`);
      assert.equal(preparation.data.lines[0].returnedByLogistics, 2);
      assert.equal(preparation.data.lines[0].returnable, 0);
    });
  });

  describe('lo que ofrece', () => {
    test('la devolución dice qué factura se ha quedado sin corregir', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const invoice = await invoiceOf(note, item);
      await h.post('sales', invoice);
      const result = await giveBack(note.id);
      assert.equal(result.invoice.id, invoice);
      assert.equal(result.invoice.status, 'O');
      assert.ok(result.invoice.code);
    });

    test('también si está en borrador', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const invoice = await invoiceOf(note, item);
      const result = await giveBack(note.id);
      assert.equal(result.invoice.id, invoice);
      assert.equal(result.invoice.status, 'D');
    });

    test('sin factura, nada', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      assert.equal((await giveBack(note.id)).invoice, null);
    });

    test('la factura avisa de lo que falta abonar, hasta que se abona', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const invoice = await invoiceOf(note, item);
      await h.post('sales', invoice);
      await giveBack(note.id);
      const pending = await h.api('GET', `/sales/invoices/${invoice}/credit-notes`);
      assert.equal(pending.data.pendingReturn, 4);
      assert.equal((await credit(invoice, 4, false)).status, 200);
      const done = await h.api('GET', `/sales/invoices/${invoice}/credit-notes`);
      assert.equal(done.data.pendingReturn, 0);
    });
  });

  describe('el albarán', () => {
    test('lo devuelto no se factura', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      await giveBack(note.id);
      const res = await h.api('POST', '/sales/invoices', {
        seriesId: h.seriesId.sales,
        periodId: h.periodId,
        partnerId: note.partnerId,
        date: '2026-06-15',
        warehouseId: h.warehouseId,
        lines: [
          {
            itemId: item,
            quantity: 4,
            price: 10,
            taxGroupId: h.tax.general,
            baseType: 'SDN',
            baseId: note.id,
            baseLine: 1,
          },
        ],
      });
      assert.equal(res.status, 409, JSON.stringify(res.data));
      assert.match(res.data.error, /vuelto/);
    });

    test('lo que no ha vuelto, sí', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const { receiptId } = await giveBack(note.id);
      await h.query(
        `UPDATE "GoodsReceiptLine" SET quantity = 1 WHERE "receiptId" = '${receiptId}'`,
      );
      const body = (quantity: number) => ({
        seriesId: h.seriesId.sales,
        periodId: h.periodId,
        partnerId: note.partnerId,
        date: '2026-06-15',
        warehouseId: h.warehouseId,
        lines: [
          {
            itemId: item,
            quantity,
            price: 10,
            taxGroupId: h.tax.general,
            baseType: 'SDN',
            baseId: note.id,
            baseLine: 1,
          },
        ],
      });
      assert.equal((await h.api('POST', '/sales/invoices', body(4))).status, 409);
      assert.equal((await h.api('POST', '/sales/invoices', body(3))).status, 200);
    });

    test('la ficha dice lo que ha vuelto y con qué entrada', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const { receiptId } = await giveBack(note.id);
      const detail = await h.api('GET', `/documents/SDN/${note.id}`);
      assert.equal(detail.data.returnReceipts[0].id, receiptId);
      assert.equal(detail.data.lines[0].returnedQty, 4);
      assert.equal(detail.data.fullyReturned, true);
    });

    test('cancelarlo con todo devuelto no devuelve el stock otra vez', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const { receiptId } = await giveBack(note.id);
      await postReceipt(receiptId);
      assert.equal((await h.stockOf(item)).global, 10);
      const res = await h.api('POST', `/documents/SDN/${note.id}/cancel`, { reason: 'Devuelto' });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.deepEqual(await h.stockOf(item), { global: 10, warehouse: 10 });
    });

    test('con una parte devuelta, no se cancela', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const { receiptId } = await giveBack(note.id);
      await h.query(
        `UPDATE "GoodsReceiptLine" SET quantity = 1 WHERE "receiptId" = '${receiptId}'`,
      );
      const res = await h.api('POST', `/documents/SDN/${note.id}/cancel`);
      assert.equal(res.status, 409, JSON.stringify(res.data));
      assert.match(res.data.error, /vuelto/);
    });

    test('anularlo al devolver deja rastro', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const result = await giveBack(note.id, { cancelDeliveryNote: true, reason: 'Rechazado' });
      assert.equal(result.deliveryNoteCancelled, true);
      const [row] = await h.query(
        `SELECT status, "cancelledAt", "cancelReason" FROM "SalesDeliveryNote" WHERE id = '${note.id}'`,
      );
      assert.equal(row.status, 'X');
      assert.ok(row.cancelledAt, 'sin fecha');
      assert.equal(row.cancelReason, 'Rechazado');
      assert.equal((await h.stockOf(item)).global, 6, 'la mercancía vuelve con la entrada');
    });

    test('lo devuelto no se vuelve a preparar: saldría sin descontar el stock', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      await giveBack(note.id);
      const again = await h.api('POST', `/logistics/prep/from-sdn/${note.id}`);
      assert.equal(again.status, 409, JSON.stringify(again.data));
      assert.match(again.data.error, /ha vuelto/);
    });

    test('borrada la entrada, el envío se puede preparar otra vez', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const { receiptId } = await giveBack(note.id);
      assert.equal((await h.api('DELETE', `/goods-receipts/${receiptId}`)).status, 200);
      const again = await h.api('POST', `/logistics/prep/from-sdn/${note.id}`);
      assert.equal(again.status, 200, JSON.stringify(again.data));
    });

    test('la entrada de un albarán anulado no se puede borrar', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const { receiptId } = await giveBack(note.id, { cancelDeliveryNote: true });
      const res = await h.api('DELETE', `/goods-receipts/${receiptId}`);
      assert.equal(res.status, 409, JSON.stringify(res.data));
    });
  });

  describe('una compra devuelta', () => {
    const purchaseNote = async (itemId: string) => {
      const res = await h.api('POST', '/documents/PDN', {
        seriesId: pdnSeries,
        periodId: h.periodId,
        partnerId: await h.seedPartner(),
        date: '2026-06-15',
        warehouseId: h.warehouseId,
        lines: [{ itemId, quantity: 4, price: 10, taxGroupId: h.tax.general }],
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return res.data.id as string;
    };
    const shipmentOfPdn = async (noteId: string) => {
      const prep = await h.api('POST', `/logistics/prep/from-pdn/${noteId}`);
      assert.equal(prep.status, 200, JSON.stringify(prep.data));
      await h.query(
        `UPDATE "Shipment" SET status = 'in_transit', "preparationStatus" = 'in_transit' WHERE id = '${prep.data.shipmentId}'`,
      );
      return prep.data.shipmentId as string;
    };

    test('no mete otra vez la mercancía', async () => {
      const item = await h.seedItem({ stock: 0 });
      const noteId = await purchaseNote(item);
      assert.equal((await h.stockOf(item)).global, 4);
      const shipmentId = await shipmentOfPdn(noteId);
      const res = await h.api('POST', `/logistics/shipments/${shipmentId}/return`, {});
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(res.data.receiptId, null);
    });

    test('anularla saca lo que metió', async () => {
      const item = await h.seedItem({ stock: 0 });
      const noteId = await purchaseNote(item);
      const shipmentId = await shipmentOfPdn(noteId);
      const res = await h.api('POST', `/logistics/shipments/${shipmentId}/return`, {
        cancelDeliveryNote: true,
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(res.data.deliveryNoteCancelled, true);
      assert.deepEqual(await h.stockOf(item), { global: 0, warehouse: 0 });
    });
  });

  test('una entrada manual no toca nada de esto', async () => {
    const item = await h.seedItem({ stock: 10 });
    const res = await h.api('POST', '/goods-receipts', {
      warehouseId: h.warehouseId,
      type: 'return',
      lines: [{ itemId: item, quantity: 1 }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const [row] = await h.query(
      `SELECT "sourceDocId" FROM "GoodsReceipt" WHERE id = '${res.data.id}'`,
    );
    assert.equal(row.sourceDocId, null);
    assert.ok(crypto.randomUUID());
  });
});
