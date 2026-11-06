/** Lo que se puede cobrar de una factura, y lo que la factura dice de sus abonos. */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { FactuApiTransaction } from '../../plugins/FactuApi';
import {
  startDocumentsHarness,
  testDatabaseUrl,
  type DocumentsHarness,
  type InvoiceSide,
} from './documentsHarness';

describe('cobros de una factura', { skip: !testDatabaseUrl }, () => {
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

  const tableOf = (side: InvoiceSide) => (side === 'sales' ? 'SalesInvoice' : 'PurchaseInvoice');
  const fkOf = (side: InvoiceSide) => (side === 'sales' ? 'salesInvoiceId' : 'purchaseInvoiceId');
  const headerOf = async (side: InvoiceSide, id: string) => {
    const [row] = await h.query(`SELECT * FROM "${tableOf(side)}" WHERE id = '${id}'`);
    return row;
  };
  const paymentCount = async (side: InvoiceSide, id: string) => {
    const rows = await h.query(`SELECT id FROM "Payment" WHERE "${fkOf(side)}" = '${id}'`);
    return rows.length;
  };

  /** Una factura de 121 emitida (100 + 21 %), con tantas unidades como se pidan. */
  const issued = async (side: InvoiceSide, quantity = 1) => {
    const itemId = await h.seedItem({ stock: 100 });
    const id = await h.invoice(side, [{ itemId, quantity, price: 100 / quantity }]);
    await h.post(side, id);
    const [line] = await h.query(
      `SELECT * FROM "${tableOf(side)}Line" WHERE "invoiceId" = '${id}'`,
    );
    return { id, lineId: line.id };
  };

  const collect = (side: InvoiceSide, id: string, amount: number) =>
    h.api('POST', '/payments', {
      [fkOf(side)]: id,
      date: '2026-11-04',
      amount,
      reference: `T-${Math.random()}`,
    });

  const note = async (side: InvoiceSide, invoice: { id: string; lineId: string }, quantity = 1) => {
    const res = await h.api('POST', `${h.invoicePath(side)}/${invoice.id}/credit-note`, {
      reason: 'Error en la factura',
      externalRef: side === 'purchase' ? `AB-${Math.random()}` : undefined,
      lines: [{ lineId: invoice.lineId, quantity }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data.id as string;
  };

  for (const side of ['sales', 'purchase'] as const) {
    test(`${side}: se cobra en varias veces hasta el total`, async () => {
      const { id } = await issued(side);
      const first = await collect(side, id, 50);
      assert.equal(first.status, 200, JSON.stringify(first.data));
      assert.equal((await headerOf(side, id)).paymentStatus, 'partial');

      const rest = await collect(side, id, 71);
      assert.equal(rest.status, 200, JSON.stringify(rest.data));
      const after = await headerOf(side, id);
      assert.equal(after.paymentStatus, 'paid');
      assert.equal(Number(after.amountPaid), 121);
    });

    test(`${side}: no se cobra más de lo que queda`, async () => {
      const { id } = await issued(side);
      await collect(side, id, 50);

      const tooMuch = await collect(side, id, 71.01);
      assert.equal(tooMuch.status, 409, JSON.stringify(tooMuch.data));
      assert.match(tooMuch.data.error, /71\.00/);
      assert.equal(Number((await headerOf(side, id)).amountPaid), 50);
      assert.equal(await paymentCount(side, id), 1);
    });

    test(`${side}: una factura ya cobrada no admite más cobros`, async () => {
      const { id } = await issued(side);
      await collect(side, id, 121);

      const again = await collect(side, id, 0.01);
      assert.equal(again.status, 409, JSON.stringify(again.data));
      assert.match(again.data.error, /saldada/);
      assert.equal(await paymentCount(side, id), 1);
    });

    test(`${side}: dos cobros a la vez no pasan los dos`, async () => {
      const { id } = await issued(side);
      const results = await Promise.all([collect(side, id, 121), collect(side, id, 121)]);

      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal(await paymentCount(side, id), 1);
      assert.equal(Number((await headerOf(side, id)).amountPaid), 121);
    });

    test(`${side}: borrar un cobro vuelve a dejar cobrar`, async () => {
      const { id } = await issued(side);
      const paid = await collect(side, id, 121);
      assert.equal(paid.status, 200, JSON.stringify(paid.data));

      const removed = await h.api('DELETE', `/payments/${paid.data.id}`);
      assert.equal(removed.status, 200, JSON.stringify(removed.data));
      const again = await collect(side, id, 121);
      assert.equal(again.status, 200, JSON.stringify(again.data));
    });

    test(`${side}: una factura saldada con su abono tampoco admite cobros`, async () => {
      const invoice = await issued(side);
      await h.post(side, await note(side, invoice));

      const res = await collect(side, invoice.id, 1);
      assert.equal(res.status, 409, JSON.stringify(res.data));
    });

    test(`${side}: un borrador o una factura cancelada no se cobran`, async () => {
      const itemId = await h.seedItem({ stock: 100 });
      const draft = await h.invoice(side, [{ itemId, quantity: 1, price: 100 }]);

      const onDraft = await collect(side, draft, 10);
      assert.equal(onDraft.status, 409, JSON.stringify(onDraft.data));

      const cancelled = await h.api('POST', `${h.invoicePath(side)}/${draft}/cancel`);
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
      const onCancelled = await collect(side, draft, 10);
      assert.equal(onCancelled.status, 409, JSON.stringify(onCancelled.data));
      assert.equal(await paymentCount(side, draft), 0);
    });

    test(`${side}: un importe de cero o que no es un número no vale`, async () => {
      const { id } = await issued(side);
      assert.equal((await collect(side, id, 0)).status, 400);
      assert.equal((await collect(side, id, Number.NaN)).status, 400);
      assert.equal(await paymentCount(side, id), 0);
    });

    test(`${side}: una factura que no existe da 404`, async () => {
      const res = await collect(side, '00000000-0000-0000-0000-000000000000', 10);
      assert.equal(res.status, 404, JSON.stringify(res.data));
    });

    test(`${side}: las fracciones de céntimo no dejan una factura a medias`, async () => {
      // El total guarda más decimales de los que se cobran: 121,004 se salda con 121,00.
      const below = await issued(side);
      await h.query(`UPDATE "${tableOf(side)}" SET total = 121.004 WHERE id = '${below.id}'`);
      const exact = await collect(side, below.id, 121);
      assert.equal(exact.status, 200, JSON.stringify(exact.data));
      assert.equal((await headerOf(side, below.id)).paymentStatus, 'paid');
      assert.equal((await collect(side, below.id, 0.01)).status, 409);

      // Y 120,996 también: es lo que propone la ventana al redondear.
      const above = await issued(side);
      await h.query(`UPDATE "${tableOf(side)}" SET total = 120.996 WHERE id = '${above.id}'`);
      const rounded = await collect(side, above.id, 121);
      assert.equal(rounded.status, 200, JSON.stringify(rounded.data));
      assert.equal((await headerOf(side, above.id)).paymentStatus, 'paid');
    });

    test(`${side}: el saldo de un abono se sigue devolviendo, hasta donde llega`, async () => {
      const invoice = await issued(side);
      await collect(side, invoice.id, 121);
      const noteId = await note(side, invoice);
      await h.post(side, noteId);

      const tooMuch = await collect(side, noteId, -121.01);
      assert.equal(tooMuch.status, 400, JSON.stringify(tooMuch.data));
      const refund = await collect(side, noteId, -121);
      assert.equal(refund.status, 200, JSON.stringify(refund.data));
      assert.equal((await headerOf(side, noteId)).paymentStatus, 'paid');
      assert.equal((await collect(side, noteId, -0.01)).status, 400);
    });

    test(`${side}: las integraciones tampoco cobran de más, y la factura se entera`, async () => {
      const { id } = await issued(side);
      const api = new FactuApiTransaction(h.tenantId, h.db, null);
      const pay = (amount: number) =>
        api.registerPayment({ invoiceId: id, direction: side, amount, reference: 'PLUGIN' });

      await pay(121);
      const after = await headerOf(side, id);
      assert.equal(after.paymentStatus, 'paid');
      assert.equal(Number(after.amountPaid), 121);
      await assert.rejects(pay(1), /saldada/);
      assert.equal(await paymentCount(side, id), 1);
    });

    test(`${side}: la factura dice qué abonos tiene y si queda algo por abonar`, async () => {
      const invoice = await issued(side, 2);
      const path = `${h.invoicePath(side)}/${invoice.id}/credit-notes`;

      const none = await h.api('GET', path);
      assert.equal(none.status, 200, JSON.stringify(none.data));
      assert.deepEqual(none.data, { notes: [], creditable: true, pendingReturn: 0 });

      // Cobrada del todo: lo que se abone queda a favor.
      await collect(side, invoice.id, 121);
      const firstId = await note(side, invoice, 1);
      const draft = await h.api('GET', path);
      assert.equal(draft.data.notes.length, 1);
      assert.equal(draft.data.notes[0].status, 'D');
      assert.equal(draft.data.notes[0].available, 0, 'en borrador aún no hay nada a favor');

      await h.post(side, firstId);
      const partial = await h.api('GET', path);
      assert.equal(partial.data.creditable, true);
      assert.equal(partial.data.notes[0].id, firstId);
      assert.equal(partial.data.notes[0].status, 'O');
      assert.equal(partial.data.notes[0].total, -60.5);
      assert.equal(partial.data.notes[0].available, 60.5);
      assert.ok(partial.data.notes[0].code, 'con el código por el que se conoce');
      assert.equal(partial.data.notes[0].documentTypeName, 'Rectificativa');

      const secondId = await note(side, invoice, 1);
      await h.post(side, secondId);
      const full = await h.api('GET', path);
      assert.equal(full.data.notes.length, 2);
      assert.equal(full.data.creditable, false);

      // Un abono cancelado deja de contar.
      const other = await issued(side);
      const cancelledId = await note(side, other);
      await h.api('POST', `${h.invoicePath(side)}/${cancelledId}/cancel`);
      const cancelled = await h.api('GET', `${h.invoicePath(side)}/${other.id}/credit-notes`);
      assert.deepEqual(cancelled.data, { notes: [], creditable: true, pendingReturn: 0 });
    });

    test(`${side}: el listado distingue un abono y una factura con abono`, async () => {
      const invoice = await issued(side);
      const plain = await issued(side);
      const noteId = await note(side, invoice);
      await h.post(side, noteId);

      const list = await h.api('GET', h.invoicePath(side));
      assert.equal(list.status, 200, JSON.stringify(list.data));
      const row = (id: string) => list.data.find((r: any) => r.id === id);
      assert.equal(row(invoice.id).creditNoteCount, 1);
      assert.equal(row(plain.id).creditNoteCount, 0);
      assert.equal(row(noteId).rectifiesInvoiceId, invoice.id);
    });
  }
});
