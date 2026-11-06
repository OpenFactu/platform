/**
 * Un cobro y su asiento van juntos: un cobro sin asiento no cuadra con el banco. Solo se admite
 * sin él si la empresa no tiene cuentas configuradas, que es no llevar contabilidad.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  startDocumentsHarness,
  testDatabaseUrl,
  type DocumentsHarness,
} from '../../documents/__tests__/documentsHarness';

describe('el servicio de cobros', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;

  before(async () => {
    h = await startDocumentsHarness();
  });
  after(async () => {
    await h?.close();
  });

  const issued = async (side: 'sales' | 'purchase' = 'sales') => {
    const item = await h.seedItem({ stock: 100 });
    const id = await h.invoice(side, [{ itemId: item, quantity: 2, price: 100 }]);
    await h.post(side, id);
    return id;
  };
  const pay = (invoiceId: string, extra: Record<string, unknown> = {}) =>
    h.api('POST', '/payments', {
      salesInvoiceId: invoiceId,
      date: '2026-06-20',
      amount: 50,
      reference: 'TRANS-1',
      ...extra,
    });
  const paymentsOf = (invoiceId: string) =>
    h.query(`SELECT * FROM "Payment" WHERE "salesInvoiceId" = '${invoiceId}'`);
  const entryOf = async (paymentId: string) => {
    const [entry] = await h.query(
      `SELECT * FROM "JournalEntry" WHERE source = 'payment' AND "sourceDocumentId" = '${paymentId}'`,
    );
    return entry;
  };
  const seedBankAccount = async (extra: Record<string, unknown> = {}) => {
    const id = `bank-${crypto.randomUUID().slice(0, 8)}`;
    const ledger = `ledger-${id}`;
    await h.query(
      `INSERT INTO "ChartOfAccount" (id, code, name, type, "isAnalytical", "isActive", "updatedAt")
       VALUES ('${ledger}', '57${id.slice(-6)}', 'Banco', 'asset', true, true, now())`,
    );
    await h.query(
      `INSERT INTO "CompanyBankAccount" (id, name, "accountId", "isActive")
       VALUES ('${id}', 'Cuenta', '${ledger}', ${extra.isActive ?? true})`,
    );
    return { id, ledger };
  };

  test('guarda el cobro y su asiento, ya contabilizado', async () => {
    const invoice = await issued();
    const res = await pay(invoice);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.ok(res.data.journalEntryId, 'sin asiento');
    const entry = await entryOf(res.data.id);
    assert.equal(entry.status, 'posted');
    assert.equal(res.data.paymentStatus, 'partial');
  });

  test('si el asiento falla, el cobro no se queda', async () => {
    const invoice = await issued();
    await h.query(`
      CREATE OR REPLACE FUNCTION fail_payment_entry() RETURNS trigger AS $$
      BEGIN
        IF NEW.source = 'payment' THEN RAISE EXCEPTION 'asiento imposible'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await h.query(`
      CREATE TRIGGER fail_payment_entry BEFORE INSERT ON "JournalEntry"
      FOR EACH ROW EXECUTE FUNCTION fail_payment_entry()`);
    try {
      const res = await pay(invoice);
      assert.notEqual(res.status, 200, JSON.stringify(res.data));
      assert.deepEqual(await paymentsOf(invoice), []);
      const [row] = await h.query(
        `SELECT "amountPaid", "paymentStatus" FROM "SalesInvoice" WHERE id = '${invoice}'`,
      );
      assert.equal(Number(row.amountPaid), 0);
      assert.notEqual(row.paymentStatus, 'partial');
    } finally {
      await h.query(`DROP TRIGGER fail_payment_entry ON "JournalEntry"`);
    }
  });

  test('sin cuentas configuradas se guarda sin asiento', async () => {
    const invoice = await issued();
    const saved = await h.query(`SELECT * FROM "AccountMapping" WHERE kind IN ('bank', 'cash')`);
    await h.query(`DELETE FROM "AccountMapping" WHERE kind IN ('bank', 'cash')`);
    try {
      const res = await pay(invoice);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(res.data.journalEntryId, null);
      assert.equal((await paymentsOf(invoice)).length, 1);
    } finally {
      for (const row of saved) {
        await h.query(
          `INSERT INTO "AccountMapping" (id, kind, key, "accountId") VALUES ('${row.id}', '${row.kind}', '${row.key}', '${row.accountId}')`,
        );
      }
    }
  });

  test('con cuenta del banco, el asiento va a su cuenta contable', async () => {
    const invoice = await issued();
    const bank = await seedBankAccount();
    const res = await pay(invoice, { bankAccountId: bank.id });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const [saved] = await paymentsOf(invoice);
    assert.equal(saved.bankAccountId, bank.id);
    const lines = await h.query(
      `SELECT "accountId", debit FROM "JournalEntryLine" WHERE "entryId" = '${res.data.journalEntryId}'`,
    );
    const debit = lines.find((line) => Number(line.debit) > 0);
    assert.equal(debit.accountId, bank.ledger);
  });

  test('una cuenta del banco que no existe o está apagada se rechaza', async () => {
    const invoice = await issued();
    const off = await seedBankAccount({ isActive: false });
    assert.equal((await pay(invoice, { bankAccountId: 'no-existe' })).status, 400);
    assert.equal((await pay(invoice, { bankAccountId: off.id })).status, 400);
    assert.deepEqual(await paymentsOf(invoice), []);
  });

  test('anular revierte el asiento y reabre la deuda', async () => {
    const invoice = await issued();
    const res = await pay(invoice);
    const removed = await h.api('DELETE', `/payments/${res.data.id}`);
    assert.equal(removed.status, 200, JSON.stringify(removed.data));
    assert.deepEqual(await paymentsOf(invoice), []);
    assert.equal((await entryOf(res.data.id)).status, 'reversed');
    const [row] = await h.query(`SELECT "amountPaid" FROM "SalesInvoice" WHERE id = '${invoice}'`);
    assert.equal(Number(row.amountPaid), 0);
  });

  test('si no se puede revertir el asiento, el cobro se queda', async () => {
    const invoice = await issued();
    const res = await pay(invoice);
    await h.query(`
      CREATE OR REPLACE FUNCTION fail_reversal() RETURNS trigger AS $$
      BEGIN
        IF NEW.source = 'reversal' THEN RAISE EXCEPTION 'reversión imposible'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await h.query(`
      CREATE TRIGGER fail_reversal BEFORE INSERT ON "JournalEntry"
      FOR EACH ROW EXECUTE FUNCTION fail_reversal()`);
    try {
      const removed = await h.api('DELETE', `/payments/${res.data.id}`);
      assert.notEqual(removed.status, 200, JSON.stringify(removed.data));
      assert.equal((await paymentsOf(invoice)).length, 1);
      assert.equal((await entryOf(res.data.id)).status, 'posted');
    } finally {
      await h.query(`DROP TRIGGER fail_reversal ON "JournalEntry"`);
    }
  });

  test('un pago de compra también lleva su asiento', async () => {
    const invoice = await issued('purchase');
    const res = await h.api('POST', '/payments', {
      purchaseInvoiceId: invoice,
      date: '2026-06-20',
      amount: 50,
      reference: 'PAGO-1',
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal((await entryOf(res.data.id)).status, 'posted');
  });
});
