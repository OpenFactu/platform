/**
 * Devolver desde el albarán, sin logística: lo que el cliente trae de un albarán sin facturar,
 * línea a línea. Es la misma entrada ligada que crea logística, así que cuenta igual para el
 * abono, para facturar y para cancelar.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startDocumentsHarness, testDatabaseUrl, type DocumentsHarness } from './documentsHarness';
import { partnerExposure } from '../../partners/creditLimit';

describe('devolver desde el albarán', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;
  let sdnSeries: string;

  before(async () => {
    h = await startDocumentsHarness();
    await h.query(
      `INSERT INTO "DocumentType" (id, code, name, "docCategory", "isRectify", "isActive", "sortOrder")
       VALUES ('dt-rect', 'RECT', 'Rectificativa', 'credit_note', true, true, 1)`,
    );
    const [row] = await h.query(
      `SELECT id FROM "DocumentSeries" WHERE "periodId" = '${h.periodId}' AND "docType" = 'SDN'`,
    );
    sdnSeries = row.id;
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
  const noteLine = async (noteId: string) => {
    const [row] = await h.query(
      `SELECT * FROM "SalesDeliveryNoteLine" WHERE "deliveryId" = '${noteId}'`,
    );
    return row;
  };
  const prepare = (noteId: string) => h.api('GET', `/sales/delivery-notes/${noteId}/return`);
  const giveBack = (
    noteId: string,
    lines: Array<Record<string, unknown>>,
    extra: Record<string, unknown> = {},
  ) =>
    h.api('POST', `/sales/delivery-notes/${noteId}/return`, {
      reason: 'No lo quiere',
      lines,
      ...extra,
    });
  /** Devuelve esta cantidad de la única línea del albarán. */
  const giveBackQty = async (noteId: string, quantity: number) =>
    giveBack(noteId, [{ lineId: (await noteLine(noteId)).id, quantity }]);
  const receiptsOf = (noteId: string) =>
    h.query(`SELECT * FROM "GoodsReceipt" WHERE "sourceDocId" = '${noteId}'`);
  const invoiceOf = (
    note: { id: string; partnerId: string },
    itemId: string,
    quantity: number,
    extra: Record<string, unknown> = {},
  ) =>
    h.invoice(
      'sales',
      [{ itemId, quantity, baseType: 'SDN', baseId: note.id, baseLine: 1, ...extra }],
      { partnerId: note.partnerId },
    );

  describe('lo que puede volver', () => {
    test('dice lo que salió y lo que queda, línea a línea', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const res = await prepare(note.id);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(res.data.problem, null);
      assert.equal(res.data.note.warehouseId, h.warehouseId);
      assert.ok(res.data.note.code, 'sin código');
      const [line] = res.data.lines;
      assert.equal(line.lineId, (await noteLine(note.id)).id);
      assert.equal(line.itemId, item);
      assert.equal(line.pending, 4);
      assert.equal(line.batchNum, null);
    });

    test('un albarán que no existe da 404', async () => {
      assert.equal((await prepare(crypto.randomUUID())).status, 404);
    });

    test('lo que ya volvió no se ofrece', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      assert.equal((await giveBackQty(note.id, 1)).status, 200);
      assert.equal((await prepare(note.id)).data.lines[0].pending, 3);
      assert.equal((await giveBackQty(note.id, 3)).status, 200);
      assert.deepEqual((await prepare(note.id)).data.lines, []);
    });
  });

  describe('la entrada', () => {
    test('entra en el stock en el momento, confirmada y ligada al albarán', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      assert.equal((await h.stockOf(item)).global, 6);
      const res = await giveBackQty(note.id, 1);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.match(res.data.code, /^RET-/);
      assert.equal(res.data.fullyReturned, false);
      assert.deepEqual(await h.stockOf(item), { global: 7, warehouse: 7 });
      const [receipt] = await receiptsOf(note.id);
      assert.equal(receipt.id, res.data.receiptId);
      assert.equal(receipt.status, 'posted');
      assert.equal(receipt.type, 'return');
      assert.equal(receipt.sourceDocType, 'SDN');
      assert.match(receipt.notes, /No lo quiere/);
      const [line] = await h.query(
        `SELECT * FROM "GoodsReceiptLine" WHERE "receiptId" = '${receipt.id}'`,
      );
      assert.equal(line.sourceLineId, (await noteLine(note.id)).id);
      assert.equal(Number(line.quantity), 1);
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
      assert.equal((await giveBackQty(note.id, 4)).status, 200);
      const [move] = await h.query(
        `SELECT kind, "unitCost" FROM "ItemCostMovement" WHERE "itemId" = '${item}' ORDER BY "createdAt" DESC LIMIT 1`,
      );
      assert.equal(move.kind, 'sales_return');
      assert.equal(Number(move.unitCost), 10);
    });

    test('la cantidad va en la unidad de la línea', async () => {
      const item = await h.seedItem({ stock: 100 });
      const note = await newNote(item, 2);
      const line = await noteLine(note.id);
      await h.query(`UPDATE "SalesDeliveryNoteLine" SET "uomFactor" = 12 WHERE id = '${line.id}'`);
      assert.equal((await prepare(note.id)).data.lines[0].pending, 2);
      const before = (await h.stockOf(item)).global;
      assert.equal((await giveBack(note.id, [{ lineId: line.id, quantity: 1 }])).status, 200);
      assert.equal((await h.stockOf(item)).global, before + 12);
      assert.equal((await prepare(note.id)).data.lines[0].pending, 1);
    });

    test('se puede devolver a otro almacén', async () => {
      await h.query(`INSERT INTO "Warehouse" (id, name) VALUES ('wh-otro', 'Otro')`);
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const res = await giveBack(note.id, [{ lineId: (await noteLine(note.id)).id, quantity: 2 }], {
        warehouseId: 'wh-otro',
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const stockIn = async (warehouseId: string) => {
        const [row] = await h.query(
          `SELECT stock FROM "ItemWarehouseStock" WHERE "itemId" = '${item}' AND "warehouseId" = '${warehouseId}'`,
        );
        return Number(row.stock);
      };
      assert.equal(await stockIn(h.warehouseId), 6, 'el del albarán no cambia');
      assert.equal(await stockIn('wh-otro'), 2);
    });

    test('un almacén que no existe se rechaza sin escribir nada', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const res = await giveBack(note.id, [{ lineId: (await noteLine(note.id)).id, quantity: 2 }], {
        warehouseId: 'no-existe',
      });
      assert.equal(res.status, 400, JSON.stringify(res.data));
      assert.deepEqual(await receiptsOf(note.id), []);
    });

    test('queda en la auditoría quién lo devolvió y por qué', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      assert.equal((await giveBackQty(note.id, 1)).status, 200);
      const [row] = await h.query(
        `SELECT action, "newValue" FROM public."AuditLog" WHERE "entityId" = '${note.id}' AND action = 'RETURN'`,
      );
      assert.ok(row, 'sin auditoría');
      const value = typeof row.newValue === 'string' ? JSON.parse(row.newValue) : row.newValue;
      assert.equal(value.reason, 'No lo quiere');
    });
  });

  describe('lo que se rechaza', () => {
    test('más de lo que queda, ni en dos veces', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      assert.equal((await giveBackQty(note.id, 5)).status, 409);
      assert.equal((await giveBackQty(note.id, 3)).status, 200);
      const again = await giveBackQty(note.id, 2);
      assert.equal(again.status, 409, JSON.stringify(again.data));
      assert.match(again.data.error, /quedan? 1/);
      assert.equal((await h.stockOf(item)).global, 9);
    });

    for (const [name, change] of [
      ['cantidad cero', { quantity: 0 }],
      ['cantidad negativa', { quantity: -1 }],
      ['cantidad que no es un número', { quantity: 'mucha' }],
    ] as const) {
      test(name, async () => {
        const item = await h.seedItem({ stock: 10 });
        const note = await newNote(item);
        const res = await giveBack(note.id, [{ lineId: (await noteLine(note.id)).id, ...change }]);
        assert.equal(res.status, 400, JSON.stringify(res.data));
        assert.deepEqual(await receiptsOf(note.id), []);
      });
    }

    test('la misma línea dos veces tampoco pasa de lo que queda', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const lineId = (await noteLine(note.id)).id;
      const res = await giveBack(note.id, [
        { lineId, quantity: 3 },
        { lineId, quantity: 3 },
      ]);
      assert.equal(res.status, 409, JSON.stringify(res.data));
      assert.equal((await h.stockOf(item)).global, 6);
    });

    test('una línea de otro albarán', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const other = await newNote(item);
      const res = await giveBack(note.id, [{ lineId: (await noteLine(other.id)).id, quantity: 1 }]);
      assert.equal(res.status, 400, JSON.stringify(res.data));
    });

    test('sin motivo o sin líneas', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const lineId = (await noteLine(note.id)).id;
      assert.equal(
        (await giveBack(note.id, [{ lineId, quantity: 1 }], { reason: '  ' })).status,
        400,
      );
      assert.equal((await giveBack(note.id, [])).status, 400);
      assert.equal((await h.stockOf(item)).global, 6);
    });

    test('un albarán cancelado', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      assert.equal((await h.api('POST', `/documents/SDN/${note.id}/cancel`)).status, 200);
      const res = await giveBackQty(note.id, 1);
      assert.equal(res.status, 409, JSON.stringify(res.data));
      assert.ok((await prepare(note.id)).data.problem, 'la pantalla tiene que decirlo');
    });

    test('un albarán facturado: eso va con el abono', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      await invoiceOf(note, item, 4);
      const res = await giveBackQty(note.id, 1);
      assert.equal(res.status, 409, JSON.stringify(res.data));
      assert.match(res.data.error, /abono/);
    });

    test('con un envío en marcha: la mercancía todavía no ha llegado al cliente', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const prep = await h.api('POST', `/logistics/prep/from-sdn/${note.id}`);
      assert.equal(prep.status, 200, JSON.stringify(prep.data));
      const res = await giveBackQty(note.id, 1);
      assert.equal(res.status, 409, JSON.stringify(res.data));
      assert.match(res.data.error, /envío/);
    });

    test('con el envío ya entregado, sí', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const prep = await h.api('POST', `/logistics/prep/from-sdn/${note.id}`);
      await h.query(
        `UPDATE "Shipment" SET status = 'delivered', "preparationStatus" = 'delivered' WHERE id = '${prep.data.shipmentId}'`,
      );
      assert.equal((await giveBackQty(note.id, 1)).status, 200);
      const rest = await h.api('POST', `/logistics/shipments/${prep.data.shipmentId}/return`, {
        reason: 'El resto',
      });
      assert.equal(rest.status, 200, JSON.stringify(rest.data));
      const lines = await h.query(
        `SELECT quantity FROM "GoodsReceiptLine" WHERE "receiptId" = '${rest.data.receiptId}'`,
      );
      assert.equal(Number(lines[0].quantity), 3, 'lo ya devuelto no vuelve otra vez');
    });

    test('dos a la vez no pasan de lo que queda', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const results = await Promise.all([giveBackQty(note.id, 3), giveBackQty(note.id, 3)]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await h.stockOf(item)).global, 9);
    });
  });

  describe('con lotes', () => {
    const batchedNote = async () => {
      const item = await h.seedItem({ stock: 0, manageBy: 'B' });
      const batches = [
        { batchNum: 'A', quantity: 2 },
        { batchNum: 'B', quantity: 2 },
      ];
      await h.post(
        'purchase',
        await h.invoice('purchase', [
          { itemId: item, quantity: 4, price: 10, batchDetails: batches },
        ]),
      );
      const note = await newNote(item, 4, { batchDetails: batches });
      return { item, note, lineId: (await noteLine(note.id)).id as string };
    };
    const batchStock = async (item: string, batch: string) => {
      const [row] = await h.query(
        `SELECT quantity FROM "ItemBatchStock" WHERE "itemId" = '${item}' AND "batchNum" = '${batch}'`,
      );
      return Number(row.quantity);
    };

    test('se elige de qué lote vuelve', async () => {
      const { item, note, lineId } = await batchedNote();
      const rows = (await prepare(note.id)).data.lines;
      assert.deepEqual(
        rows.map((row: any) => [row.batchNum, row.pending]),
        [
          ['A', 2],
          ['B', 2],
        ],
      );
      const res = await giveBack(note.id, [{ lineId, batchNum: 'B', quantity: 1 }]);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(await batchStock(item, 'B'), 1);
      assert.equal(await batchStock(item, 'A'), 0);
      const after = (await prepare(note.id)).data.lines;
      assert.deepEqual(
        after.map((row: any) => [row.batchNum, row.pending]),
        [
          ['A', 2],
          ['B', 1],
        ],
      );
    });

    test('sin decir el lote, o de uno que no salió, no vale', async () => {
      const { note, lineId } = await batchedNote();
      assert.equal((await giveBack(note.id, [{ lineId, quantity: 1 }])).status, 400);
      assert.equal((await giveBack(note.id, [{ lineId, batchNum: 'Z', quantity: 1 }])).status, 400);
    });

    test('un lote no pasa de lo que salió de él', async () => {
      const { note, lineId } = await batchedNote();
      assert.equal((await giveBack(note.id, [{ lineId, batchNum: 'A', quantity: 3 }])).status, 409);
    });
  });

  describe('con las ubicaciones obligatorias', () => {
    test('pide ubicación del almacén al que vuelve', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const line = await noteLine(note.id);
      await h.query(
        `INSERT INTO "WarehouseZone" (id, "warehouseId", name) VALUES ('zona-dev', '${h.warehouseId}', 'Pasillo')`,
      );
      await h.query(
        `INSERT INTO "SystemConfig" (id, key, value) VALUES ('cfg-zonas-dev', 'enforceWarehouseZones', 'true')`,
      );
      try {
        const lines = [{ lineId: line.id, quantity: 1 }];
        const missing = await giveBack(note.id, lines);
        assert.equal(missing.status, 400, JSON.stringify(missing.data));
        assert.match(missing.data.error, /ubicación/);
        const foreign = await giveBack(note.id, lines, { zoneId: 'zona-de-nadie' });
        assert.equal(foreign.status, 400, JSON.stringify(foreign.data));
        const res = await giveBack(note.id, lines, { zoneId: 'zona-dev' });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        const [row] = await h.query(
          `SELECT "zoneId" FROM "GoodsReceiptLine" WHERE "receiptId" = '${res.data.receiptId}'`,
        );
        assert.equal(row.zoneId, 'zona-dev');
      } finally {
        await h.query(`DELETE FROM "SystemConfig" WHERE id = 'cfg-zonas-dev'`);
      }
    });
  });

  describe('después', () => {
    test('solo se factura lo que queda', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      assert.equal((await giveBackQty(note.id, 1)).status, 200);
      const tooMuch = await h.api('POST', '/documents/SINV', {
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
      assert.equal(tooMuch.status, 409, JSON.stringify(tooMuch.data));
      assert.ok(await invoiceOf(note, item, 3));
    });

    test('el abono de lo facturado puede devolver todo lo facturado', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      assert.equal((await giveBackQty(note.id, 1)).status, 200);
      const invoice = await invoiceOf(note, item, 3);
      await h.post('sales', invoice);

      const prepared = await h.api('GET', `/sales/invoices/${invoice}/credit-note`);
      assert.equal(prepared.status, 200, JSON.stringify(prepared.data));
      const [line] = prepared.data.lines;
      assert.equal(line.returnable, 3, 'lo devuelto antes de facturar no resta de lo facturado');
      assert.equal(line.returnedUncredited, 0);

      const summary = await h.api('GET', `/sales/invoices/${invoice}/credit-notes`);
      assert.equal(summary.data.pendingReturn, 0, 'esa factura no tiene nada que corregir');

      const credit = await h.api('POST', `/sales/invoices/${invoice}/credit-note`, {
        reason: 'Devuelve el resto',
        lines: [{ lineId: line.lineId, quantity: 3, returnStock: true }],
      });
      assert.equal(credit.status, 200, JSON.stringify(credit.data));
      await h.post('sales', credit.data.id);
      assert.equal((await h.stockOf(item)).global, 10, 'vuelve todo, y una sola vez');
    });

    test('el abono tampoco pasa de lo que sigue fuera', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const invoice = await invoiceOf(note, item, 4);
      await h.post('sales', invoice);
      // Logística: la entrada llega con la factura ya emitida.
      const prep = await h.api('POST', `/logistics/prep/from-sdn/${note.id}`);
      await h.query(
        `UPDATE "Shipment" SET status = 'delivered', "preparationStatus" = 'delivered' WHERE id = '${prep.data.shipmentId}'`,
      );
      await h.api('POST', `/logistics/shipments/${prep.data.shipmentId}/return`, {
        reason: 'Rechazado',
      });
      const prepared = await h.api('GET', `/sales/invoices/${invoice}/credit-note`);
      const [line] = prepared.data.lines;
      assert.equal(line.returnable, 0);
      assert.equal(line.returnedUncredited, 4, 'esto sí está sin corregir');
    });

    test('con una parte devuelta no se cancela, y dice cómo', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      assert.equal((await giveBackQty(note.id, 1)).status, 200);
      const res = await h.api('POST', `/documents/SDN/${note.id}/cancel`);
      assert.equal(res.status, 409, JSON.stringify(res.data));
      assert.match(res.data.error, /devuelve también el resto/);
    });

    test('devuelto todo, cancelarlo no mete el stock otra vez', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      assert.equal((await giveBackQty(note.id, 1)).status, 200);
      const rest = await giveBackQty(note.id, 3);
      assert.equal(rest.data.fullyReturned, true);
      const res = await h.api('POST', `/documents/SDN/${note.id}/cancel`, { reason: 'Devuelto' });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.deepEqual(await h.stockOf(item), { global: 10, warehouse: 10 });
    });

    test('lo devuelto deja de contar para el límite de crédito', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const before = (await partnerExposure(h.db, note.partnerId)).deliveryNotes;
      assert.ok(before > 0);
      assert.equal((await giveBackQty(note.id, 1)).status, 200);
      const partly = (await partnerExposure(h.db, note.partnerId)).deliveryNotes;
      assert.equal(partly, Math.round(before * 75) / 100);
      assert.equal((await giveBackQty(note.id, 3)).status, 200);
      assert.equal((await partnerExposure(h.db, note.partnerId)).deliveryNotes, 0);
    });

    test('lo que devuelve logística tampoco cuenta para el crédito', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const prep = await h.api('POST', `/logistics/prep/from-sdn/${note.id}`);
      await h.query(
        `UPDATE "Shipment" SET status = 'delivered', "preparationStatus" = 'delivered' WHERE id = '${prep.data.shipmentId}'`,
      );
      await h.api('POST', `/logistics/shipments/${prep.data.shipmentId}/return`, {
        reason: 'Rechazado',
      });
      assert.equal((await partnerExposure(h.db, note.partnerId)).deliveryNotes, 0);
    });

    test('la ficha del albarán dice lo que ha vuelto', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await newNote(item);
      const { data } = await giveBackQty(note.id, 1);
      const detail = await h.api('GET', `/sales/delivery-notes/${note.id}`);
      assert.equal(detail.status, 200, JSON.stringify(detail.data));
      assert.equal(detail.data.returnReceipts[0].code, data.code);
      assert.equal(detail.data.lines[0].returnedQty, 1);
      assert.equal(detail.data.fullyReturned, false);
    });
  });
});
