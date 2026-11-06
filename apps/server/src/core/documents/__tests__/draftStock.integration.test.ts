/**
 * Un borrador de factura no ha pasado todavía: ni stock, ni coste, ni lotes. Todo eso ocurre
 * al asentarla. Y cancelar lo que sí tuvo efectos en un periodo cerrado no reescribe el pasado.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startDocumentsHarness, testDatabaseUrl, type DocumentsHarness } from './documentsHarness';

describe('el stock de una factura se mueve al asentarla', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;

  before(async () => {
    h = await startDocumentsHarness();
    await h.query(
      `INSERT INTO "DocumentType" (id, code, name, "docCategory", "isRectify", "isActive", "sortOrder")
       VALUES ('dt-rect', 'RECT', 'Rectificativa', 'credit_note', true, true, 1)`,
    );
  });
  after(async () => {
    await h?.close();
  });

  const averageOf = async (itemId: string) => {
    const [row] = await h.query(`SELECT "averageCost" FROM "Item" WHERE id = '${itemId}'`);
    return Number(row.averageCost ?? 0);
  };
  const statusOf = async (table: string, id: string) => {
    const [row] = await h.query(`SELECT status, "isLocked" FROM "${table}" WHERE id = '${id}'`);
    return row;
  };
  const lineOf = async (table: string, id: string) => {
    const [row] = await h.query(`SELECT * FROM "${table}Line" WHERE "invoiceId" = '${id}'`);
    return row;
  };
  const setFlag = async (key: string, value: boolean) => {
    await h.query(`DELETE FROM "SystemConfig" WHERE key = '${key}'`);
    await h.query(
      `INSERT INTO "SystemConfig" (id, key, value) VALUES ('${crypto.randomUUID()}', '${key}', '${value}')`,
    );
  };
  const batchesOf = async (itemId: string) => {
    const rows = await h.query(
      `SELECT "batchNum", quantity, "expiryDate"::date::text AS expiry FROM "ItemBatch" WHERE "itemId" = '${itemId}' ORDER BY "batchNum"`,
    );
    return rows.map((r) => ({ ...r, quantity: Number(r.quantity) }));
  };

  describe('venta', () => {
    test('el borrador no saca nada', async () => {
      const item = await h.seedItem({ stock: 10 });
      await h.invoice('sales', [{ itemId: item, quantity: 4 }]);
      assert.deepEqual(await h.stockOf(item), { global: 10, warehouse: 10 });
    });

    test('al asentarla, sale', async () => {
      const item = await h.seedItem({ stock: 10 });
      const id = await h.invoice('sales', [{ itemId: item, quantity: 4 }]);
      await h.post('sales', id);
      assert.deepEqual(await h.stockOf(item), { global: 6, warehouse: 6 });
    });

    test('cancelar el borrador no toca el stock', async () => {
      const item = await h.seedItem({ stock: 10 });
      const id = await h.invoice('sales', [{ itemId: item, quantity: 4 }]);
      const cancelled = await h.api('POST', `/sales/invoices/${id}/cancel`);
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
      assert.deepEqual(await h.stockOf(item), { global: 10, warehouse: 10 });
    });

    test('sin stock se guarda el borrador, pero no se asienta', async () => {
      const item = await h.seedItem({ stock: 1 });
      const id = await h.invoice('sales', [{ itemId: item, quantity: 5 }]);
      const posted = await h.api('POST', `/sales/invoices/${id}/post`);
      assert.equal(posted.status, 409, JSON.stringify(posted.data));
      assert.match(posted.data.error, /Stock insuficiente/);
      const row = await statusOf('SalesInvoice', id);
      assert.equal(row.status, 'D');
      assert.equal(row.isLocked, false);
      assert.equal(await h.entryOf(id), null);
      assert.deepEqual(await h.stockOf(item), { global: 1, warehouse: 1 });
    });

    test('de dos borradores por la última unidad, solo se asienta uno', async () => {
      const item = await h.seedItem({ stock: 1 });
      const first = await h.invoice('sales', [{ itemId: item, quantity: 1 }]);
      const second = await h.invoice('sales', [{ itemId: item, quantity: 1 }]);
      const results = await Promise.all([
        h.api('POST', `/sales/invoices/${first}/post`),
        h.api('POST', `/sales/invoices/${second}/post`),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.deepEqual(await h.stockOf(item), { global: 0, warehouse: 0 });
    });

    test('dos veces a la vez la misma, sale una sola vez', async () => {
      const item = await h.seedItem({ stock: 10 });
      const id = await h.invoice('sales', [{ itemId: item, quantity: 4 }]);
      const results = await Promise.all([
        h.api('POST', `/sales/invoices/${id}/post`),
        h.api('POST', `/sales/invoices/${id}/post`),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
      assert.deepEqual(await h.stockOf(item), { global: 6, warehouse: 6 });
    });

    test('lleva el coste que hay al salir, no el de cuando se creó', async () => {
      const item = await h.seedItem({ stock: 10 });
      await h.query(`UPDATE "Item" SET "averageCost" = 5 WHERE id = '${item}'`);
      const id = await h.invoice('sales', [{ itemId: item, quantity: 1 }]);
      await h.query(`UPDATE "Item" SET "averageCost" = 7 WHERE id = '${item}'`);
      await h.post('sales', id);
      assert.equal(Number((await lineOf('SalesInvoice', id)).unitCost), 7);
    });

    test('con varias líneas, si una no cabe no sale ninguna', async () => {
      const plenty = await h.seedItem({ stock: 10 });
      const scarce = await h.seedItem({ stock: 1 });
      const id = await h.invoice('sales', [
        { itemId: plenty, quantity: 2 },
        { itemId: scarce, quantity: 5 },
      ]);
      assert.equal((await h.api('POST', `/sales/invoices/${id}/post`)).status, 409);
      assert.deepEqual(await h.stockOf(plenty), { global: 10, warehouse: 10 });
    });

    test('la de un albarán no vuelve a sacar nada', async () => {
      const item = await h.seedItem({ stock: 10 });
      const [series] = await h.query(
        `SELECT id FROM "DocumentSeries" WHERE "docType" = 'SDN' AND "periodId" = '${h.periodId}'`,
      );
      const partnerId = await h.seedPartner();
      const note = await h.api('POST', '/documents/SDN', {
        seriesId: series.id,
        periodId: h.periodId,
        partnerId,
        date: '2026-06-15',
        warehouseId: h.warehouseId,
        lines: [{ itemId: item, quantity: 3, price: 10, taxGroupId: h.tax.general }],
      });
      assert.equal(note.status, 200, JSON.stringify(note.data));
      assert.deepEqual(await h.stockOf(item), { global: 7, warehouse: 7 });
      const id = await h.invoice(
        'sales',
        [{ itemId: item, quantity: 3, baseType: 'SDN', baseId: note.data.id, baseLine: 1 }],
        { partnerId },
      );
      await h.post('sales', id);
      assert.deepEqual(await h.stockOf(item), { global: 7, warehouse: 7 });
    });

    test('un borrador anterior a este cambio no saca dos veces', async () => {
      const item = await h.seedItem({ stock: 10 });
      const id = await h.invoice('sales', [{ itemId: item, quantity: 4 }]);
      // Así quedaron los de antes: creados, con el stock ya fuera.
      await h.query(`UPDATE "Item" SET stock = 6 WHERE id = '${item}'`);
      await h.query(`UPDATE "ItemWarehouseStock" SET stock = 6 WHERE "itemId" = '${item}'`);
      await h.query(`UPDATE "SalesInvoice" SET "stockMoved" = true WHERE id = '${id}'`);
      await h.post('sales', id);
      assert.deepEqual(await h.stockOf(item), { global: 6, warehouse: 6 });
    });

    test('y si se cancela, le devuelve lo que sacó', async () => {
      const item = await h.seedItem({ stock: 10 });
      const id = await h.invoice('sales', [{ itemId: item, quantity: 4 }]);
      await h.query(`UPDATE "Item" SET stock = 6 WHERE id = '${item}'`);
      await h.query(`UPDATE "ItemWarehouseStock" SET stock = 6 WHERE "itemId" = '${item}'`);
      await h.query(`UPDATE "SalesInvoice" SET "stockMoved" = true WHERE id = '${id}'`);
      assert.equal((await h.api('POST', `/sales/invoices/${id}/cancel`)).status, 200);
      assert.deepEqual(await h.stockOf(item), { global: 10, warehouse: 10 });
    });
  });

  describe('compra', () => {
    test('el borrador no mete nada ni cambia la media', async () => {
      const item = await h.seedItem({ stock: 0 });
      await h.invoice('purchase', [{ itemId: item, quantity: 5, price: 8 }]);
      assert.deepEqual(await h.stockOf(item), { global: 0, warehouse: 0 });
      assert.equal(await averageOf(item), 0);
    });

    test('al asentarla, entra con su coste', async () => {
      const item = await h.seedItem({ stock: 0 });
      const id = await h.invoice('purchase', [{ itemId: item, quantity: 5, price: 8 }]);
      await h.post('purchase', id);
      assert.deepEqual(await h.stockOf(item), { global: 5, warehouse: 5 });
      assert.equal(await averageOf(item), 8);
    });

    test('cancelar el borrador no deja rastro en la media', async () => {
      const item = await h.seedItem({ stock: 0 });
      const id = await h.invoice('purchase', [{ itemId: item, quantity: 5, price: 8 }]);
      assert.equal((await h.api('POST', `/purchases/invoices/${id}/cancel`)).status, 200);
      const moves = await h.query(`SELECT id FROM "ItemCostMovement" WHERE "itemId" = '${item}'`);
      assert.equal(moves.length, 0);
    });
  });

  describe('lotes', () => {
    const lotItem = () => h.seedItem({ stock: 0, manageBy: 'B' });

    test('los de una compra entran al asentarla, con su caducidad', async () => {
      const item = await lotItem();
      const id = await h.invoice('purchase', [
        {
          itemId: item,
          quantity: 5,
          price: 8,
          batchDetails: [{ batchNum: 'L1', quantity: 5, expiryDate: '2030-01-15' }],
        },
      ]);
      assert.deepEqual(await batchesOf(item), []);
      await h.post('purchase', id);
      const [batch] = await batchesOf(item);
      assert.equal(batch.batchNum, 'L1');
      assert.equal(batch.quantity, 5);
      assert.equal(batch.expiry, '2030-01-15');
    });

    test('el borrador enseña los lotes elegidos', async () => {
      const item = await lotItem();
      const id = await h.invoice('purchase', [
        { itemId: item, quantity: 2, price: 8, batchDetails: [{ batchNum: 'L9', quantity: 2 }] },
      ]);
      const detail = await h.api('GET', `/purchases/invoices/${id}`);
      assert.deepEqual(detail.data.lines[0].batchDetails, [{ batchNum: 'L9', quantity: 2 }]);
    });

    test('al asentar no se duplican las filas de lotes', async () => {
      const item = await lotItem();
      const id = await h.invoice('purchase', [
        { itemId: item, quantity: 2, price: 8, batchDetails: [{ batchNum: 'L8', quantity: 2 }] },
      ]);
      await h.post('purchase', id);
      const detail = await h.api('GET', `/purchases/invoices/${id}`);
      assert.deepEqual(detail.data.lines[0].batchDetails, [{ batchNum: 'L8', quantity: 2 }]);
    });

    test('una serie repetida se dice al guardar, sin esperar a asentar', async () => {
      const item = await h.seedItem({ stock: 0, manageBy: 'S' });
      const first = await h.invoice('purchase', [
        { itemId: item, quantity: 1, price: 8, batchDetails: [{ batchNum: 'S1', quantity: 1 }] },
      ]);
      await h.post('purchase', first);
      const again = await h.api('POST', '/purchases/invoices', {
        seriesId: h.seriesId.purchase,
        periodId: h.periodId,
        partnerId: await h.seedPartner(),
        date: '2026-06-15',
        warehouseId: h.warehouseId,
        externalRef: `R-${crypto.randomUUID().slice(0, 6)}`,
        lines: [
          {
            itemId: item,
            quantity: 1,
            price: 8,
            taxGroupId: h.tax.general,
            batchDetails: [{ batchNum: 'S1', quantity: 1 }],
          },
        ],
      });
      assert.equal(again.status, 409, JSON.stringify(again.data));
    });

    test('la venta saca el lote elegido al asentarla, no antes', async () => {
      const item = await lotItem();
      const buy = await h.invoice('purchase', [
        { itemId: item, quantity: 5, price: 8, batchDetails: [{ batchNum: 'V1', quantity: 5 }] },
      ]);
      await h.post('purchase', buy);
      const sale = await h.invoice('sales', [
        { itemId: item, quantity: 2, batchDetails: [{ batchNum: 'V1', quantity: 2 }] },
      ]);
      assert.equal((await batchesOf(item))[0].quantity, 5);
      await h.post('sales', sale);
      assert.equal((await batchesOf(item))[0].quantity, 3);
    });

    test('sin lote y sin asignación automática, no se guarda', async () => {
      await setFlag('flags_auto_confirm_batches', false);
      const item = await lotItem();
      const result = await h.api('POST', '/sales/invoices', {
        seriesId: h.seriesId.sales,
        periodId: h.periodId,
        partnerId: await h.seedPartner(),
        date: '2026-06-15',
        warehouseId: h.warehouseId,
        lines: [{ itemId: item, quantity: 1, price: 5, taxGroupId: h.tax.general }],
      });
      assert.equal(result.status, 400, JSON.stringify(result.data));
    });

    test('con asignación automática, el lote se elige al asentar', async () => {
      await setFlag('flags_auto_confirm_batches', true);
      const item = await lotItem();
      const buy = await h.invoice('purchase', [
        {
          itemId: item,
          quantity: 5,
          price: 8,
          batchDetails: [{ batchNum: 'F1', quantity: 5, expiryDate: '2031-01-01' }],
        },
      ]);
      await h.post('purchase', buy);
      const sale = await h.invoice('sales', [{ itemId: item, quantity: 2 }]);
      assert.equal((await batchesOf(item))[0].quantity, 5);
      await h.post('sales', sale);
      assert.equal((await batchesOf(item))[0].quantity, 3);
      const detail = await h.api('GET', `/sales/invoices/${sale}`);
      assert.deepEqual(detail.data.lines[0].batchDetails, [{ batchNum: 'F1', quantity: 2 }]);
      await setFlag('flags_auto_confirm_batches', false);
    });
  });

  describe('abono con devolución', () => {
    const issued = async (itemId: string) => {
      const id = await h.invoice('sales', [{ itemId, quantity: 4 }]);
      await h.post('sales', id);
      return id;
    };
    const credit = async (id: string) =>
      h.api('POST', `/sales/invoices/${id}/credit-note`, {
        reason: 'Devolución',
        lines: [{ lineId: (await lineOf('SalesInvoice', id)).id, quantity: 2, returnStock: true }],
      });

    test('la mercancía vuelve al emitirlo, no al crearlo', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await credit(await issued(item));
      assert.equal(note.status, 200, JSON.stringify(note.data));
      assert.deepEqual(await h.stockOf(item), { global: 6, warehouse: 6 });
      await h.post('sales', note.data.id);
      assert.deepEqual(await h.stockOf(item), { global: 8, warehouse: 8 });
    });

    test('cancelar el borrador no mueve nada', async () => {
      const item = await h.seedItem({ stock: 10 });
      const note = await credit(await issued(item));
      assert.equal((await h.api('POST', `/sales/invoices/${note.data.id}/cancel`)).status, 200);
      assert.deepEqual(await h.stockOf(item), { global: 6, warehouse: 6 });
    });
  });

  describe('cancelar', () => {
    const closedPeriodWith = async (docType: string, year: number) => {
      const periodId = `p-${crypto.randomUUID().slice(0, 8)}`;
      await h.query(
        `INSERT INTO "AccountingPeriod" (id, code, name, "startDate", "endDate")
         VALUES ('${periodId}', '${periodId}', 'Periodo ${year}', '${year}-01-01', '${year}-12-31')`,
      );
      const seriesId = `s-${periodId}`;
      await h.query(
        `INSERT INTO "DocumentSeries" (id, name, "periodId", "docType", "firstNumber", "nextNumber", "lastNumber")
         VALUES ('${seriesId}', 'Serie ${seriesId}', '${periodId}', '${docType}', 1, 1, 9999)`,
      );
      return { periodId, seriesId };
    };
    const close = (periodId: string) =>
      h.query(`UPDATE "AccountingPeriod" SET status = 'C' WHERE id = '${periodId}'`);
    const docBody = async (
      period: { periodId: string; seriesId: string },
      itemId: string,
      date: string,
    ) => ({
      ...period,
      partnerId: await h.seedPartner(),
      date,
      warehouseId: h.warehouseId,
      lines: [{ itemId, quantity: 2, price: 10, taxGroupId: h.tax.general }],
    });

    test('un albarán de un periodo cerrado no se cancela: movió stock', async () => {
      const item = await h.seedItem({ stock: 10 });
      const period = await closedPeriodWith('SDN', 2020);
      const note = await h.api('POST', '/documents/SDN', await docBody(period, item, '2020-06-01'));
      assert.equal(note.status, 200, JSON.stringify(note.data));
      await close(period.periodId);
      const result = await h.api('POST', `/documents/SDN/${note.data.id}/cancel`);
      assert.equal(result.status, 409, JSON.stringify(result.data));
      assert.match(result.data.error, /cerrado/);
      assert.deepEqual(await h.stockOf(item), { global: 8, warehouse: 8 });
      const [row] = await h.query(
        `SELECT status FROM "SalesDeliveryNote" WHERE id = '${note.data.id}'`,
      );
      assert.equal(row.status, 'O');
    });

    test('un albarán de un periodo abierto, sí', async () => {
      const item = await h.seedItem({ stock: 10 });
      const period = await closedPeriodWith('SDN', 2019);
      const note = await h.api('POST', '/documents/SDN', await docBody(period, item, '2019-06-01'));
      assert.equal(note.status, 200, JSON.stringify(note.data));
      const result = await h.api('POST', `/documents/SDN/${note.data.id}/cancel`);
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.deepEqual(await h.stockOf(item), { global: 10, warehouse: 10 });
    });

    test('un borrador de un periodo cerrado, sí: no pasó nada', async () => {
      const item = await h.seedItem({ stock: 10 });
      const period = await closedPeriodWith('SINV', 2018);
      const draft = await h.api(
        'POST',
        '/sales/invoices',
        await docBody(period, item, '2018-06-01'),
      );
      assert.equal(draft.status, 200, JSON.stringify(draft.data));
      await close(period.periodId);
      const result = await h.api('POST', `/sales/invoices/${draft.data.id}/cancel`);
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.equal((await statusOf('SalesInvoice', draft.data.id)).status, 'X');
    });

    test('un pedido de un periodo cerrado, sí: tampoco movió nada', async () => {
      const item = await h.seedItem({ stock: 10 });
      const period = await closedPeriodWith('SO', 2017);
      const order = await h.api('POST', '/documents/SO', await docBody(period, item, '2017-06-01'));
      assert.equal(order.status, 200, JSON.stringify(order.data));
      await close(period.periodId);
      const result = await h.api('POST', `/documents/SO/${order.data.id}/cancel`);
      assert.equal(result.status, 200, JSON.stringify(result.data));
    });

    test('queda quién y cuándo', async () => {
      const item = await h.seedItem({ stock: 10 });
      const id = await h.invoice('sales', [{ itemId: item, quantity: 1 }]);
      const user = await h.seedAdmin(`canceler-${crypto.randomUUID().slice(0, 6)}`);
      const result = await h.api('POST', `/sales/invoices/${id}/cancel`, undefined, user);
      assert.equal(result.status, 200, JSON.stringify(result.data));
      const [row] = await h.query(
        `SELECT "cancelledAt", "cancelledBy" FROM "SalesInvoice" WHERE id = '${id}'`,
      );
      assert.ok(row.cancelledAt, 'sin fecha');
      assert.equal(row.cancelledBy, user.id);
      const detail = await h.api('GET', `/sales/invoices/${id}`);
      assert.ok(detail.data.cancelledAt, 'la ficha no lo trae');
    });

    test('el motivo se queda en el documento', async () => {
      const item = await h.seedItem({ stock: 10 });
      const period = await closedPeriodWith('SDN', 2016);
      const note = await h.api('POST', '/documents/SDN', await docBody(period, item, '2016-06-01'));
      assert.equal(note.status, 200, JSON.stringify(note.data));
      const result = await h.api('POST', `/documents/SDN/${note.data.id}/cancel`, {
        reason: '  Se equivocó de cliente  ',
      });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      const [row] = await h.query(
        `SELECT "cancelReason" FROM "SalesDeliveryNote" WHERE id = '${note.data.id}'`,
      );
      assert.equal(row.cancelReason, 'Se equivocó de cliente');
    });

    test('la auditoría lo apunta como cancelación, no como borrado', async () => {
      const item = await h.seedItem({ stock: 10 });
      const id = await h.invoice('sales', [{ itemId: item, quantity: 1 }]);
      await h.api('POST', `/sales/invoices/${id}/cancel`);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const rows = await h.query(
        `SELECT action FROM "AuditLog" WHERE "entityId" = '${id}' AND action IN ('CANCEL', 'DELETE')`,
      );
      assert.deepEqual(
        rows.map((r) => r.action),
        ['CANCEL'],
      );
    });
  });

  describe('precio negativo', () => {
    test('vale como línea de descuento si el total sigue en positivo', async () => {
      const item = await h.seedItem({ stock: 10 });
      const service = await h.seedItem({ stock: 10 });
      const id = await h.invoice('sales', [
        { itemId: item, quantity: 2, price: 50 },
        { itemId: service, quantity: 1, price: -20 },
      ]);
      const [row] = await h.query(`SELECT subtotal FROM "SalesInvoice" WHERE id = '${id}'`);
      assert.equal(Number(row.subtotal), 80);
    });

    test('un total en negativo solo en un abono', async () => {
      const item = await h.seedItem({ stock: 10 });
      const result = await h.api('POST', '/sales/invoices', {
        seriesId: h.seriesId.sales,
        periodId: h.periodId,
        partnerId: await h.seedPartner(),
        date: '2026-06-15',
        warehouseId: h.warehouseId,
        lines: [{ itemId: item, quantity: 1, price: -20, taxGroupId: h.tax.general }],
      });
      assert.equal(result.status, 400, JSON.stringify(result.data));
      assert.match(result.data.error, /total/);
    });

    test('en una compra no estropea la media', async () => {
      const item = await h.seedItem({ stock: 0 });
      const other = await h.seedItem({ stock: 0 });
      const id = await h.invoice('purchase', [
        { itemId: other, quantity: 10, price: 10 },
        { itemId: item, quantity: 1, price: -5 },
      ]);
      await h.post('purchase', id);
      assert.equal(await averageOf(item), 0);
      assert.equal(await averageOf(other), 10);
    });
  });
});
