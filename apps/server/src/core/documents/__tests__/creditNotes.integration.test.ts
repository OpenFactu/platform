/**
 * Abonos: corregir una factura emitida con otra en negativo, con o sin devolver la
 * mercancía, sin tocar nunca la original.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startDocumentsHarness,
  testDatabaseUrl,
  type DocumentsHarness,
  type InvoiceSide,
} from './documentsHarness';
import { FiscalConnectors } from '../../fiscal/FiscalConnectors';
import { walkChain } from '../documentChain';
import { PdfPayloadBuilder } from '../PdfPayloadBuilder';

describe('abonos', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;
  let rectifyTypeId: string;

  before(async () => {
    h = await startDocumentsHarness();
    rectifyTypeId = 'dt-rect';
    await h.query(
      `INSERT INTO "DocumentType" (id, code, name, "docCategory", "isRectify", "isActive", "sortOrder")
       VALUES ('${rectifyTypeId}', 'RECT', 'Rectificativa', 'credit_note', true, true, 1)`,
    );
  });
  after(async () => {
    await h?.close();
  });

  const tableOf = (side: InvoiceSide) => (side === 'sales' ? 'SalesInvoice' : 'PurchaseInvoice');
  const headerOf = async (side: InvoiceSide, id: string) => {
    const [row] = await h.query(`SELECT * FROM "${tableOf(side)}" WHERE id = '${id}'`);
    return row;
  };
  const linesOf = (side: InvoiceSide, id: string) =>
    h.query(`SELECT * FROM "${tableOf(side)}Line" WHERE "invoiceId" = '${id}' ORDER BY "lineNum"`);

  /** Una factura ya emitida, con su primera línea a mano. */
  const issued = async (
    side: InvoiceSide,
    lines: Array<Record<string, unknown>>,
    extra: Record<string, unknown> = {},
  ) => {
    const id = await h.invoice(side, lines, extra);
    await h.post(side, id);
    return { id, lines: await linesOf(side, id) };
  };

  const credit = (side: InvoiceSide, id: string, body: Record<string, unknown>) =>
    h.api('POST', `${h.invoicePath(side)}/${id}/credit-note`, {
      reason: 'Devolución del cliente',
      externalRef: side === 'purchase' ? `AB-${Math.random()}` : undefined,
      ...body,
    });

  for (const [side, docType] of [
    ['sales', 'SINV'],
    ['purchase', 'PINV'],
  ] as const) {
    test(`${side}: preparar un abono trae su factura y lo que vale cada unidad`, async () => {
      const itemId = await h.seedItem({ stock: 100 });
      const partnerId = await h.seedPartner();
      const invoice = await issued(side, [{ itemId, quantity: 4, price: 50, discountRate: 10 }], {
        partnerId,
      });
      const res = await h.api('GET', `${h.invoicePath(side)}/${invoice.id}/credit-note`);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const header = await headerOf(side, invoice.id);
      assert.equal(res.data.invoice.id, invoice.id);
      assert.ok(res.data.invoice.code);
      assert.equal(res.data.invoice.partnerId, partnerId);
      assert.ok(res.data.invoice.partnerName);
      assert.equal(res.data.invoice.total, Number(header.total));
      const [line] = res.data.lines;
      assert.equal(line.unitNet, 45);
      assert.equal(line.unitTax, 9.45);
      assert.ok(line.itemCode);
      assert.equal(line.taxGroupId, h.tax.general);
      assert.equal(line.uomFactor, 1);
      assert.deepEqual(line.customFields, {});

      // Lo que se anuncia es lo que sale al crearlo.
      const created = await credit(side, invoice.id, {
        lines: [{ lineId: line.lineId, quantity: 2 }],
      });
      assert.equal(created.status, 200, JSON.stringify(created.data));
      const note = await headerOf(side, created.data.id);
      assert.equal(Number(note.subtotal), -2 * line.unitNet);
      assert.equal(Number(note.total), -2 * (line.unitNet + line.unitTax));
    });

    test(`${side}: preparar un abono trae los campos propios de la línea`, async () => {
      const itemId = await h.seedItem({ stock: 100 });
      const invoice = await issued(side, [{ itemId, quantity: 1, price: 50 }]);
      const table = `${tableOf(side)}Line`;
      await h.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "p_nota_abono" TEXT`);
      await h.query(
        `UPDATE "${table}" SET "p_nota_abono" = 'mi nota' WHERE id = '${invoice.lines[0].id}'`,
      );
      const res = await h.api('GET', `${h.invoicePath(side)}/${invoice.id}/credit-note`);
      assert.equal(res.data.lines[0].customFields.p_nota_abono, 'mi nota');
    });

    test(`${side}: preparar el abono de una factura que no existe da 404`, async () => {
      const res = await h.api('GET', `${h.invoicePath(side)}/no-existe/credit-note`);
      assert.equal(res.status, 404, JSON.stringify(res.data));
    });

    test(`${side}: en trazabilidad, un abono se distingue de su factura`, async () => {
      const itemId = await h.seedItem({ stock: 100 });
      const invoice = await issued(side, [{ itemId, quantity: 2, price: 50 }]);
      const created = await credit(side, invoice.id, {
        lines: [{ lineId: invoice.lines[0].id, quantity: 1 }],
      });
      assert.equal(created.status, 200, JSON.stringify(created.data));
      const noteId = created.data.id;
      await h.post(side, noteId);

      const fromInvoice = await h.api('GET', `/document-links?type=${docType}&id=${invoice.id}`);
      assert.equal(fromInvoice.status, 200, JSON.stringify(fromInvoice.data));
      assert.equal(fromInvoice.data.current.isCreditNote, false);
      const [child] = fromInvoice.data.children;
      assert.equal(child.id, noteId);
      assert.equal(child.isCreditNote, true);
      assert.equal(child.documentTypeName, 'Rectificativa');
      assert.ok(child.total < 0);
      const applied = fromInvoice.data.payments.find((p: any) => p.linked);
      assert.equal(applied.linked.id, noteId);
      assert.equal(applied.linked.code, child.code);

      const fromNote = await h.api('GET', `/document-links?type=${docType}&id=${noteId}`);
      assert.equal(fromNote.data.current.isCreditNote, true);
      assert.equal(fromNote.data.current.documentTypeName, 'Rectificativa');
      assert.ok(fromNote.data.current.total < 0);
      assert.equal(fromNote.data.parents[0].id, invoice.id);
      assert.equal(fromNote.data.parents[0].isCreditNote, false);
      assert.equal(fromNote.data.payments.find((p: any) => p.linked).linked.id, invoice.id);
    });

    test(`${side}: un abono total es el inverso exacto y no toca la factura`, async () => {
      const itemId = await h.seedItem({ stock: 100 });
      const invoice = await issued(side, [
        { itemId, quantity: 3, price: 50, discountRate: 10 },
        { itemId, quantity: 1, price: 100, taxGroupId: h.tax.reduced },
      ]);
      const stock = await h.stockOf(itemId);
      const original = await headerOf(side, invoice.id);

      const res = await credit(side, invoice.id, {
        lines: invoice.lines.map((l: any) => ({ lineId: l.id, quantity: Number(l.quantity) })),
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));

      const note = await headerOf(side, res.data.id);
      assert.equal(note.status, 'D');
      assert.equal(note.rectifiesInvoiceId, invoice.id);
      assert.equal(note.documentTypeId, rectifyTypeId);
      assert.equal(note.rectifyReason, 'Devolución del cliente');
      assert.ok(
        note.rectifyRef.endsWith(String(original.docNum).padStart(6, '0')),
        note.rectifyRef,
      );
      assert.equal(Number(note.subtotal), -Number(original.subtotal));
      assert.equal(Number(note.taxTotal), -Number(original.taxTotal));
      assert.equal(Number(note.total), -Number(original.total));

      assert.deepEqual(await h.stockOf(itemId), stock, 'sin devolución no se mueve el stock');
      const after = await headerOf(side, invoice.id);
      assert.equal(after.status, 'O');
      assert.equal(after.isLocked, true);
      assert.equal(Number(after.total), Number(original.total));
    });

    test(`${side}: dos abonos parciales no pueden pasar de lo facturado`, async () => {
      const itemId = await h.seedItem({ stock: 100 });
      const invoice = await issued(side, [{ itemId, quantity: 3, price: 50 }]);
      const lineId = invoice.lines[0].id;

      const first = await credit(side, invoice.id, { lines: [{ lineId, quantity: 2 }] });
      assert.equal(first.status, 200, JSON.stringify(first.data));
      assert.equal(Number((await headerOf(side, first.data.id)).subtotal), -100);

      const preview = await h.api('GET', `${h.invoicePath(side)}/${invoice.id}/credit-note`);
      assert.equal(preview.status, 200);
      const row = preview.data.lines.find((l: any) => l.lineId === lineId);
      assert.deepEqual([row.invoiced, row.credited, row.available], [3, 2, 1]);

      const tooMuch = await credit(side, invoice.id, { lines: [{ lineId, quantity: 2 }] });
      assert.equal(tooMuch.status, 400);

      const rest = await credit(side, invoice.id, { lines: [{ lineId, quantity: 1 }] });
      assert.equal(rest.status, 200);

      // Un abono cancelado deja de contar.
      await h.api('POST', `${h.invoicePath(side)}/${rest.data.id}/cancel`);
      const again = await h.api('GET', `${h.invoicePath(side)}/${invoice.id}/credit-note`);
      assert.equal(again.data.lines[0].available, 1);
    });

    test(`${side}: con descuento en importe y retención, en proporción`, async () => {
      const itemId = await h.seedItem({ stock: 100 });
      const invoice = await issued(side, [
        { itemId, quantity: 4, price: 50, discountAmount: 40, withholdingRate: 15 },
      ]);
      const res = await credit(side, invoice.id, {
        lines: [{ lineId: invoice.lines[0].id, quantity: 1 }],
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const note = await headerOf(side, res.data.id);
      assert.equal(Number(note.subtotal), -40); // (4×50 − 40) / 4
      assert.equal(Number(note.taxTotal), -8.4);
      assert.equal(Number(note.total), -42.4); // −40 − 8,4 + 6 de retención
    });

    test(`${side}: un abono en borrador se puede cancelar y no cambia la factura`, async () => {
      const itemId = await h.seedItem({ stock: 100 });
      const invoice = await issued(side, [{ itemId, quantity: 2 }]);
      const res = await credit(side, invoice.id, {
        lines: [{ lineId: invoice.lines[0].id, quantity: 2 }],
      });
      const cancelled = await h.api('POST', `${h.invoicePath(side)}/${res.data.id}/cancel`);
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
      assert.equal((await headerOf(side, res.data.id)).status, 'X');
      assert.equal((await headerOf(side, invoice.id)).status, 'O');
    });

    test(`${side}: lo que no se puede abonar da 400`, async () => {
      const itemId = await h.seedItem({ stock: 100 });
      const invoice = await issued(side, [{ itemId, quantity: 2 }]);
      const lineId = invoice.lines[0].id;
      const draft = await h.invoice(side, [{ itemId, quantity: 1 }]);
      const [draftLine] = await linesOf(side, draft);
      const cancelledId = await h.invoice(side, [{ itemId, quantity: 1 }]);
      const [cancelledLine] = await linesOf(side, cancelledId);
      await h.api('POST', `${h.invoicePath(side)}/${cancelledId}/cancel`);
      const note = await credit(side, invoice.id, { lines: [{ lineId, quantity: 1 }] });
      const [noteLine] = await linesOf(side, note.data.id);

      const cases: Array<[string, string, Record<string, unknown>]> = [
        ['sin motivo', invoice.id, { reason: ' ', lines: [{ lineId, quantity: 1 }] }],
        ['sin líneas', invoice.id, { lines: [] }],
        ['cantidad cero', invoice.id, { lines: [{ lineId, quantity: 0 }] }],
        ['cantidad negativa', invoice.id, { lines: [{ lineId, quantity: -1 }] }],
        ['línea de otra factura', invoice.id, { lines: [{ lineId: draftLine.id, quantity: 1 }] }],
        [
          'tipo que no rectifica',
          invoice.id,
          { lines: [{ lineId, quantity: 1 }], documentTypeId: 'x' },
        ],
        ['un borrador', draft, { lines: [{ lineId: draftLine.id, quantity: 1 }] }],
        ['una cancelada', cancelledId, { lines: [{ lineId: cancelledLine.id, quantity: 1 }] }],
        ['otro abono', note.data.id, { lines: [{ lineId: noteLine.id, quantity: 1 }] }],
      ];
      for (const [name, id, body] of cases) {
        const res = await credit(side, id, body);
        assert.equal(res.status, 400, `${name}: ${JSON.stringify(res.data)}`);
      }
      const missing = await credit(side, 'no-existe', { lines: [{ lineId, quantity: 1 }] });
      assert.equal(missing.status, 404);
    });
  }

  test('sales: la mercancía que vuelve entra en todas las capas al emitir el abono', async () => {
    const itemId = await h.seedItem({ stock: 10 });
    const invoice = await issued('sales', [{ itemId, quantity: 4 }]);
    assert.equal((await h.stockOf(itemId)).global, 6);

    const res = await credit('sales', invoice.id, {
      lines: [{ lineId: invoice.lines[0].id, quantity: 3, returnStock: true }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual(await h.stockOf(itemId), { global: 6, warehouse: 6 }, 'en borrador, aún no');
    const [line] = await linesOf('sales', res.data.id);
    assert.equal(line.stockReturned, true);
    assert.equal(Number(line.quantity), -3);

    await h.post('sales', res.data.id);
    assert.deepEqual(await h.stockOf(itemId), { global: 9, warehouse: 9 });
  });

  test('sales: cancelar el abono en borrador no mueve nada', async () => {
    const itemId = await h.seedItem({ stock: 10 });
    const invoice = await issued('sales', [{ itemId, quantity: 4 }]);
    const res = await credit('sales', invoice.id, {
      lines: [{ lineId: invoice.lines[0].id, quantity: 3, returnStock: true }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    await h.api('POST', `/sales/invoices/${res.data.id}/cancel`);
    assert.deepEqual(await h.stockOf(itemId), { global: 6, warehouse: 6 });
  });

  test('sales: se puede devolver a otro almacén', async () => {
    const itemId = await h.seedItem({ stock: 10 });
    const invoice = await issued('sales', [{ itemId, quantity: 4 }]);
    await h.query(`INSERT INTO "Warehouse" (id, name) VALUES ('wh-otro', 'Otro')`);
    const res = await credit('sales', invoice.id, {
      lines: [
        { lineId: invoice.lines[0].id, quantity: 2, returnStock: true, warehouseId: 'wh-otro' },
      ],
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    await h.post('sales', res.data.id);
    const [row] = await h.query(
      `SELECT stock FROM "ItemWarehouseStock" WHERE "itemId" = '${itemId}' AND "warehouseId" = 'wh-otro'`,
    );
    assert.equal(Number(row.stock), 2);
  });

  test('sales: con ubicaciones obligatorias, lo que vuelve necesita ubicación', async () => {
    const itemId = await h.seedItem({ stock: 10 });
    const invoice = await issued('sales', [{ itemId, quantity: 4 }]);
    await h.query(
      `INSERT INTO "WarehouseZone" (id, "warehouseId", name) VALUES ('zona-1', '${h.warehouseId}', 'Pasillo A1')`,
    );
    await h.query(
      `INSERT INTO "SystemConfig" (id, key, value) VALUES ('cfg-zonas', 'enforceWarehouseZones', 'true')`,
    );
    try {
      const lineId = invoice.lines[0].id;
      const without = await credit('sales', invoice.id, {
        lines: [{ lineId, quantity: 1, returnStock: true }],
      });
      assert.notEqual(without.status, 200);
      assert.match(without.data.error, /Ubicación/);

      // Sin devolver no hace falta.
      const noReturn = await credit('sales', invoice.id, { lines: [{ lineId, quantity: 1 }] });
      assert.equal(noReturn.status, 200, JSON.stringify(noReturn.data));

      const withZone = await credit('sales', invoice.id, {
        lines: [{ lineId, quantity: 2, returnStock: true, zoneId: 'zona-1' }],
      });
      assert.equal(withZone.status, 200, JSON.stringify(withZone.data));
      await h.post('sales', withZone.data.id);
      const [zone] = await h.query(
        `SELECT stock FROM "ItemZoneStock" WHERE "itemId" = '${itemId}' AND "zoneId" = 'zona-1'`,
      );
      assert.equal(Number(zone.stock), 2);
    } finally {
      await h.query(`DELETE FROM "SystemConfig" WHERE id = 'cfg-zonas'`);
    }
  });

  test('purchase: devolver al proveedor saca la mercancía al emitir el abono', async () => {
    const itemId = await h.seedItem({ stock: 10 });
    const invoice = await issued('purchase', [{ itemId, quantity: 4 }]);
    assert.equal((await h.stockOf(itemId)).global, 14);
    const res = await credit('purchase', invoice.id, {
      lines: [{ lineId: invoice.lines[0].id, quantity: 3, returnStock: true }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual(await h.stockOf(itemId), { global: 14, warehouse: 14 }, 'en borrador, aún no');
    await h.post('purchase', res.data.id);
    assert.deepEqual(await h.stockOf(itemId), { global: 11, warehouse: 11 });
  });

  test('una factura de albarán no movió stock, pero su abono puede devolverlo', async () => {
    const itemId = await h.seedItem({ stock: 10 });
    const invoice = await issued('sales', [
      { itemId, quantity: 4, baseType: 'SDN', baseId: 'albaran-que-no-existe', baseLine: 1 },
    ]);
    assert.equal((await h.stockOf(itemId)).global, 10);
    const res = await credit('sales', invoice.id, {
      lines: [{ lineId: invoice.lines[0].id, quantity: 1, returnStock: true }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    await h.post('sales', res.data.id);
    assert.equal((await h.stockOf(itemId)).global, 11);
  });

  describe('lo que sale fuera', () => {
    const issuedNote = async (side: InvoiceSide) => {
      const itemId = await h.seedItem({ stock: 100 });
      const invoice = await issued(side, [{ itemId, quantity: 2 }]);
      const res = await credit(side, invoice.id, {
        reason: 'Precio mal puesto',
        lines: [{ lineId: invoice.lines[0].id, quantity: 2 }],
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return { invoiceId: invoice.id, noteId: res.data.id as string };
    };

    test('el conector fiscal recibe la factura que se rectifica', async (t) => {
      const seen: any[] = [];
      t.mock.method(FiscalConnectors, 'activeFor', () => [
        { id: 'prueba', name: 'Prueba', onPost: (ctx: any) => void seen.push(ctx) },
      ]);
      const { invoiceId, noteId } = await issuedNote('sales');
      assert.equal(seen.length, 1);
      assert.equal(seen[0].rectifies, undefined, 'una factura normal no rectifica nada');
      await h.post('sales', noteId);
      assert.equal(seen[1].document.rectifiesInvoiceId, invoiceId);
      assert.equal(seen[1].document.rectifyReason, 'Precio mal puesto');
      assert.equal(seen[1].rectifies.id, invoiceId);
      assert.equal(seen[1].rectifies.status, 'O');
      assert.ok(seen[1].rectifies.docNum);
    });

    test('la cadena de documentos enlaza la factura y su abono', async () => {
      const { invoiceId, noteId } = await issuedNote('sales');
      const children = await walkChain(h.db, 'SINV', invoiceId, 'forward');
      assert.ok(children.some((d: any) => d.id === noteId));
      const parents = await walkChain(h.db, 'SINV', noteId, 'back');
      assert.ok(parents.some((d: any) => d.id === invoiceId));
    });

    test('el PDF dice qué es y a cuál rectifica, en el idioma del documento', async () => {
      const { invoiceId, noteId } = await issuedNote('sales');
      const [invoice] = await h.query(
        `SELECT "docNum" FROM "SalesInvoice" WHERE id = '${invoiceId}'`,
      );
      const es: any = await PdfPayloadBuilder.build('SINV', noteId, h.db, 'es', h.tenantId);
      assert.equal(es.labels['docTitle.SINV'], 'Rectificativa');
      const legal = es.legalTexts.join(' ');
      assert.ok(legal.includes(String(invoice.docNum)), legal);
      assert.ok(legal.includes('Precio mal puesto'), legal);
      assert.ok(legal.startsWith('Rectifica'), legal);
      const en: any = await PdfPayloadBuilder.build('SINV', noteId, h.db, 'en', h.tenantId);
      assert.ok(en.legalTexts.join(' ').startsWith('Corrects'), en.legalTexts.join(' '));

      const normal: any = await PdfPayloadBuilder.build('SINV', invoiceId, h.db, 'es', h.tenantId);
      assert.equal(normal.labels['docTitle.SINV'], undefined);
      assert.ok(!normal.legalTexts.join(' ').startsWith('Rectifica'));
    });
  });

  describe('con lotes', () => {
    const batchRow = async (itemId: string, batchNum: string) => {
      const [master] = await h.query(
        `SELECT quantity FROM "ItemBatch" WHERE "itemId" = '${itemId}' AND "batchNum" = '${batchNum}'`,
      );
      const [stock] = await h.query(
        `SELECT quantity FROM "ItemBatchStock" WHERE "itemId" = '${itemId}' AND "batchNum" = '${batchNum}'`,
      );
      return { master: Number(master?.quantity), stock: Number(stock?.quantity) };
    };

    const soldFromTwoBatches = async () => {
      const itemId = await h.seedItem({ manageBy: 'B' });
      await issued('purchase', [
        {
          itemId,
          quantity: 10,
          batchDetails: [
            { batchNum: 'L1', quantity: 5 },
            { batchNum: 'L2', quantity: 5 },
          ],
        },
      ]);
      const sale = await issued('sales', [
        {
          itemId,
          quantity: 4,
          batchDetails: [
            { batchNum: 'L1', quantity: 3 },
            { batchNum: 'L2', quantity: 1 },
          ],
        },
      ]);
      return { itemId, sale };
    };

    test('vuelve a los lotes con los que salió, y no más', async () => {
      const { itemId, sale } = await soldFromTwoBatches();
      const lineId = sale.lines[0].id;
      assert.deepEqual(await batchRow(itemId, 'L1'), { master: 2, stock: 2 });

      const res = await credit('sales', sale.id, {
        lines: [{ lineId, quantity: 3, returnStock: true }],
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      await h.post('sales', res.data.id);
      assert.deepEqual(await batchRow(itemId, 'L1'), { master: 5, stock: 5 });
      assert.deepEqual(await batchRow(itemId, 'L2'), { master: 4, stock: 4 });

      // Lo que queda por devolver solo puede salir del lote L2.
      const rest = await credit('sales', sale.id, {
        lines: [{ lineId, quantity: 1, returnStock: true }],
      });
      assert.equal(rest.status, 200, JSON.stringify(rest.data));
      await h.post('sales', rest.data.id);
      assert.deepEqual(await batchRow(itemId, 'L1'), { master: 5, stock: 5 });
      assert.deepEqual(await batchRow(itemId, 'L2'), { master: 5, stock: 5 });
    });

    /** Un albarán de 4 con lotes, ya en la base, y su factura, que no los lleva. */
    const invoicedFromDeliveryNote = async () => {
      const { itemId } = await soldFromTwoBatches();
      const noteId = `sdn-${itemId}`;
      const lineId = `sdn-l-${itemId}`;
      const partnerId = await h.seedPartner();
      await h.query(
        `INSERT INTO "SalesDeliveryNote" (id, "seriesId", "docNum", date, "partnerId", "periodId", "warehouseId")
         VALUES ('${noteId}', '${h.seriesId.sales}', ${Math.floor(Math.random() * 1e6)}, now(), '${partnerId}', '${h.periodId}', '${h.warehouseId}')`,
      );
      await h.query(
        `INSERT INTO "SalesDeliveryNoteLine" (id, "deliveryId", "lineNum", "itemId", quantity, price, "lineTotal", "warehouseId")
         VALUES ('${lineId}', '${noteId}', 1, '${itemId}', 2, 50, 100, '${h.warehouseId}')`,
      );
      await h.query(
        `INSERT INTO "SalesDeliveryNoteLineBatch" (id, "deliveryLineId", "batchNum", quantity)
         VALUES ('${lineId}-b', '${lineId}', 'L2', 2)`,
      );
      const invoice = await issued(
        'sales',
        [
          {
            itemId,
            quantity: 2,
            baseType: 'SDN',
            baseId: noteId,
            baseLine: 1,
            batchDetails: [{ batchNum: 'L2', quantity: 2 }],
          },
        ],
        { partnerId },
      );
      return { itemId, invoice };
    };

    test('una factura de albarán devuelve a los lotes del albarán', async () => {
      const { itemId, invoice } = await invoicedFromDeliveryNote();
      const before = await batchRow(itemId, 'L2');
      const res = await credit('sales', invoice.id, {
        lines: [{ lineId: invoice.lines[0].id, quantity: 2, returnStock: true }],
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      await h.post('sales', res.data.id);
      assert.deepEqual(await batchRow(itemId, 'L2'), {
        master: before.master + 2,
        stock: before.stock + 2,
      });
    });

    test('si no consta de qué lote salió, no se devuelve a ciegas', async () => {
      const itemId = await h.seedItem({ manageBy: 'B' });
      const invoice = await issued('sales', [
        {
          itemId,
          quantity: 1,
          baseType: 'SDN',
          baseId: 'albaran-sin-lotes',
          baseLine: 1,
          batchDetails: [{ batchNum: 'L9', quantity: 1 }],
        },
      ]);
      const stock = await h.stockOf(itemId);
      const res = await credit('sales', invoice.id, {
        lines: [{ lineId: invoice.lines[0].id, quantity: 1, returnStock: true }],
      });
      assert.equal(res.status, 400, JSON.stringify(res.data));
      assert.deepEqual(await h.stockOf(itemId), stock);

      const without = await credit('sales', invoice.id, {
        lines: [{ lineId: invoice.lines[0].id, quantity: 1 }],
      });
      assert.equal(without.status, 200, 'sin devolver sí se puede');
    });

    test('al cancelar el abono los lotes vuelven a salir', async () => {
      const { itemId, sale } = await soldFromTwoBatches();
      const res = await credit('sales', sale.id, {
        lines: [{ lineId: sale.lines[0].id, quantity: 2, returnStock: true }],
      });
      await h.api('POST', `/sales/invoices/${res.data.id}/cancel`);
      assert.deepEqual(await batchRow(itemId, 'L1'), { master: 2, stock: 2 });
      assert.deepEqual(await batchRow(itemId, 'L2'), { master: 4, stock: 4 });
    });

    test('sin devolución, un abono de artículo con lotes no los toca ni los pide', async () => {
      const { itemId, sale } = await soldFromTwoBatches();
      const res = await credit('sales', sale.id, {
        lines: [{ lineId: sale.lines[0].id, quantity: 2 }],
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.deepEqual(await batchRow(itemId, 'L1'), { master: 2, stock: 2 });
    });
  });
});
