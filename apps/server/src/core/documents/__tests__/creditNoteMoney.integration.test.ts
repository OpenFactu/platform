/** El dinero de un abono: baja la deuda de su factura y lo que sobre queda a favor. */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startDocumentsHarness,
  testDatabaseUrl,
  type DocumentsHarness,
  type InvoiceSide,
} from './documentsHarness';

describe('dinero de los abonos', { skip: !testDatabaseUrl }, () => {
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

  /** Una factura de 121 emitida (100 + 21 %). */
  const issued = async (side: InvoiceSide, partnerId?: string) => {
    const itemId = await h.seedItem({ stock: 100 });
    const id = await h.invoice(side, [{ itemId, quantity: 1, price: 100 }], {
      ...(partnerId ? { partnerId } : {}),
    });
    await h.post(side, id);
    const [line] = await h.query(
      `SELECT * FROM "${tableOf(side)}Line" WHERE "invoiceId" = '${id}'`,
    );
    return { id, lineId: line.id, partnerId: (await headerOf(side, id)).partnerId };
  };

  /** Un abono total de esa factura, ya emitido. */
  const issuedNote = async (side: InvoiceSide, invoice: { id: string; lineId: string }) => {
    const res = await h.api('POST', `${h.invoicePath(side)}/${invoice.id}/credit-note`, {
      reason: 'Error en la factura',
      externalRef: side === 'purchase' ? `AB-${Math.random()}` : undefined,
      lines: [{ lineId: invoice.lineId, quantity: 1 }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    await h.post(side, res.data.id);
    return res.data.id as string;
  };

  const collect = (side: InvoiceSide, id: string, amount: number) =>
    h.api('POST', '/payments', {
      [fkOf(side)]: id,
      date: '2026-11-04',
      amount,
      reference: `T-${Math.random()}`,
    });

  for (const side of ['sales', 'purchase'] as const) {
    test(`${side}: emitir el abono de una factura pendiente la deja saldada, sin asiento de cobro`, async () => {
      const invoice = await issued(side);
      const noteId = await issuedNote(side, invoice);

      const after = await headerOf(side, invoice.id);
      assert.equal(after.paymentStatus, 'paid');
      assert.equal(Number(after.amountPaid), 121);
      const note = await headerOf(side, noteId);
      assert.equal(note.paymentStatus, 'paid');
      assert.equal(Number(note.amountPaid), -121);
      assert.deepEqual(note.paymentDueLines, []);

      const rows = await h.query(
        `SELECT * FROM "Payment" WHERE "sourceRef" IN ('${invoice.id}', '${noteId}')`,
      );
      assert.equal(rows.length, 2);
      assert.ok(rows.every((r: any) => r.source === 'credit_note'));
      for (const row of rows) {
        const entries = await h.query(
          `SELECT id FROM "JournalEntry" WHERE source = 'payment' AND "sourceDocumentId" = '${row.id}'`,
        );
        assert.equal(entries.length, 0);
      }

      const entry = await h.entryOf(noteId);
      assert.equal(entry?.debit, 121);
      assert.equal(entry?.credit, 121);
    });

    test(`${side}: de una factura cobrada a medias aplica lo pendiente y el resto queda a favor`, async () => {
      const invoice = await issued(side);
      assert.equal((await collect(side, invoice.id, 21)).status, 200);
      const noteId = await issuedNote(side, invoice);

      const after = await headerOf(side, invoice.id);
      assert.equal(after.paymentStatus, 'paid');
      assert.equal(Number(after.amountPaid), 121);
      const note = await headerOf(side, noteId);
      assert.equal(note.paymentStatus, 'partial');
      assert.equal(Number(note.amountPaid), -100);

      const balance = await h.api(
        'GET',
        `${h.invoicePath(side)}/credit-balance?partnerId=${invoice.partnerId}`,
      );
      assert.equal(balance.status, 200);
      assert.equal(balance.data.total, 21);
      assert.equal(balance.data.notes[0].id, noteId);
      assert.equal(balance.data.notes[0].available, 21);
    });

    test(`${side}: el saldo se aplica a otra factura del mismo interlocutor`, async () => {
      const invoice = await issued(side);
      await collect(side, invoice.id, 121);
      const noteId = await issuedNote(side, invoice);
      const other = await issued(side, invoice.partnerId);
      const stranger = await issued(side);
      const path = `${h.invoicePath(side)}/${noteId}/apply-credit`;

      const cases: Array<[string, Record<string, unknown>]> = [
        ['de otro interlocutor', { targetInvoiceId: stranger.id, amount: 10 }],
        ['más del saldo', { targetInvoiceId: other.id, amount: 200 }],
        ['importe cero', { targetInvoiceId: other.id, amount: 0 }],
        ['importe negativo', { targetInvoiceId: other.id, amount: -5 }],
        ['a sí mismo', { targetInvoiceId: noteId, amount: 5 }],
      ];
      for (const [name, body] of cases) {
        const res = await h.api('POST', path, body);
        assert.equal(res.status, 400, `${name}: ${JSON.stringify(res.data)}`);
      }

      const targets = await h.api('GET', `${h.invoicePath(side)}/${noteId}/credit-targets`);
      assert.equal(targets.status, 200);
      assert.deepEqual(
        targets.data.map((t: any) => [t.id, t.remaining]),
        [[other.id, 121]],
        'solo las facturas con deuda de ese interlocutor',
      );

      const res = await h.api('POST', path, { targetInvoiceId: other.id, amount: 21 });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(Number((await headerOf(side, other.id)).amountPaid), 21);
      assert.equal((await headerOf(side, other.id)).paymentStatus, 'partial');
      assert.equal(Number((await headerOf(side, noteId)).amountPaid), -21);

      // No cabe más de lo que debe la factura destino.
      const smallOther = await issued(side, invoice.partnerId);
      await collect(side, smallOther.id, 120);
      const tooMuch = await h.api('POST', path, { targetInvoiceId: smallOther.id, amount: 2 });
      assert.equal(tooMuch.status, 400);
    });

    test(`${side}: devolver el saldo con un pago negativo genera el asiento al revés`, async () => {
      const invoice = await issued(side);
      await collect(side, invoice.id, 121);
      const noteId = await issuedNote(side, invoice);

      assert.equal((await collect(side, noteId, -200)).status, 400, 'más del saldo');
      assert.equal((await collect(side, noteId, 10)).status, 400, 'positivo en un abono');
      assert.equal((await collect(side, invoice.id, -10)).status, 400, 'negativo en una factura');

      const refund = await collect(side, noteId, -121);
      assert.equal(refund.status, 200, JSON.stringify(refund.data));
      assert.ok(refund.data.journalEntryId);
      const note = await headerOf(side, noteId);
      assert.equal(note.paymentStatus, 'paid');

      const lines = await h.query(
        `SELECT l.debit, l.credit, a.name AS kind FROM "JournalEntryLine" l
         JOIN "ChartOfAccount" a ON a.id = l."accountId"
         WHERE l."entryId" = '${refund.data.journalEntryId}'`,
      );
      const counter = lines.find((l: any) =>
        ['customer_receivable', 'supplier_payable'].includes(l.kind),
      );
      assert.equal(Number(side === 'sales' ? counter.debit : counter.credit), 121);
    });

    test(`${side}: un abono emitido no se cancela y sus cobros automáticos no se borran`, async () => {
      const invoice = await issued(side);
      const noteId = await issuedNote(side, invoice);
      const cancel = await h.api('POST', `${h.invoicePath(side)}/${noteId}/cancel`);
      assert.equal(cancel.status, 409);
      const [row] = await h.query(`SELECT id FROM "Payment" WHERE "sourceRef" = '${noteId}'`);
      const remove = await h.api('DELETE', `/payments/${row.id}`);
      assert.equal(remove.status, 409);
    });
  }

  test('la aplicación de un abono cita los códigos completos', async () => {
    const invoice = await issued('sales');
    const note: any = await issuedNote('sales', invoice);
    const noteId = typeof note === 'string' ? note : note.id;
    const [applied] = await h.query(
      `SELECT reference FROM "Payment" WHERE source = 'credit_note' AND "salesInvoiceId" = '${invoice.id}'`,
    );
    const links = await h.api('GET', `/document-links?type=SINV&id=${noteId}`);
    assert.equal(applied.reference, `Abono ${links.data.current.code}`);
  });

  test('la antigüedad de deuda sale neta', async () => {
    const invoice = await issued('sales');
    await collect('sales', invoice.id, 21);
    const noteId = await issuedNote('sales', invoice);
    const { data } = await h.api('GET', '/reports/aging-receivables');
    const rows = data.rows ?? data;
    const mine = rows.filter((r: any) => r.partnerName === undefined || r.pending !== undefined);
    const [note] = await h.query(`SELECT "docNum" FROM "SalesInvoice" WHERE id = '${noteId}'`);
    const row = mine.find((r: any) =>
      String(r.code).endsWith(String(note.docNum).padStart(6, '0')),
    );
    assert.equal(row.pending, -21);
    const [issuedRow] = await h.query(
      `SELECT "docNum" FROM "SalesInvoice" WHERE id = '${invoice.id}'`,
    );
    assert.equal(
      mine.find((r: any) => String(r.code).endsWith(String(issuedRow.docNum).padStart(6, '0'))),
      undefined,
      'la factura ya está saldada',
    );
  });

  test('el libro resumen de impuestos sale neto', async () => {
    const sums = async () => {
      const { data } = await h.api('GET', '/reports/tax-summary');
      const sum = (rows: any[], key: string) => rows.reduce((total, r) => total + r[key], 0);
      return [sum(data.output, 'base'), sum(data.output, 'tax'), data.output.length];
    };
    const [baseBefore, taxBefore, countBefore] = await sums();
    const invoice = await issued('sales');
    await issuedNote('sales', invoice);
    const [baseAfter, taxAfter, countAfter] = await sums();
    assert.equal(baseAfter, baseBefore);
    assert.equal(taxAfter, taxBefore);
    assert.equal(countAfter, countBefore + 2, 'salen los dos documentos');
  });
});
