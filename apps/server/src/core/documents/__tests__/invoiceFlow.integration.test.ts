/**
 * Las facturas de punta a punta contra la API real: lo que tiene que seguir
 * funcionando al añadir abonos y coste.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startDocumentsHarness,
  testDatabaseUrl,
  type DocumentsHarness,
  type InvoiceSide,
} from './documentsHarness';

describe('flujo de facturas', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;

  before(async () => {
    h = await startDocumentsHarness();
  });
  after(async () => {
    await h?.close();
  });

  const headerOf = async (side: InvoiceSide, id: string) => {
    const table = side === 'sales' ? 'SalesInvoice' : 'PurchaseInvoice';
    const [row] = await h.query(`SELECT * FROM "${table}" WHERE id = '${id}'`);
    return row;
  };

  test('una factura de venta directa saca el stock al asentarse', async () => {
    const itemId = await h.seedItem({ stock: 10 });
    const id = await h.invoice('sales', [{ itemId, quantity: 3 }]);
    assert.deepEqual(await h.stockOf(itemId), { global: 10, warehouse: 10 });
    await h.post('sales', id);
    assert.deepEqual(await h.stockOf(itemId), { global: 7, warehouse: 7 });
  });

  test('una factura de compra directa mete el stock al asentarse', async () => {
    const itemId = await h.seedItem({ stock: 10 });
    const id = await h.invoice('purchase', [{ itemId, quantity: 3 }]);
    assert.deepEqual(await h.stockOf(itemId), { global: 10, warehouse: 10 });
    await h.post('purchase', id);
    assert.deepEqual(await h.stockOf(itemId), { global: 13, warehouse: 13 });
  });

  for (const side of ['sales', 'purchase'] as const) {
    test(`emitir una factura de ${side} la bloquea y genera un asiento que cuadra`, async () => {
      const itemId = await h.seedItem({ stock: 10 });
      const id = await h.invoice(side, [{ itemId, quantity: 2 }]);
      assert.equal((await headerOf(side, id)).status, 'D');
      assert.equal(await h.entryOf(id), null);

      const posted = await h.post(side, id);
      assert.ok(posted.journalEntryId);
      const header = await headerOf(side, id);
      assert.equal(header.status, 'O');
      assert.equal(header.isLocked, true);
      assert.equal(Number(header.total), 121);
      const entry = await h.entryOf(id);
      assert.equal(entry?.debit, 121);
      assert.equal(entry?.credit, 121);
    });

    test(`un cobro baja lo pendiente de una factura de ${side} y genera su asiento`, async () => {
      const itemId = await h.seedItem({ stock: 10 });
      const id = await h.invoice(side, [{ itemId, quantity: 2 }]);
      await h.post(side, id);
      const link = side === 'sales' ? { salesInvoiceId: id } : { purchaseInvoiceId: id };

      const partial = await h.api('POST', '/payments', {
        ...link,
        date: '2026-06-20',
        amount: 21,
        reference: 'T-1',
      });
      assert.equal(partial.status, 200);
      assert.ok(partial.data.journalEntryId);
      assert.equal((await headerOf(side, id)).paymentStatus, 'partial');

      await h.api('POST', '/payments', {
        ...link,
        date: '2026-06-21',
        amount: 100,
        reference: 'T-2',
      });
      const paid = await headerOf(side, id);
      assert.equal(paid.paymentStatus, 'paid');
      assert.equal(Number(paid.amountPaid), 121);
    });

    test(`cancelar un borrador de ${side} devuelve el stock`, async () => {
      const itemId = await h.seedItem({ stock: 10 });
      const before = await h.stockOf(itemId);
      const id = await h.invoice(side, [{ itemId, quantity: 4 }]);
      const cancelled = await h.api('POST', `${h.invoicePath(side)}/${id}/cancel`);
      assert.equal(cancelled.status, 200);
      assert.equal((await headerOf(side, id)).status, 'X');
      assert.deepEqual(await h.stockOf(itemId), before);
    });
  }

  test('con varios tipos de impuesto el asiento lleva cada cuota', async () => {
    const itemId = await h.seedItem({ stock: 10 });
    const id = await h.invoice('sales', [
      { itemId, quantity: 1, price: 100 },
      { itemId, quantity: 1, price: 100, taxGroupId: h.tax.reduced },
    ]);
    await h.post('sales', id);
    const header = await headerOf('sales', id);
    assert.equal(Number(header.taxTotal), 31);
    assert.equal(Number(header.total), 231);
    const entry = await h.entryOf(id);
    assert.equal(entry?.debit, 231);
    assert.equal(entry?.credit, 231);
  });
});
