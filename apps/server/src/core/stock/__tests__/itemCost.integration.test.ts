/**
 * Coste medio del artículo: la secuencia de compras y ventas calculada a mano, con
 * moneda extranjera, stock negativo, cancelaciones, abonos y albaranes.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startDocumentsHarness,
  testDatabaseUrl,
  type DocumentsHarness,
  type InvoiceSide,
} from '../../documents/__tests__/documentsHarness';
import { DocumentEngine } from '../../documents/DocumentEngine';
import { DocumentRegistry } from '../../documents/DocumentRegistry';
import { PdfRenderer } from '@openfactu/pdf';

const ALL = { read: true, write: true, delete: true };
const NONE = { read: false, write: false, delete: false };

describe('coste del artículo', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;
  let series: { SDN: string; PDN: string };

  before(async () => {
    h = await startDocumentsHarness();
    const rows = await h.query(
      `SELECT id, "docType" FROM "DocumentSeries" WHERE "docType" IN ('SDN', 'PDN')`,
    );
    series = Object.fromEntries(rows.map((r: any) => [r.docType, r.id])) as any;
    await h.query(
      `INSERT INTO "DocumentType" (id, code, name, "docCategory", "isRectify", "isActive", "sortOrder")
       VALUES ('dt-rect', 'RECT', 'Rectificativa', 'credit_note', true, true, 1)`,
    );
  });
  after(async () => {
    await PdfRenderer.shutdown();
    await h?.close();
  });

  const costOf = async (itemId: string) => {
    const [row] = await h.query(
      `SELECT "averageCost", "lastPurchaseCost" FROM "Item" WHERE id = '${itemId}'`,
    );
    return {
      average: Number(row.averageCost),
      last: row.lastPurchaseCost == null ? null : Number(row.lastPurchaseCost),
    };
  };
  const tableOf = (side: InvoiceSide) => (side === 'sales' ? 'SalesInvoice' : 'PurchaseInvoice');
  const invoiceLine = async (side: InvoiceSide, id: string) => {
    const [row] = await h.query(
      `SELECT * FROM "${tableOf(side)}Line" WHERE "invoiceId" = '${id}' ORDER BY "lineNum"`,
    );
    return row;
  };
  const unitCostOf = async (side: InvoiceSide, id: string) => {
    const line = await invoiceLine(side, id);
    return line.unitCost == null ? null : Number(line.unitCost);
  };
  const draftBuy = (itemId: string, quantity: number, price: number, line = {}, extra = {}) =>
    h.invoice('purchase', [{ itemId, quantity, price, ...line }], extra);
  const draftSell = (itemId: string, quantity: number, line = {}, extra = {}) =>
    h.invoice('sales', [{ itemId, quantity, price: 50, ...line }], extra);
  // El stock y el coste se mueven al asentar: comprar y vender de verdad es hasta ahí.
  const buy = async (itemId: string, quantity: number, price: number, line = {}, extra = {}) => {
    const id = await draftBuy(itemId, quantity, price, line, extra);
    await h.post('purchase', id);
    return id;
  };
  const sell = async (itemId: string, quantity: number, line = {}, extra = {}) => {
    const id = await draftSell(itemId, quantity, line, extra);
    await h.post('sales', id);
    return id;
  };
  const credit = (side: InvoiceSide, id: string, body: Record<string, unknown>) =>
    h.api('POST', `${h.invoicePath(side)}/${id}/credit-note`, {
      reason: 'Devolución',
      externalRef: side === 'purchase' ? `AB-${Math.random()}` : undefined,
      ...body,
    });
  const note = async (docType: 'SDN' | 'PDN', lines: Array<Record<string, unknown>>) => {
    const res = await h.api('POST', `/documents/${docType}`, {
      seriesId: series[docType],
      periodId: h.periodId,
      partnerId: await h.seedPartner(),
      date: '2026-06-15',
      warehouseId: h.warehouseId,
      lines: lines.map((line) => ({ taxGroupId: h.tax.general, price: 50, ...line })),
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data.id as string;
  };
  const noteLine = async (docType: 'SDN' | 'PDN', id: string) => {
    const table = docType === 'SDN' ? 'SalesDeliveryNoteLine' : 'PurchaseDeliveryNoteLine';
    const [row] = await h.query(`SELECT * FROM "${table}" WHERE "deliveryId" = '${id}'`);
    return row;
  };

  describe('entradas', () => {
    test('las compras ponderan la media y recuerdan la última', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      assert.deepEqual(await costOf(itemId), { average: 10, last: 10 });
      await buy(itemId, 10, 20);
      assert.deepEqual(await costOf(itemId), { average: 15, last: 20 });

      const rows = await h.query(
        `SELECT * FROM "ItemCostMovement" WHERE "itemId" = '${itemId}' ORDER BY "createdAt"`,
      );
      assert.equal(rows.length, 2);
      assert.equal(rows[1].kind, 'purchase');
      assert.equal(rows[1].docType, 'PINV');
      assert.equal(Number(rows[1].stockBefore), 10);
      assert.equal(Number(rows[1].costBefore), 10);
      assert.equal(Number(rows[1].costAfter), 15);
    });

    test('el coste de una compra lleva su descuento y no su impuesto', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10, { discountRate: 10 });
      assert.equal((await costOf(itemId)).average, 9);
    });

    test('la unidad de la línea se convierte a la del artículo', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 2, 50, { uomFactor: 5 });
      assert.equal((await h.stockOf(itemId)).global, 10);
      assert.equal((await costOf(itemId)).average, 10);
    });

    test('una compra en otra moneda entra en moneda base', async () => {
      await h.query(
        `INSERT INTO "Currency" (id, code, name, symbol, "exchangeRate") VALUES ('cur-x', 'XXX', 'Prueba', 'X', 0.5)`,
      );
      const itemId = await h.seedItem();
      await buy(itemId, 10, 20, {}, { currencyId: 'cur-x' });
      assert.equal((await costOf(itemId)).average, 10);
    });

    test('el cambio del propio documento manda sobre el de la moneda', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 20, {}, { currencyId: 'cur-x', exchangeRate: 2 });
      assert.equal((await costOf(itemId)).average, 40);
    });

    test('con stock negativo, el coste es el de la entrada', async () => {
      const itemId = await h.seedItem();
      await h.query(`UPDATE "Item" SET stock = -2, "averageCost" = 50 WHERE id = '${itemId}'`);
      await buy(itemId, 5, 9);
      assert.equal((await costOf(itemId)).average, 9);
    });

    test('el coste que mande quien llama no cuenta', async () => {
      const itemId = await h.seedItem();
      const id = await buy(itemId, 10, 10, { unitCost: 1 });
      assert.equal((await costOf(itemId)).average, 10);
      assert.equal(await unitCostOf('purchase', id), 10);
    });
  });

  describe('salidas', () => {
    test('una venta se lleva la media y ya no cambia', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      await buy(itemId, 10, 20);
      const saleId = await sell(itemId, 5);
      assert.equal(await unitCostOf('sales', saleId), 15);
      assert.equal((await costOf(itemId)).average, 15, 'vender no cambia la media');

      await buy(itemId, 5, 30);
      assert.equal((await costOf(itemId)).average, 18.75);
      assert.equal(await unitCostOf('sales', saleId), 15);
    });

    test('lo que mande quien llama no sustituye al coste de la venta', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      assert.equal(await unitCostOf('sales', await sell(itemId, 1, { unitCost: 999 })), 10);
    });

    test('un artículo sin coste conocido vende con coste vacío, no con cero', async () => {
      const itemId = await h.seedItem({ stock: 5 });
      assert.equal(await unitCostOf('sales', await sell(itemId, 1)), null);
    });
  });

  describe('cancelaciones', () => {
    test('cancelar un borrador de compra no toca la media ni el stock', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const draft = await draftBuy(itemId, 10, 20);
      assert.equal((await costOf(itemId)).average, 10);
      const res = await h.api('POST', `/purchases/invoices/${draft}/cancel`);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal((await costOf(itemId)).average, 10);
      assert.equal((await h.stockOf(itemId)).global, 10);
    });

    test('cancelar un albarán de venta devuelve la mercancía a su coste', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const noteId = await note('SDN', [{ itemId, quantity: 5 }]);
      await buy(itemId, 5, 30);
      assert.equal((await costOf(itemId)).average, 20);
      const res = await h.api('POST', `/documents/SDN/${noteId}/cancel`);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal((await costOf(itemId)).average, 16.666667);
      assert.equal((await h.stockOf(itemId)).global, 15);
    });

    test('cancelar una línea sin coste guardado no mueve la media', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const noteId = await note('SDN', [{ itemId, quantity: 5 }]);
      await h.query(
        `UPDATE "SalesDeliveryNoteLine" SET "unitCost" = NULL WHERE "deliveryId" = '${noteId}'`,
      );
      await buy(itemId, 5, 30);
      await h.api('POST', `/documents/SDN/${noteId}/cancel`);
      assert.equal((await costOf(itemId)).average, 20);
    });
  });

  describe('abonos', () => {
    test('una devolución del cliente vuelve al coste con el que salió', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const saleId = await sell(itemId, 4);
      await buy(itemId, 6, 30);
      assert.equal((await costOf(itemId)).average, 20);

      const line = await invoiceLine('sales', saleId);
      const res = await credit('sales', saleId, {
        lines: [{ lineId: line.id, quantity: 4, returnStock: true }],
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(await unitCostOf('sales', res.data.id), 10);
      await h.post('sales', res.data.id);
      assert.equal((await costOf(itemId)).average, 17.5);
      assert.equal((await h.stockOf(itemId)).global, 16);
    });

    test('un abono sin devolución no cambia la media ni trae coste', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const saleId = await sell(itemId, 4);
      const line = await invoiceLine('sales', saleId);
      const res = await credit('sales', saleId, { lines: [{ lineId: line.id, quantity: 4 }] });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(await unitCostOf('sales', res.data.id), 0);
      assert.equal((await costOf(itemId)).average, 10);
    });

    test('una devolución al proveedor sale al coste con el que entró', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const purchaseId = await buy(itemId, 10, 20);
      const line = await invoiceLine('purchase', purchaseId);
      const res = await credit('purchase', purchaseId, {
        lines: [{ lineId: line.id, quantity: 10, returnStock: true }],
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(await unitCostOf('purchase', res.data.id), 20);
      assert.equal((await costOf(itemId)).average, 15, 'en borrador, aún no');
      await h.post('purchase', res.data.id);
      assert.equal((await costOf(itemId)).average, 10);
      assert.equal((await h.stockOf(itemId)).global, 10);
    });

    test('cancelar un abono en borrador no mueve nada', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const saleId = await sell(itemId, 4);
      await buy(itemId, 6, 30);
      const line = await invoiceLine('sales', saleId);
      const res = await credit('sales', saleId, {
        lines: [{ lineId: line.id, quantity: 4, returnStock: true }],
      });
      await h.api('POST', `/sales/invoices/${res.data.id}/cancel`);
      assert.equal((await costOf(itemId)).average, 20);
      assert.equal((await h.stockOf(itemId)).global, 12);
    });
  });

  describe('albaranes', () => {
    test('el albarán de compra fija el coste y su factura no lo cuenta dos veces', async () => {
      const itemId = await h.seedItem();
      const noteId = await note('PDN', [{ itemId, quantity: 10, price: 10 }]);
      assert.equal((await costOf(itemId)).average, 10);
      assert.equal(Number((await noteLine('PDN', noteId)).unitCost), 10);

      const invoiceId = await buy(itemId, 10, 12, {
        baseType: 'PDN',
        baseId: noteId,
        baseLine: 1,
      });
      assert.equal((await h.stockOf(itemId)).global, 10);
      assert.equal((await costOf(itemId)).average, 10, 'la media sigue siendo la del albarán');
      assert.equal(await unitCostOf('purchase', invoiceId), 12);
    });

    test('la factura de un albarán de venta hereda el coste del albarán', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const noteId = await note('SDN', [{ itemId, quantity: 4 }]);
      assert.equal(Number((await noteLine('SDN', noteId)).unitCost), 10);
      await buy(itemId, 10, 20);
      assert.equal((await costOf(itemId)).average, 16.25);

      const invoiceId = await sell(itemId, 4, { baseType: 'SDN', baseId: noteId, baseLine: 1 });
      assert.equal(await unitCostOf('sales', invoiceId), 10);
    });

    test('cancelar un albarán de compra deshace su entrada', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const noteId = await note('PDN', [{ itemId, quantity: 10, price: 20 }]);
      assert.equal((await costOf(itemId)).average, 15);
      const res = await h.api('POST', `/documents/PDN/${noteId}/cancel`);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal((await costOf(itemId)).average, 10);
    });

    test('lo que faltó al preparar vuelve a su coste', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const noteId = await note('SDN', [{ itemId, quantity: 5 }]);
      await buy(itemId, 5, 30);
      assert.equal((await costOf(itemId)).average, 20);

      const line = await noteLine('SDN', noteId);
      const config: any = DocumentRegistry.get('SDN');
      await h.db.transaction((tx: any) =>
        DocumentEngine.reduceLineQuantity(tx, config, line.id, 2),
      );
      assert.equal((await costOf(itemId)).average, 18.333333);
      assert.equal((await h.stockOf(itemId)).global, 12);
    });
  });

  describe('movimientos manuales', () => {
    const receipt = async (lines: Array<Record<string, unknown>>, user?: any) =>
      h.api('POST', '/goods-receipts', { warehouseId: h.warehouseId, lines }, user);
    const posted = async (lines: Array<Record<string, unknown>>) => {
      const res = await receipt(lines);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const done = await h.api('POST', `/goods-receipts/${res.data.id}/post`);
      assert.equal(done.status, 200, JSON.stringify(done.data));
      return res.data.id as string;
    };

    test('una entrada con coste recalcula la media y no es la última compra', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      await posted([{ itemId, quantity: 10, unitCost: 20 }]);
      assert.deepEqual(await costOf(itemId), { average: 15, last: 10 });
    });

    test('una entrada sin coste deja la media como estaba', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      await posted([{ itemId, quantity: 5 }]);
      assert.equal((await costOf(itemId)).average, 10);
      assert.equal((await h.stockOf(itemId)).global, 15);
    });

    test('un coste negativo no se admite', async () => {
      const itemId = await h.seedItem();
      const res = await receipt([{ itemId, quantity: 5, unitCost: -1 }]);
      assert.equal(res.status, 400, JSON.stringify(res.data));
    });

    test('sin permiso sobre los costes no se puede poner uno', async () => {
      const itemId = await h.seedItem();
      const user = await h.seedUser('sin-coste-escritura', { '/item-costs': NONE });
      const res = await receipt([{ itemId, quantity: 5, unitCost: 9 }], user);
      assert.equal(res.status, 403, JSON.stringify(res.data));
    });

    test('una salida guarda la media y no la cambia', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const res = await h.api('POST', '/goods-issues', {
        warehouseId: h.warehouseId,
        lines: [{ itemId, quantity: 4 }],
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      await h.api('POST', `/goods-issues/${res.data.id}/post`);
      const [line] = await h.query(
        `SELECT "unitCost" FROM "GoodsIssueLine" WHERE "issueId" = '${res.data.id}'`,
      );
      assert.equal(Number(line.unitCost), 10);
      assert.equal((await costOf(itemId)).average, 10);
    });
  });

  describe('la ficha del artículo', () => {
    test('el coste no se escribe desde la ficha', async () => {
      const [{ uomId }] = await h.query(`SELECT "uomId" FROM "Item" LIMIT 1`);
      const created = await h.api('POST', '/items', {
        code: `COST-${Math.random()}`,
        name: 'Con coste inventado',
        uomId,
        averageCost: 999,
        lastPurchaseCost: 999,
      });
      assert.equal(created.status, 200, JSON.stringify(created.data));
      assert.deepEqual(await costOf(created.data.id), { average: 0, last: null });

      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const patched = await h.api('PATCH', `/items/${itemId}`, {
        averageCost: 999,
        lastPurchaseCost: 999,
        name: 'Renombrado',
      });
      assert.equal(patched.status, 200, JSON.stringify(patched.data));
      assert.deepEqual(await costOf(itemId), { average: 10, last: 10 });
    });
  });

  describe('permiso', () => {
    test('sin permiso no se ve el coste en la ficha ni en las líneas', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const saleId = await sell(itemId, 1);
      const user = await h.seedUser('sin-coste', { '/items': ALL });

      const item = await h.api('GET', `/items/${itemId}`, undefined, user);
      assert.equal(item.status, 200);
      assert.equal(item.data.name !== undefined, true);
      assert.equal('averageCost' in item.data, false);
      assert.equal('lastPurchaseCost' in item.data, false);

      const invoice = await h.api('GET', `/sales/invoices/${saleId}`, undefined, user);
      assert.equal(invoice.status, 200, JSON.stringify(invoice.data));
      assert.ok(invoice.data.lines.length > 0);
      assert.equal('unitCost' in invoice.data.lines[0], false);
    });

    test('con permiso, y siendo administrador, sí se ve', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const user = await h.seedUser('con-coste', { '/items': ALL, '/item-costs': ALL });
      const item = await h.api('GET', `/items/${itemId}`, undefined, user);
      assert.equal(Number(item.data.averageCost), 10);
      const admin = await h.api('GET', `/items/${itemId}`);
      assert.equal(Number(admin.data.lastPurchaseCost), 10);
    });

    test('el historial del coste pide el permiso', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const denied = await h.seedUser('sin-historial', { '/items': ALL });
      const res = await h.api('GET', `/items/${itemId}/cost-movements`, undefined, denied);
      assert.equal(res.status, 403);

      const allowed = await h.seedUser('con-historial', { '/item-costs': ALL });
      const rows = await h.api('GET', `/items/${itemId}/cost-movements`, undefined, allowed);
      assert.equal(rows.status, 200, JSON.stringify(rows.data));
      assert.equal(rows.data.length, 1);
      assert.equal(rows.data[0].kind, 'purchase');
      assert.equal(Number(rows.data[0].costAfter), 10);
    });
  });

  describe('informes', () => {
    const rowOf = async (path: string, code: string, user?: any) => {
      const res = await h.api('GET', `/reports/${path}`, undefined, user);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return res.data.find((r: any) => r.code === code);
    };
    const codeOf = async (table: string, id: string) => {
      const [row] = await h.query(`SELECT code FROM "${table}" WHERE id = '${id}'`);
      return row.code as string;
    };

    test('por artículo: ingreso sin impuesto, coste y margen real', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const saleId = await sell(itemId, 4);
      await draftSell(itemId, 1); // un borrador no cuenta

      const code = await codeOf('Item', itemId);
      const row = await rowOf('profit-item', code);
      assert.equal(row.revenue, 200);
      assert.equal(row.qty, 4);
      assert.equal(row.cost, 40);
      assert.equal(row.margin, 160);
      assert.equal(row.marginRate, 80);
    });

    test('por artículo: un abono con devolución resta ingreso y coste', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const saleId = await sell(itemId, 4);
      const line = await invoiceLine('sales', saleId);
      const res = await credit('sales', saleId, {
        lines: [{ lineId: line.id, quantity: 1, returnStock: true }],
      });
      await h.post('sales', res.data.id);

      const row = await rowOf('profit-item', await codeOf('Item', itemId));
      assert.equal(row.qty, 3);
      assert.equal(row.revenue, 150);
      assert.equal(row.cost, 30);
      assert.equal(row.margin, 120);
    });

    test('por artículo: un abono sin devolución resta ingreso y no coste', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const saleId = await sell(itemId, 4);
      const line = await invoiceLine('sales', saleId);
      const res = await credit('sales', saleId, { lines: [{ lineId: line.id, quantity: 1 }] });
      await h.post('sales', res.data.id);

      const row = await rowOf('profit-item', await codeOf('Item', itemId));
      assert.equal(row.revenue, 150);
      assert.equal(row.cost, 40);
      assert.equal(row.margin, 110);
    });

    test('por artículo: avisa de las unidades vendidas sin coste', async () => {
      const itemId = await h.seedItem({ stock: 5 });
      const saleId = await sell(itemId, 2);
      const row = await rowOf('profit-item', await codeOf('Item', itemId));
      assert.equal(row.cost, 0);
      assert.equal(row.uncosted, 2);
    });

    test('la unidad de la línea cuenta en el coste', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const saleId = await sell(itemId, 1, { uomFactor: 5 });
      const row = await rowOf('profit-item', await codeOf('Item', itemId));
      assert.equal(row.cost, 50);
    });

    test('por cliente: coste y margen de sus facturas', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const partnerId = await h.seedPartner();
      const saleId = await sell(itemId, 4, {}, { partnerId });
      const row = await rowOf('profit-customer', await codeOf('BusinessPartner', partnerId));
      assert.equal(row.total, 200);
      assert.equal(row.cost, 40);
      assert.equal(row.margin, 160);
      assert.equal(row.marginRate, 80);
    });

    for (const [path, column, table] of [
      ['profit-project', 'internalOrderId', 'InternalOrder'],
      ['profit-cost-center', 'costCenterId', 'CostCenter'],
    ] as const) {
      test(`${path}: ingreso y gasto sin impuesto, con el coste de lo vendido`, async () => {
        const code = `D${Math.floor(Math.random() * 1e8)}`;
        await h.query(`INSERT INTO "${table}" (id, code, name) VALUES ('${code}', '${code}', 'D')`);
        const itemId = await h.seedItem();
        await buy(itemId, 10, 10);
        const saleId = await sell(itemId, 4, { [column]: code });

        const row = await rowOf(path, code);
        assert.equal(row.income, 200);
        assert.equal(row.expense, 0);
        assert.equal(row.cost, 40);
        assert.equal(row.margin, 160);
      });

      test(`${path}: lo comprado para el mismo artículo no se cuenta dos veces`, async () => {
        const code = `D${Math.floor(Math.random() * 1e8)}`;
        await h.query(`INSERT INTO "${table}" (id, code, name) VALUES ('${code}', '${code}', 'D')`);
        const itemId = await h.seedItem();
        const purchaseId = await buy(itemId, 10, 10, { [column]: code });
        const saleId = await sell(itemId, 4, { [column]: code });

        const row = await rowOf(path, code);
        assert.equal(row.income, 200);
        assert.equal(row.expense, 100);
        assert.equal(row.cost, 0);
        assert.equal(row.margin, 100);
      });
    }

    test('sin permiso los informes no dan coste ni margen de artículo', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      const partnerId = await h.seedPartner();
      const saleId = await sell(itemId, 4, {}, { partnerId });
      const user = await h.seedUser('informe-sin-coste', {});

      const byItem = await rowOf('profit-item', await codeOf('Item', itemId), user);
      assert.equal(byItem.revenue, 200);
      for (const key of ['cost', 'margin', 'marginRate', 'uncosted'])
        assert.equal(key in byItem, false, key);

      const byPartner = await rowOf(
        'profit-customer',
        await codeOf('BusinessPartner', partnerId),
        user,
      );
      assert.equal(byPartner.total, 200);
      for (const key of ['cost', 'margin']) assert.equal(key in byPartner, false, key);

      const stock = await rowOf('stock-valuation', await codeOf('Item', itemId), user);
      assert.equal(stock.stock, 6);
      for (const key of ['unitPrice', 'value']) assert.equal(key in stock, false, key);
    });

    for (const report of ['profit-item', 'profit-customer']) {
      test(`${report}: el PDF se genera, con y sin permiso de costes`, async () => {
        const itemId = await h.seedItem();
        await buy(itemId, 10, 10);
        const saleId = await sell(itemId, 4);

        const res = await h.api('GET', `/reports/${report}/pdf`);
        assert.equal(res.status, 200, String(res.data).slice(0, 200));
        assert.ok(String(res.data).startsWith('%PDF'));

        const user = await h.seedUser(`pdf-${report}`, {});
        const plain = await h.api('GET', `/reports/${report}/pdf`, undefined, user);
        assert.equal(plain.status, 200, String(plain.data).slice(0, 200));
        assert.ok(String(plain.data).startsWith('%PDF'));
      });
    }

    test('el valor del inventario sale de la media, no del precio de venta', async () => {
      const itemId = await h.seedItem();
      await buy(itemId, 10, 10);
      await buy(itemId, 10, 20);
      const row = await rowOf('stock-valuation', await codeOf('Item', itemId));
      assert.equal(row.stock, 20);
      assert.equal(row.unitPrice, 15);
      assert.equal(row.value, 300);
    });

    test('el valor del inventario marca lo que no tiene coste', async () => {
      const itemId = await h.seedItem({ stock: 5 });
      const row = await rowOf('stock-valuation', await codeOf('Item', itemId));
      assert.equal(row.value, 0);
      assert.equal(row.uncosted, true);
    });
  });
});
