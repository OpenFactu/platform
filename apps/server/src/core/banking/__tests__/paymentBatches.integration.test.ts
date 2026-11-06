/**
 * Remesas: vencimientos de facturas agrupados para cobrarlos o pagarlos de una vez. Borrador,
 * generada y cerrada. Al cerrar se crean los cobros, y una devolución los deshace y reabre la deuda.
 * Nada sale solo: el fichero lo genera y lo sube alguien.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  startDocumentsHarness,
  testDatabaseUrl,
  type DocumentsHarness,
} from '../../documents/__tests__/documentsHarness';
import { BankFormats } from '../bankFormats';
import { TenantPluginCache } from '../../plugins/TenantPluginCache';

const IBAN = 'DE89370400440532013000';

describe('remesas', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;
  let bankAccountId: string;
  let ledger: string;

  before(async () => {
    h = await startDocumentsHarness();
    const [bank] = await h.query(`SELECT id FROM "ChartOfAccount" WHERE code = '572000'`);
    ledger = bank.id;
    const account = await h.api('POST', '/bank-accounts', {
      name: 'Principal',
      iban: IBAN,
      accountId: ledger,
    });
    assert.equal(account.status, 200, JSON.stringify(account.data));
    bankAccountId = account.data.id;
  });
  after(async () => {
    await h?.close();
  });

  const partnerWithBank = async () => {
    const id = await h.seedPartner();
    await h.query(
      `UPDATE "BusinessPartner" SET iban = 'GB82WEST12345698765432', "bankSwift" = 'WESTGB2L', "mandateRef" = 'MAND-${id}', "mandateDate" = '2026-01-10' WHERE id = '${id}'`,
    );
    return id;
  };
  const issued = async (
    side: 'sales' | 'purchase' = 'sales',
    extra: Record<string, unknown> = {},
  ) => {
    const item = await h.seedItem({ stock: 100 });
    const partnerId = (extra.partnerId as string) ?? (await partnerWithBank());
    const id = await h.invoice(side, [{ itemId: item, quantity: 1, price: 100 }], {
      partnerId,
      ...extra,
    });
    await h.post(side, id);
    return id;
  };
  const totalOf = async (id: string, table = 'SalesInvoice') => {
    const [row] = await h.query(`SELECT total FROM "${table}" WHERE id = '${id}'`);
    return Number(row.total);
  };
  /** Le pone plazos a una factura ya emitida. */
  const withDues = async (invoiceId: string, dues: Array<{ date: string; amount: number }>) => {
    await h.query(
      `UPDATE "SalesInvoice" SET "paymentDueLines" = '${JSON.stringify(dues)}' WHERE id = '${invoiceId}'`,
    );
  };
  const candidates = async (kind = 'collection') =>
    (await h.api('GET', `/payment-batches/candidates?kind=${kind}`)).data;
  const candidateOf = async (invoiceId: string, kind = 'collection') =>
    (await candidates(kind)).filter((row: any) => row.invoiceId === invoiceId);
  const newBatch = async (invoiceId: string, extra: Record<string, unknown> = {}) => {
    const [row] = await candidateOf(invoiceId);
    assert.ok(row, 'la factura no aparece como candidata');
    const res = await h.api('POST', '/payment-batches', {
      kind: 'collection',
      bankAccountId,
      chargeDate: '2026-07-01',
      lines: [{ invoiceId, dueDate: row.dueDate, amount: row.amount }],
      ...extra,
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data.id as string;
  };
  const batchOf = async (id: string) => (await h.api('GET', `/payment-batches/${id}`)).data;
  const generate = async (id: string) => {
    const res = await h.api('POST', `/payment-batches/${id}/generate`, { exporterId: 'csv' });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data;
  };
  const close = async (id: string) => h.api('POST', `/payment-batches/${id}/close`);
  const paymentsOf = (invoiceId: string) =>
    h.query(`SELECT * FROM "Payment" WHERE "salesInvoiceId" = '${invoiceId}'`);

  describe('qué se puede meter', () => {
    test('las facturas emitidas con deuda, con los datos del interlocutor', async () => {
      const invoice = await issued();
      const [row] = await candidateOf(invoice);
      assert.equal(row.amount, await totalOf(invoice));
      assert.equal(row.iban, 'GB82WEST12345698765432');
      assert.match(row.mandateRef, /^MAND-/);
      assert.ok(row.code);
      assert.deepEqual(row.problems, []);
    });

    test('un borrador, un abono o lo ya cobrado no salen', async () => {
      const item = await h.seedItem({ stock: 100 });
      const draft = await h.invoice('sales', [{ itemId: item, quantity: 1, price: 10 }]);
      assert.deepEqual(await candidateOf(draft), []);

      const paid = await issued();
      await h.api('POST', '/payments', {
        salesInvoiceId: paid,
        date: '2026-06-20',
        amount: await totalOf(paid),
        reference: 'YA',
      });
      assert.deepEqual(await candidateOf(paid), []);
    });

    test('cada plazo por su lado, y lo cobrado cubre primero el más antiguo', async () => {
      const invoice = await issued();
      const total = await totalOf(invoice);
      await withDues(invoice, [
        { date: '2026-07-01', amount: total - 40 },
        { date: '2026-08-01', amount: 40 },
      ]);
      await h.api('POST', '/payments', {
        salesInvoiceId: invoice,
        date: '2026-06-20',
        amount: 10,
        reference: 'A',
      });
      const rows = await candidateOf(invoice);
      assert.deepEqual(
        rows.map((row: any) => [row.dueDate, row.amount]),
        [
          ['2026-07-01', total - 50],
          ['2026-08-01', 40],
        ],
      );
    });

    test('se puede pedir solo lo que vence hasta una fecha', async () => {
      const invoice = await issued();
      await withDues(invoice, [{ date: '2030-01-01', amount: await totalOf(invoice) }]);
      const until = await h.api(
        'GET',
        '/payment-batches/candidates?kind=collection&until=2026-12-31',
      );
      assert.ok(!until.data.some((row: any) => row.invoiceId === invoice));
    });

    test('dice lo que le falta a cada interlocutor', async () => {
      const partner = await h.seedPartner();
      const invoice = await issued('sales', { partnerId: partner });
      const [row] = await candidateOf(invoice);
      assert.deepEqual(row.problems.sort(), ['noIban', 'noMandate']);
    });

    test('para pagar a proveedores salen las de compra, sin pedir mandato', async () => {
      const invoice = await issued('purchase');
      const [row] = await candidateOf(invoice, 'payment');
      assert.ok(row, 'sin candidata');
      assert.deepEqual(row.problems, []);
      assert.deepEqual(await candidateOf(invoice, 'collection'), []);
    });

    test('lo que ya está en otra remesa viva no se ofrece otra vez', async () => {
      const invoice = await issued();
      const batch = await newBatch(invoice);
      assert.deepEqual(await candidateOf(invoice), []);
      assert.equal((await h.api('DELETE', `/payment-batches/${batch}`)).status, 200);
      assert.equal((await candidateOf(invoice)).length, 1);
    });
  });

  describe('crear', () => {
    test('queda en borrador, con su código, total y los datos congelados', async () => {
      const invoice = await issued();
      const total = await totalOf(invoice);
      const id = await newBatch(invoice);
      const batch = await batchOf(id);
      assert.equal(batch.status, 'draft');
      assert.match(batch.code, /^REM-/);
      assert.equal(Number(batch.total), Math.round(total * 100) / 100);
      assert.equal(batch.lines[0].iban, 'GB82WEST12345698765432');
      assert.ok(batch.lines[0].invoiceCode);
      assert.ok(batch.lines[0].partnerName);
      assert.deepEqual(await paymentsOf(invoice), [], 'un borrador no cobra nada');
    });

    test('no pasa de lo que queda ni de la deuda reservada', async () => {
      const invoice = await issued();
      const total = await totalOf(invoice);
      const tooMuch = await h.api('POST', '/payment-batches', {
        kind: 'collection',
        bankAccountId,
        chargeDate: '2026-07-01',
        lines: [{ invoiceId: invoice, dueDate: '2026-06-15', amount: total + 1 }],
      });
      assert.equal(tooMuch.status, 409, JSON.stringify(tooMuch.data));

      await newBatch(invoice);
      const twice = await h.api('POST', '/payment-batches', {
        kind: 'collection',
        bankAccountId,
        chargeDate: '2026-07-01',
        lines: [{ invoiceId: invoice, dueDate: '2026-06-15', amount: 1 }],
      });
      assert.equal(twice.status, 409, JSON.stringify(twice.data));
    });

    test('la misma factura dos veces en la remesa tampoco pasa de su deuda', async () => {
      const invoice = await issued();
      const total = await totalOf(invoice);
      const res = await h.api('POST', '/payment-batches', {
        kind: 'collection',
        bankAccountId,
        chargeDate: '2026-07-01',
        lines: [
          { invoiceId: invoice, dueDate: '2026-06-15', amount: total },
          { invoiceId: invoice, dueDate: '2026-07-15', amount: 1 },
        ],
      });
      assert.equal(res.status, 409, JSON.stringify(res.data));
    });

    for (const [name, change] of [
      ['sin líneas', { lines: [] }],
      ['sin fecha', { chargeDate: '' }],
      ['una cuenta que no existe', { bankAccountId: 'no-existe' }],
      ['un tipo que no existe', { kind: 'otra' }],
    ] as const) {
      test(`${name} se rechaza`, async () => {
        const invoice = await issued();
        const res = await h.api('POST', '/payment-batches', {
          kind: 'collection',
          bankAccountId,
          chargeDate: '2026-07-01',
          lines: [{ invoiceId: invoice, dueDate: '2026-06-15', amount: 1 }],
          ...change,
        });
        assert.equal(res.status, 400, JSON.stringify(res.data));
      });
    }

    test('una factura de compra no entra en una remesa de cobro', async () => {
      const invoice = await issued('purchase');
      const res = await h.api('POST', '/payment-batches', {
        kind: 'collection',
        bankAccountId,
        chargeDate: '2026-07-01',
        lines: [{ invoiceId: invoice, dueDate: '2026-06-15', amount: 1 }],
      });
      assert.equal(res.status, 400, JSON.stringify(res.data));
    });

    test('dos a la vez sobre la misma deuda: solo pasa una', async () => {
      const invoice = await issued();
      const total = await totalOf(invoice);
      const body = {
        kind: 'collection',
        bankAccountId,
        chargeDate: '2026-07-01',
        lines: [{ invoiceId: invoice, dueDate: '2026-06-15', amount: total }],
      };
      const results = await Promise.all([
        h.api('POST', '/payment-batches', body),
        h.api('POST', '/payment-batches', body),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    });
  });

  describe('generar el fichero', () => {
    test('sin plugins se ofrece un CSV con todo', async () => {
      const exporters = await h.api('GET', '/payment-batches/exporters?kind=collection');
      assert.deepEqual(
        exporters.data.map((row: any) => row.id),
        ['csv'],
      );
      const invoice = await issued();
      const id = await newBatch(invoice);
      const generated = await generate(id);
      assert.equal(generated.status, 'generated');
      assert.match(generated.fileName, /^REM-.*\.csv$/);
      const file = await h.api('GET', `/payment-batches/${id}/file`);
      assert.equal(file.status, 200);
      assert.match(String(file.data), /GB82WEST12345698765432/);
      assert.deepEqual(await paymentsOf(invoice), [], 'generar el fichero no cobra nada');
    });

    test('lo que le falta al formato se dice y no se genera', async () => {
      const exporter = {
        id: 'estricto',
        label: 'Estricto',
        kinds: ['collection' as const],
        validate: () => ['Falta el identificador del acreedor.'],
        generate: () => ({ fileName: 'x', contentType: 'text/plain', content: 'x' }),
      };
      BankFormats.registerBatchExporter('plugin-de-prueba', exporter);
      (TenantPluginCache as any).cache.set(h.tenantId, new Set(['plugin-de-prueba']));
      const invoice = await issued();
      const id = await newBatch(invoice);
      const res = await h.api('POST', `/payment-batches/${id}/generate`, {
        exporterId: 'estricto',
      });
      assert.equal(res.status, 409, JSON.stringify(res.data));
      assert.match(res.data.error, /acreedor/);
      assert.equal((await batchOf(id)).status, 'draft');
    });

    test('un formato que no existe se rechaza', async () => {
      const id = await newBatch(await issued());
      const res = await h.api('POST', `/payment-batches/${id}/generate`, { exporterId: 'no' });
      assert.equal(res.status, 400, JSON.stringify(res.data));
    });

    test('generar otra vez vale antes de cerrar', async () => {
      const id = await newBatch(await issued());
      await generate(id);
      await generate(id);
      assert.equal((await batchOf(id)).status, 'generated');
    });

    test('lo que se arregla en la ficha del interlocutor vale al generar otra vez', async () => {
      const partner = await h.seedPartner();
      const invoice = await issued('sales', { partnerId: partner });
      const id = await newBatch(invoice);
      assert.equal((await batchOf(id)).lines[0].iban, null);
      await h.query(
        `UPDATE "BusinessPartner" SET iban = 'GB82WEST12345698765432', "mandateRef" = 'NUEVO', "mandateDate" = '2026-03-01' WHERE id = '${partner}'`,
      );
      await generate(id);
      const [line] = (await batchOf(id)).lines;
      assert.equal(line.iban, 'GB82WEST12345698765432');
      assert.equal(line.mandateRef, 'NUEVO');
      const file = await h.api('GET', `/payment-batches/${id}/file`);
      assert.match(String(file.data), /NUEVO/);
    });

    test('generada una vez, el fichero no cambia aunque cambie la ficha', async () => {
      const invoice = await issued();
      const id = await newBatch(invoice);
      await generate(id);
      const before = (await h.api('GET', `/payment-batches/${id}/file`)).data;
      const [{ partnerId }] = await h.query(
        `SELECT "partnerId" FROM "SalesInvoice" WHERE id = '${invoice}'`,
      );
      await h.query(
        `UPDATE "BusinessPartner" SET iban = 'DE89370400440532013000' WHERE id = '${partnerId}'`,
      );
      assert.equal((await h.api('GET', `/payment-batches/${id}/file`)).data, before);
    });

    test('sin generar no hay fichero', async () => {
      const id = await newBatch(await issued());
      assert.equal((await h.api('GET', `/payment-batches/${id}/file`)).status, 404);
    });
  });

  describe('cerrar', () => {
    test('crea un cobro por línea, con su asiento, y salda la deuda', async () => {
      const invoice = await issued();
      const total = await totalOf(invoice);
      const id = await newBatch(invoice);
      await generate(id);
      const res = await close(id);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const batch = await batchOf(id);
      assert.equal(batch.status, 'closed');
      const [payment] = await paymentsOf(invoice);
      assert.equal(Number(payment.amount), Math.round(total * 100) / 100);
      assert.equal(payment.source, 'batch');
      assert.equal(payment.bankAccountId, bankAccountId);
      assert.equal(payment.reference, batch.code);
      assert.equal(String(payment.date).slice(0, 10), '2026-07-01');
      assert.equal(batch.lines[0].paymentId, payment.id);
      const [entry] = await h.query(
        `SELECT status FROM "JournalEntry" WHERE source = 'payment' AND "sourceDocumentId" = '${payment.id}'`,
      );
      assert.equal(entry.status, 'posted');
      const [row] = await h.query(
        `SELECT "paymentStatus" FROM "SalesInvoice" WHERE id = '${invoice}'`,
      );
      assert.equal(row.paymentStatus, 'paid');
    });

    test('un borrador no se cierra: primero se genera', async () => {
      const id = await newBatch(await issued());
      const res = await close(id);
      assert.equal(res.status, 409, JSON.stringify(res.data));
    });

    test('dos cierres a la vez solo cobran una vez', async () => {
      const invoice = await issued();
      const id = await newBatch(invoice);
      await generate(id);
      const results = await Promise.all([close(id), close(id)]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await paymentsOf(invoice)).length, 1);
    });

    test('si alguien cobró mientras tanto, no cierra y dice cuál', async () => {
      const invoice = await issued();
      const total = await totalOf(invoice);
      const id = await newBatch(invoice);
      await generate(id);
      await h.api('POST', '/payments', {
        salesInvoiceId: invoice,
        date: '2026-06-20',
        amount: total,
        reference: 'A MANO',
      });
      const res = await close(id);
      assert.equal(res.status, 409, JSON.stringify(res.data));
      assert.equal((await batchOf(id)).status, 'generated');
      assert.equal((await paymentsOf(invoice)).length, 1);
    });

    test('una remesa de pago paga a los proveedores', async () => {
      const invoice = await issued('purchase');
      const [row] = await candidateOf(invoice, 'payment');
      const created = await h.api('POST', '/payment-batches', {
        kind: 'payment',
        bankAccountId,
        chargeDate: '2026-07-01',
        lines: [{ invoiceId: invoice, dueDate: row.dueDate, amount: row.amount }],
      });
      assert.equal(created.status, 200, JSON.stringify(created.data));
      await generate(created.data.id);
      assert.equal((await close(created.data.id)).status, 200);
      const [payment] = await h.query(
        `SELECT * FROM "Payment" WHERE "purchaseInvoiceId" = '${invoice}'`,
      );
      assert.ok(payment, 'sin pago');
      const lines = await h.query(
        `SELECT l."accountId", l.credit FROM "JournalEntryLine" l JOIN "JournalEntry" e ON e.id = l."entryId" WHERE e."sourceDocumentId" = '${payment.id}'`,
      );
      assert.ok(Number(lines.find((line) => line.accountId === ledger).credit) > 0);
    });

    test('cerrada no se borra', async () => {
      const id = await newBatch(await issued());
      await generate(id);
      await close(id);
      assert.equal((await h.api('DELETE', `/payment-batches/${id}`)).status, 409);
    });

    test('generada sí se puede borrar: el banco todavía no la ha cobrado', async () => {
      const invoice = await issued();
      const id = await newBatch(invoice);
      await generate(id);
      assert.equal((await h.api('DELETE', `/payment-batches/${id}`)).status, 200);
      assert.equal((await candidateOf(invoice)).length, 1);
    });

    test('un cobro de remesa no se anula a mano', async () => {
      const invoice = await issued();
      const id = await newBatch(invoice);
      await generate(id);
      await close(id);
      const [payment] = await paymentsOf(invoice);
      const res = await h.api('DELETE', `/payments/${payment.id}`);
      assert.equal(res.status, 409, JSON.stringify(res.data));
      assert.match(res.data.error, /remesa/);
    });
  });

  describe('una devolución', () => {
    const closedBatch = async (invoice: string) => {
      const id = await newBatch(invoice);
      await generate(id);
      assert.equal((await close(id)).status, 200);
      return batchOf(id);
    };

    test('deshace el cobro, revierte el asiento y reabre la deuda', async () => {
      const invoice = await issued();
      const batch = await closedBatch(invoice);
      const [line] = batch.lines;
      const res = await h.api('POST', `/payment-batches/${batch.id}/lines/${line.id}/return`, {
        reason: 'Sin fondos',
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.deepEqual(await paymentsOf(invoice), []);
      const [row] = await h.query(
        `SELECT "amountPaid", "paymentStatus" FROM "SalesInvoice" WHERE id = '${invoice}'`,
      );
      assert.equal(Number(row.amountPaid), 0);
      assert.equal(row.paymentStatus, 'pending');
      const [entry] = await h.query(
        `SELECT status FROM "JournalEntry" WHERE source = 'payment' AND "sourceDocumentId" = '${line.paymentId}'`,
      );
      assert.equal(entry.status, 'reversed');
      const after = await batchOf(batch.id);
      assert.equal(after.lines[0].status, 'returned');
      assert.equal(after.lines[0].returnReason, 'Sin fondos');
      assert.ok(after.lines[0].returnedAt);
    });

    test('lo devuelto vuelve a estar disponible para otra remesa', async () => {
      const invoice = await issued();
      const batch = await closedBatch(invoice);
      assert.deepEqual(await candidateOf(invoice), []);
      await h.api('POST', `/payment-batches/${batch.id}/lines/${batch.lines[0].id}/return`, {
        reason: 'Sin fondos',
      });
      assert.equal((await candidateOf(invoice)).length, 1);
    });

    test('no se devuelve dos veces', async () => {
      const batch = await closedBatch(await issued());
      const url = `/payment-batches/${batch.id}/lines/${batch.lines[0].id}/return`;
      assert.equal((await h.api('POST', url, { reason: 'x' })).status, 200);
      assert.equal((await h.api('POST', url, { reason: 'x' })).status, 409);
    });

    test('pide el motivo', async () => {
      const batch = await closedBatch(await issued());
      const url = `/payment-batches/${batch.id}/lines/${batch.lines[0].id}/return`;
      assert.equal((await h.api('POST', url, { reason: ' ' })).status, 400);
    });

    test('una remesa sin cerrar no tiene devoluciones', async () => {
      const id = await newBatch(await issued());
      const batch = await batchOf(id);
      const res = await h.api('POST', `/payment-batches/${id}/lines/${batch.lines[0].id}/return`, {
        reason: 'x',
      });
      assert.equal(res.status, 409, JSON.stringify(res.data));
    });

    /** El banco ingresa la remesa entera y ese movimiento se concilia con sus cobros. */
    const reconciled = async (invoices: string[]) => {
      const lines = [];
      for (const invoiceId of invoices) {
        const [row] = await candidateOf(invoiceId);
        lines.push({ invoiceId, dueDate: row.dueDate, amount: row.amount });
      }
      const created = await h.api('POST', '/payment-batches', {
        kind: 'collection',
        bankAccountId,
        chargeDate: '2026-07-01',
        lines,
      });
      assert.equal(created.status, 200, JSON.stringify(created.data));
      await generate(created.data.id);
      assert.equal((await close(created.data.id)).status, 200);
      const batch = await batchOf(created.data.id);
      const amount = batch.lines.reduce((sum: number, line: any) => sum + Number(line.amount), 0);
      const imported = await h.api('POST', '/bank-statements/import', {
        bankAccountId,
        fileName: 'r.csv',
        format: 'csv',
        contentBase64: Buffer.from(
          `Fecha;Concepto;Importe\n01/07/2026;Remesa ${crypto.randomUUID().slice(0, 6)};${amount}\n`,
        ).toString('base64'),
        mapping: { date: 'Fecha', description: 'Concepto', amount: 'Importe' },
      });
      const [line] = await h.query(
        `SELECT id FROM "BankStatementLine" WHERE "importId" = '${imported.data.importId}'`,
      );
      const matched = await h.api('POST', `/bank-statements/lines/${line.id}/match`, {
        paymentIds: batch.lines.map((row: any) => row.paymentId),
      });
      assert.equal(matched.status, 200, JSON.stringify(matched.data));
      return { batch, statementLine: line.id as string };
    };

    test('ya conciliada: el ingreso sigue explicado y la deuda se reabre', async () => {
      const returnedInvoice = await issued();
      const keptInvoice = await issued();
      const { batch, statementLine } = await reconciled([returnedInvoice, keptInvoice]);
      const target = batch.lines.find((row: any) => row.salesInvoiceId === returnedInvoice);
      const res = await h.api('POST', `/payment-batches/${batch.id}/lines/${target.id}/return`, {
        reason: 'Sin fondos',
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.deepEqual(await paymentsOf(returnedInvoice), []);
      assert.equal((await paymentsOf(keptInvoice)).length, 1, 'la otra factura sigue cobrada');

      const [line] = await h.query(
        `SELECT status FROM "BankStatementLine" WHERE id = '${statementLine}'`,
      );
      assert.equal(line.status, 'matched', 'el dinero entró: el ingreso sigue conciliado');
      const matches = await h.query(
        `SELECT * FROM "BankMatch" WHERE "statementLineId" = '${statementLine}'`,
      );
      assert.equal(matches.length, 2);
      const kept = matches.find((row) => row.journalEntryId);
      assert.ok(kept, 'el cobro devuelto queda como su asiento');
      assert.equal(kept.paymentId, null);
      assert.equal(Number(kept.amount), Number(target.amount));
      const total = matches.reduce((sum, row) => sum + Number(row.amount), 0);
      const [{ amount }] = await h.query(
        `SELECT amount FROM "BankStatementLine" WHERE id = '${statementLine}'`,
      );
      assert.equal(total, Number(amount), 'sigue cuadrando');
    });

    test('la ficha del movimiento sigue abriendo, y se puede deshacer', async () => {
      const invoice = await issued();
      const { batch, statementLine } = await reconciled([invoice]);
      await h.api('POST', `/payment-batches/${batch.id}/lines/${batch.lines[0].id}/return`, {
        reason: 'Sin fondos',
      });
      const detail = await h.api('GET', `/bank-statements/lines/${statementLine}`);
      assert.equal(detail.status, 200, JSON.stringify(detail.data));
      assert.ok(detail.data.matches[0].journalEntryId);
      const undone = await h.api('POST', `/bank-statements/lines/${statementLine}/undo`);
      assert.equal(undone.status, 200, JSON.stringify(undone.data));
      assert.deepEqual(
        await h.query(`SELECT id FROM "BankMatch" WHERE "statementLineId" = '${statementLine}'`),
        [],
      );
    });
  });

  test('todo queda en la auditoría', async () => {
    const id = await newBatch(await issued());
    await generate(id);
    await close(id);
    const rows = await h.query(
      `SELECT action FROM public."AuditLog" WHERE "entityType" = 'PaymentBatch' AND "entityId" = '${id}'`,
    );
    assert.ok(rows.length >= 3, JSON.stringify(rows));
  });

  describe('el mandato del interlocutor', () => {
    test('se guarda en su ficha', async () => {
      const partner = await h.seedPartner();
      const res = await h.api('PATCH', `/partners/${partner}`, {
        mandateRef: 'M-1',
        mandateDate: '2026-02-01',
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const [row] = await h.query(
        `SELECT "mandateRef", "mandateDate" FROM "BusinessPartner" WHERE id = '${partner}'`,
      );
      assert.equal(row.mandateRef, 'M-1');
      assert.equal(String(row.mandateDate).slice(0, 10), '2026-02-01');
    });
  });
});
