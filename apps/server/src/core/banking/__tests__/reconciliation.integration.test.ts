/**
 * Cuentas de la empresa, extractos y conciliación: los movimientos del banco frente a cobros y
 * pagos. Conciliar nunca cambia lo que dicen los libros, salvo lo que nace de la conciliación, y
 * deshacerla lo deja todo como estaba.
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

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

describe('bancos', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;
  let ledger: string;
  let expense: string;
  let accountSeq = 0;

  before(async () => {
    h = await startDocumentsHarness();
    const [bank] = await h.query(`SELECT id FROM "ChartOfAccount" WHERE code = '572000'`);
    ledger = bank.id;
    const [cost] = await h.query(`SELECT id FROM "ChartOfAccount" WHERE code = '600000'`);
    expense = cost.id;
  });
  after(async () => {
    await h?.close();
  });

  const newAccount = async (extra: Record<string, unknown> = {}) => {
    accountSeq += 1;
    const res = await h.api('POST', '/bank-accounts', {
      name: `Cuenta ${accountSeq}`,
      accountId: ledger,
      ...extra,
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data.id as string;
  };
  const issued = async (side: 'sales' | 'purchase' = 'sales', price = 100) => {
    const item = await h.seedItem({ stock: 100 });
    const id = await h.invoice(side, [{ itemId: item, quantity: 1, price }]);
    await h.post(side, id);
    return id;
  };
  const totalOf = async (id: string, table = 'SalesInvoice') => {
    const [row] = await h.query(`SELECT total FROM "${table}" WHERE id = '${id}'`);
    return Number(row.total);
  };
  const paymentOf = async (invoiceId: string, amount: number, extra = {}) => {
    const res = await h.api('POST', '/payments', {
      salesInvoiceId: invoiceId,
      date: '2026-06-15',
      amount,
      reference: `T-${crypto.randomUUID().slice(0, 6)}`,
      ...extra,
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data.id as string;
  };
  /** Importa un movimiento y devuelve su id. */
  const movement = async (bankAccountId: string, amount: number, description = 'Movimiento') => {
    const res = await h.api('POST', '/bank-statements/import', {
      bankAccountId,
      fileName: 'extracto.csv',
      format: 'csv',
      contentBase64: b64(
        `Fecha;Concepto;Importe\n15/06/2026;${description} ${crypto.randomUUID().slice(0, 8)};${String(amount).replace('.', ',')}\n`,
      ),
      mapping: { date: 'Fecha', description: 'Concepto', amount: 'Importe' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.added, 1);
    const [line] = await h.query(
      `SELECT id FROM "BankStatementLine" WHERE "importId" = '${res.data.importId}'`,
    );
    return line.id as string;
  };
  const lineRow = async (id: string) => {
    const [row] = await h.query(`SELECT * FROM "BankStatementLine" WHERE id = '${id}'`);
    return row;
  };
  const matchesOf = (lineId: string) =>
    h.query(`SELECT * FROM "BankMatch" WHERE "statementLineId" = '${lineId}'`);

  describe('las cuentas de la empresa', () => {
    test('se crea con su IBAN limpio y la primera queda como predeterminada', async () => {
      await h.query(
        `DELETE FROM "CompanyBankAccount" WHERE NOT EXISTS (SELECT 1 FROM "BankStatementLine" l WHERE l."bankAccountId" = "CompanyBankAccount".id)`,
      );
      const res = await h.api('POST', '/bank-accounts', {
        name: 'Principal',
        iban: 'de89 3704 0044 0532 0130 00',
        accountId: ledger,
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const list = await h.api('GET', '/bank-accounts');
      const created = list.data.find((row: any) => row.id === res.data.id);
      assert.equal(created.iban, 'DE89370400440532013000');
      assert.equal(created.isDefault, true);
      assert.equal(created.accountCode, '572000');
    });

    test('un IBAN mal escrito se rechaza', async () => {
      const res = await h.api('POST', '/bank-accounts', {
        name: 'Mala',
        iban: 'DE89370400440532013001',
      });
      assert.equal(res.status, 400, JSON.stringify(res.data));
      assert.match(res.data.error, /IBAN/);
    });

    test('sin nombre, o con una cuenta contable que no existe, tampoco', async () => {
      assert.equal((await h.api('POST', '/bank-accounts', { name: ' ' })).status, 400);
      assert.equal(
        (await h.api('POST', '/bank-accounts', { name: 'X', accountId: 'no-existe' })).status,
        400,
      );
    });

    test('solo una es la predeterminada', async () => {
      const a = await newAccount({ isDefault: true });
      const b = await newAccount({ isDefault: true });
      const list = await h.api('GET', '/bank-accounts');
      const defaults = list.data.filter((row: any) => row.isDefault).map((row: any) => row.id);
      assert.deepEqual(defaults, [b]);
      const patched = await h.api('PATCH', `/bank-accounts/${a}`, { isDefault: true });
      assert.equal(patched.status, 200, JSON.stringify(patched.data));
      const after = await h.api('GET', '/bank-accounts');
      assert.deepEqual(
        after.data.filter((row: any) => row.isDefault).map((row: any) => row.id),
        [a],
      );
    });

    test('con movimientos no se borra: se desactiva', async () => {
      const account = await newAccount();
      await movement(account, 10);
      const removed = await h.api('DELETE', `/bank-accounts/${account}`);
      assert.equal(removed.status, 409, JSON.stringify(removed.data));
      assert.match(removed.data.error, /desactívala/);
      const off = await h.api('PATCH', `/bank-accounts/${account}`, { isActive: false });
      assert.equal(off.status, 200, JSON.stringify(off.data));
    });

    test('sin movimientos se puede borrar', async () => {
      const account = await newAccount();
      assert.equal((await h.api('DELETE', `/bank-accounts/${account}`)).status, 200);
    });

    test('la lista para elegir solo trae las activas y lo justo', async () => {
      const active = await newAccount();
      const off = await newAccount();
      await h.api('PATCH', `/bank-accounts/${off}`, { isActive: false });
      const res = await h.api('GET', '/bank-account-options');
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const ids = res.data.map((row: any) => row.id);
      assert.ok(ids.includes(active));
      assert.ok(!ids.includes(off));
      assert.equal(res.data[0].accountId, undefined);
    });
  });

  describe('importar un extracto', () => {
    const csv = `Fecha;Concepto;Importe\n15/06/2026;Cobro A;100,00\n16/06/2026;Recibo B;-20,50\n`;
    const body = (bankAccountId: string, content = csv) => ({
      bankAccountId,
      fileName: 'junio.csv',
      format: 'csv',
      contentBase64: b64(content),
      mapping: { date: 'Fecha', description: 'Concepto', amount: 'Importe' },
    });

    test('la vista previa enseña las columnas y adivina cuál es cada una', async () => {
      const res = await h.api('POST', '/bank-statements/preview', {
        fileName: 'junio.csv',
        format: 'csv',
        contentBase64: b64(csv),
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.deepEqual(res.data.headers, ['Fecha', 'Concepto', 'Importe']);
      assert.equal(res.data.rows.length, 2);
      assert.deepEqual(res.data.mapping, {
        date: 'Fecha',
        description: 'Concepto',
        amount: 'Importe',
      });
    });

    test('guarda los movimientos con su signo', async () => {
      const account = await newAccount();
      const res = await h.api('POST', '/bank-statements/import', body(account));
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(res.data.added, 2);
      assert.equal(res.data.skipped, 0);
      const lines = await h.api('GET', `/bank-statements/lines?bankAccountId=${account}`);
      assert.deepEqual(
        lines.data.lines
          .map((line: any) => Number(line.amount))
          .sort((a: number, b: number) => a - b),
        [-20.5, 100],
      );
      assert.equal(lines.data.counts.open, 2);
    });

    test('importar otra vez el mismo fichero no repite nada', async () => {
      const account = await newAccount();
      await h.api('POST', '/bank-statements/import', body(account));
      const again = await h.api('POST', '/bank-statements/import', body(account));
      assert.equal(again.data.added, 0);
      assert.equal(again.data.skipped, 2);
      const lines = await h.api('GET', `/bank-statements/lines?bankAccountId=${account}`);
      assert.equal(lines.data.lines.length, 2);
    });

    test('un fichero que se solapa solo añade lo nuevo', async () => {
      const account = await newAccount();
      await h.api('POST', '/bank-statements/import', body(account));
      const res = await h.api(
        'POST',
        '/bank-statements/import',
        body(account, `${csv}17/06/2026;Nuevo;5,00\n`),
      );
      assert.equal(res.data.added, 1);
      assert.equal(res.data.skipped, 2);
    });

    test('las filas malas se dicen, y las buenas entran', async () => {
      const account = await newAccount();
      const res = await h.api(
        'POST',
        '/bank-statements/import',
        body(account, `${csv}ayer;Mala;3,00\n`),
      );
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(res.data.added, 2);
      assert.equal(res.data.rejected.length, 1);
      assert.equal(res.data.rejected[0].row, 4);
    });

    test('sin decir qué columna es la fecha o el importe, no entra', async () => {
      const account = await newAccount();
      const res = await h.api('POST', '/bank-statements/import', {
        ...body(account),
        mapping: { description: 'Concepto' },
      });
      assert.equal(res.status, 400, JSON.stringify(res.data));
    });

    test('un formato que no existe o una cuenta apagada se rechazan', async () => {
      const account = await newAccount();
      assert.equal(
        (await h.api('POST', '/bank-statements/import', { ...body(account), format: 'no' })).status,
        400,
      );
      await h.api('PATCH', `/bank-accounts/${account}`, { isActive: false });
      assert.equal((await h.api('POST', '/bank-statements/import', body(account))).status, 400);
    });

    describe('con un formato de un plugin', () => {
      const pluginId = 'plugin-de-extractos';
      before(() => {
        BankFormats.registerStatementParser(pluginId, {
          id: 'de-prueba',
          label: 'De prueba',
          parse: (content) => {
            const text = content.toString('utf8');
            if (text.startsWith('MAL')) throw new Error('Este fichero no es de este formato.');
            return [
              { date: '2026-06-15', amount: 12.34, description: text, reference: 'R1' },
              { date: '2026-06-16', amount: -1, valueDate: '2026-06-17', balance: 11.34 },
            ];
          },
        });
        (TenantPluginCache as any).cache.set(h.tenantId, new Set([pluginId]));
      });
      after(() => {
        BankFormats.removeForTests(pluginId);
        (TenantPluginCache as any).cache.delete(h.tenantId);
      });
      const pluginBody = (bankAccountId: string, content = 'contenido') => ({
        bankAccountId,
        fileName: 'extracto.n43',
        format: 'de-prueba',
        contentBase64: b64(content),
      });

      test('se ofrece junto al de columnas', async () => {
        const res = await h.api('GET', '/bank-statements/formats');
        assert.deepEqual(
          res.data.map((format: any) => format.id),
          ['csv', 'de-prueba'],
        );
      });

      test('importa lo que lee, sin repetirlo', async () => {
        const account = await newAccount();
        const res = await h.api('POST', '/bank-statements/import', pluginBody(account));
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.added, 2);
        const again = await h.api('POST', '/bank-statements/import', pluginBody(account));
        assert.equal(again.data.added, 0);
        const lines = await h.query(
          `SELECT amount, reference, "valueDate", balance FROM "BankStatementLine" WHERE "bankAccountId" = '${account}' ORDER BY amount DESC`,
        );
        assert.equal(Number(lines[0].amount), 12.34);
        assert.equal(lines[0].reference, 'R1');
        assert.equal(Number(lines[1].balance), 11.34);
      });

      test('la vista previa enseña lo leído', async () => {
        const res = await h.api('POST', '/bank-statements/preview', {
          fileName: 'x.n43',
          format: 'de-prueba',
          contentBase64: b64('hola'),
        });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.kind, 'parsed');
        assert.equal(res.data.total, 2);
      });

      test('si no entiende el fichero, lo dice', async () => {
        const account = await newAccount();
        const res = await h.api('POST', '/bank-statements/import', pluginBody(account, 'MAL'));
        assert.equal(res.status, 400, JSON.stringify(res.data));
        assert.match(res.data.error, /no es de este formato/);
      });
    });

    test('sin plugins solo se ofrece el formato de columnas', async () => {
      const res = await h.api('GET', '/bank-statements/formats');
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.deepEqual(
        res.data.map((format: any) => format.id),
        ['csv'],
      );
    });
  });

  describe('conciliar con cobros que ya existen', () => {
    test('un movimiento y su cobro', async () => {
      const account = await newAccount();
      const invoice = await issued();
      const payment = await paymentOf(invoice, 50);
      const line = await movement(account, 50);
      const entriesBefore = await h.query(`SELECT count(*) AS n FROM "JournalEntry"`);
      const res = await h.api('POST', `/bank-statements/lines/${line}/match`, {
        paymentIds: [payment],
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal((await lineRow(line)).status, 'matched');
      const entriesAfter = await h.query(`SELECT count(*) AS n FROM "JournalEntry"`);
      assert.equal(entriesAfter[0].n, entriesBefore[0].n, 'conciliar no crea asientos');
      const [saved] = await h.query(
        `SELECT "bankAccountId" FROM "Payment" WHERE id = '${payment}'`,
      );
      assert.equal(saved.bankAccountId, account);
    });

    test('un movimiento puede cubrir varios cobros', async () => {
      const account = await newAccount();
      const a = await paymentOf(await issued(), 30);
      const b = await paymentOf(await issued(), 20);
      const line = await movement(account, 50);
      const res = await h.api('POST', `/bank-statements/lines/${line}/match`, {
        paymentIds: [a, b],
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal((await matchesOf(line)).length, 2);
    });

    test('un pago de compra explica una salida', async () => {
      const account = await newAccount();
      const invoice = await issued('purchase');
      const pay = await h.api('POST', '/payments', {
        purchaseInvoiceId: invoice,
        date: '2026-06-15',
        amount: 40,
        reference: 'PAGO',
      });
      const line = await movement(account, -40);
      const res = await h.api('POST', `/bank-statements/lines/${line}/match`, {
        paymentIds: [pay.data.id],
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
    });

    test('un importe que no cuadra se rechaza', async () => {
      const account = await newAccount();
      const payment = await paymentOf(await issued(), 30);
      const line = await movement(account, 50);
      const res = await h.api('POST', `/bank-statements/lines/${line}/match`, {
        paymentIds: [payment],
      });
      assert.equal(res.status, 409, JSON.stringify(res.data));
      assert.equal((await lineRow(line)).status, 'open');
    });

    test('la diferencia se puede llevar a una cuenta: la comisión del banco', async () => {
      const account = await newAccount();
      const payment = await paymentOf(await issued(), 50);
      const line = await movement(account, 48.5);
      const res = await h.api('POST', `/bank-statements/lines/${line}/match`, {
        paymentIds: [payment],
        difference: { accountId: expense, description: 'Comisión' },
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const matches = await matchesOf(line);
      const entry = matches.find((row) => row.journalEntryId);
      assert.ok(entry, 'sin asiento de la diferencia');
      assert.equal(Number(entry.amount), -1.5);
      const lines = await h.query(
        `SELECT "accountId", debit, credit FROM "JournalEntryLine" WHERE "entryId" = '${entry.journalEntryId}'`,
      );
      const costLine = lines.find((row) => row.accountId === expense);
      assert.equal(Number(costLine.debit), 1.5);
      const bankLine = lines.find((row) => row.accountId === ledger);
      assert.equal(Number(bankLine.credit), 1.5);
    });

    test('un cobro no se concilia dos veces', async () => {
      const account = await newAccount();
      const payment = await paymentOf(await issued(), 10);
      const first = await movement(account, 10);
      const second = await movement(account, 10);
      assert.equal(
        (await h.api('POST', `/bank-statements/lines/${first}/match`, { paymentIds: [payment] }))
          .status,
        200,
      );
      const again = await h.api('POST', `/bank-statements/lines/${second}/match`, {
        paymentIds: [payment],
      });
      assert.equal(again.status, 409, JSON.stringify(again.data));
    });

    test('un movimiento ya conciliado no se concilia otra vez', async () => {
      const account = await newAccount();
      const a = await paymentOf(await issued(), 10);
      const b = await paymentOf(await issued(), 10);
      const line = await movement(account, 10);
      await h.api('POST', `/bank-statements/lines/${line}/match`, { paymentIds: [a] });
      const again = await h.api('POST', `/bank-statements/lines/${line}/match`, {
        paymentIds: [b],
      });
      assert.equal(again.status, 409, JSON.stringify(again.data));
    });

    test('un cobro de otra cuenta del banco no vale', async () => {
      const other = await newAccount();
      const account = await newAccount();
      const payment = await paymentOf(await issued(), 10, { bankAccountId: other });
      const line = await movement(account, 10);
      const res = await h.api('POST', `/bank-statements/lines/${line}/match`, {
        paymentIds: [payment],
      });
      assert.equal(res.status, 409, JSON.stringify(res.data));
    });

    test('lo conciliado no se anula: primero hay que deshacerlo', async () => {
      const account = await newAccount();
      const payment = await paymentOf(await issued(), 10);
      const line = await movement(account, 10);
      await h.api('POST', `/bank-statements/lines/${line}/match`, { paymentIds: [payment] });
      const removed = await h.api('DELETE', `/payments/${payment}`);
      assert.equal(removed.status, 409, JSON.stringify(removed.data));
      assert.match(removed.data.error, /concilia/);
    });
  });

  describe('crear el cobro desde el movimiento', () => {
    test('cobra la factura con la fecha del banco y por esa cuenta', async () => {
      const account = await newAccount();
      const invoice = await issued();
      const total = await totalOf(invoice);
      const line = await movement(account, total);
      const res = await h.api('POST', `/bank-statements/lines/${line}/pay`, {
        invoices: [{ kind: 'sales', id: invoice, amount: total }],
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const [payment] = await h.query(
        `SELECT * FROM "Payment" WHERE "salesInvoiceId" = '${invoice}'`,
      );
      assert.equal(payment.bankAccountId, account);
      assert.equal(payment.source, 'bank');
      assert.equal(String(payment.date).slice(0, 10), '2026-06-15');
      const [row] = await h.query(
        `SELECT "paymentStatus" FROM "SalesInvoice" WHERE id = '${invoice}'`,
      );
      assert.equal(row.paymentStatus, 'paid');
      assert.equal((await lineRow(line)).status, 'matched');
    });

    test('un movimiento puede cobrar varias facturas', async () => {
      const account = await newAccount();
      const a = await issued();
      const b = await issued();
      const line = await movement(account, 30);
      const res = await h.api('POST', `/bank-statements/lines/${line}/pay`, {
        invoices: [
          { kind: 'sales', id: a, amount: 10 },
          { kind: 'sales', id: b, amount: 20 },
        ],
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal((await matchesOf(line)).length, 2);
    });

    test('una salida paga una factura de compra', async () => {
      const account = await newAccount();
      const invoice = await issued('purchase');
      const line = await movement(account, -25);
      const res = await h.api('POST', `/bank-statements/lines/${line}/pay`, {
        invoices: [{ kind: 'purchase', id: invoice, amount: 25 }],
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
    });

    test('llevar la diferencia a una cuenta no lo arregla', async () => {
      const account = await newAccount();
      const invoice = await issued('purchase');
      const line = await movement(account, 25);
      const res = await h.api('POST', `/bank-statements/lines/${line}/pay`, {
        invoices: [{ kind: 'purchase', id: invoice, amount: 25 }],
        difference: { accountId: expense, description: 'x' },
      });
      assert.equal(res.status, 409, JSON.stringify(res.data));
      assert.match(res.data.error, /entrada/);
      assert.deepEqual(
        await h.query(`SELECT id FROM "Payment" WHERE "purchaseInvoiceId" = '${invoice}'`),
        [],
      );
    });

    test('una entrada no paga una factura de compra', async () => {
      const account = await newAccount();
      const invoice = await issued('purchase');
      const line = await movement(account, 25);
      const res = await h.api('POST', `/bank-statements/lines/${line}/pay`, {
        invoices: [{ kind: 'purchase', id: invoice, amount: 25 }],
      });
      assert.equal(res.status, 409, JSON.stringify(res.data));
      assert.equal((await lineRow(line)).status, 'open');
    });

    test('más de lo pendiente se rechaza, sin dejar nada a medias', async () => {
      const account = await newAccount();
      const a = await issued();
      const b = await issued();
      const line = await movement(account, 100000);
      const res = await h.api('POST', `/bank-statements/lines/${line}/pay`, {
        invoices: [
          { kind: 'sales', id: a, amount: 10 },
          { kind: 'sales', id: b, amount: 99990 },
        ],
      });
      assert.equal(res.status, 409, JSON.stringify(res.data));
      assert.deepEqual(
        await h.query(`SELECT id FROM "Payment" WHERE "salesInvoiceId" = '${a}'`),
        [],
      );
      assert.equal((await lineRow(line)).status, 'open');
    });

    test('dos a la vez sobre el mismo movimiento: solo pasa uno', async () => {
      const account = await newAccount();
      const a = await issued();
      const b = await issued();
      const line = await movement(account, 10);
      const results = await Promise.all(
        [a, b].map((id) =>
          h.api('POST', `/bank-statements/lines/${line}/pay`, {
            invoices: [{ kind: 'sales', id, amount: 10 }],
          }),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await matchesOf(line)).length, 1);
    });
  });

  describe('un asiento contra una cuenta', () => {
    test('un gasto del banco sin factura', async () => {
      const account = await newAccount();
      const line = await movement(account, -12.5, 'Comisión de mantenimiento');
      const res = await h.api('POST', `/bank-statements/lines/${line}/entry`, {
        accountId: expense,
        description: 'Comisión',
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const [match] = await matchesOf(line);
      assert.ok(match.journalEntryId);
      const [entry] = await h.query(
        `SELECT status FROM "JournalEntry" WHERE id = '${match.journalEntryId}'`,
      );
      assert.equal(entry.status, 'posted');
      const lines = await h.query(
        `SELECT "accountId", debit, credit FROM "JournalEntryLine" WHERE "entryId" = '${match.journalEntryId}'`,
      );
      assert.equal(Number(lines.find((row) => row.accountId === expense).debit), 12.5);
      assert.equal(Number(lines.find((row) => row.accountId === ledger).credit), 12.5);
    });

    test('sin cuenta contable en la del banco no se puede', async () => {
      const account = await newAccount({ accountId: null });
      const line = await movement(account, -5);
      const res = await h.api('POST', `/bank-statements/lines/${line}/entry`, {
        accountId: expense,
        description: 'Comisión',
      });
      assert.equal(res.status, 400, JSON.stringify(res.data));
      assert.match(res.data.error, /cuenta contable/);
    });

    test('contra la propia cuenta del banco, o una que no existe, no vale', async () => {
      const account = await newAccount();
      const line = await movement(account, -5);
      assert.equal(
        (
          await h.api('POST', `/bank-statements/lines/${line}/entry`, {
            accountId: ledger,
            description: 'x',
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await h.api('POST', `/bank-statements/lines/${line}/entry`, {
            accountId: 'no-existe',
            description: 'x',
          })
        ).status,
        400,
      );
    });
  });

  describe('deshacer', () => {
    test('un cobro que ya existía sigue ahí', async () => {
      const account = await newAccount();
      const payment = await paymentOf(await issued(), 10);
      const line = await movement(account, 10);
      await h.api('POST', `/bank-statements/lines/${line}/match`, { paymentIds: [payment] });
      const res = await h.api('POST', `/bank-statements/lines/${line}/undo`);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal((await lineRow(line)).status, 'open');
      assert.deepEqual(await matchesOf(line), []);
      assert.equal((await h.query(`SELECT id FROM "Payment" WHERE id = '${payment}'`)).length, 1);
      assert.equal((await h.api('DELETE', `/payments/${payment}`)).status, 200);
    });

    test('un cobro nacido de la conciliación se anula y reabre la deuda', async () => {
      const account = await newAccount();
      const invoice = await issued();
      const line = await movement(account, 10);
      await h.api('POST', `/bank-statements/lines/${line}/pay`, {
        invoices: [{ kind: 'sales', id: invoice, amount: 10 }],
      });
      const [payment] = await h.query(
        `SELECT id FROM "Payment" WHERE "salesInvoiceId" = '${invoice}'`,
      );
      assert.equal((await h.api('POST', `/bank-statements/lines/${line}/undo`)).status, 200);
      assert.deepEqual(await h.query(`SELECT id FROM "Payment" WHERE id = '${payment.id}'`), []);
      const [row] = await h.query(
        `SELECT "amountPaid" FROM "SalesInvoice" WHERE id = '${invoice}'`,
      );
      assert.equal(Number(row.amountPaid), 0);
      const [entry] = await h.query(
        `SELECT status FROM "JournalEntry" WHERE source = 'payment' AND "sourceDocumentId" = '${payment.id}'`,
      );
      assert.equal(entry.status, 'reversed');
    });

    test('un asiento nacido de la conciliación se revierte', async () => {
      const account = await newAccount();
      const line = await movement(account, -5);
      await h.api('POST', `/bank-statements/lines/${line}/entry`, {
        accountId: expense,
        description: 'Comisión',
      });
      const [match] = await matchesOf(line);
      assert.equal((await h.api('POST', `/bank-statements/lines/${line}/undo`)).status, 200);
      const [entry] = await h.query(
        `SELECT status FROM "JournalEntry" WHERE id = '${match.journalEntryId}'`,
      );
      assert.equal(entry.status, 'reversed');
    });

    test('lo que no está conciliado no se deshace', async () => {
      const account = await newAccount();
      const line = await movement(account, 5);
      assert.equal((await h.api('POST', `/bank-statements/lines/${line}/undo`)).status, 409);
    });
  });

  describe('ignorar', () => {
    test('un movimiento de antes de empezar se aparta y se puede recuperar', async () => {
      const account = await newAccount();
      const line = await movement(account, 5);
      assert.equal(
        (await h.api('POST', `/bank-statements/lines/${line}/ignore`, { ignored: true })).status,
        200,
      );
      assert.equal((await lineRow(line)).status, 'ignored');
      const payment = await paymentOf(await issued(), 5);
      assert.equal(
        (await h.api('POST', `/bank-statements/lines/${line}/match`, { paymentIds: [payment] }))
          .status,
        409,
      );
      assert.equal(
        (await h.api('POST', `/bank-statements/lines/${line}/ignore`, { ignored: false })).status,
        200,
      );
      assert.equal((await lineRow(line)).status, 'open');
    });
  });

  describe('sugerencias', () => {
    test('un cobro y una factura con ese importe salen primero', async () => {
      const account = await newAccount();
      const invoice = await issued('sales', 77);
      const total = await totalOf(invoice);
      const payment = await paymentOf(await issued('sales', 500), total);
      const line = await movement(account, total);
      const res = await h.api('GET', `/bank-statements/lines/${line}/suggestions`);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(res.data.payments[0].id, payment);
      assert.deepEqual(res.data.payments[0].reasons.includes('amount'), true);
      assert.equal(res.data.invoices[0].id, invoice);
      assert.equal(res.data.invoices[0].remaining, total);
      assert.ok(res.data.invoices[0].code);
    });

    test('la referencia del movimiento apunta a su factura', async () => {
      const account = await newAccount();
      const invoice = await issued('sales', 40);
      const [{ code }] = (await h.api('GET', `/sales/invoices/${invoice}/credit-note`)).data.invoice
        ? [(await h.api('GET', `/sales/invoices/${invoice}/credit-note`)).data.invoice]
        : [{ code: '' }];
      const line = await movement(account, 3, `Pago ${code}`);
      const res = await h.api('GET', `/bank-statements/lines/${line}/suggestions`);
      const found = res.data.invoices.find((row: any) => row.id === invoice);
      assert.ok(found?.reasons.includes('reference'), JSON.stringify(found));
    });

    test('una entrada no sugiere facturas de compra, ni una salida de venta', async () => {
      const account = await newAccount();
      const sale = await issued('sales');
      const purchase = await issued('purchase');
      const inflow = await movement(account, 7);
      const outflow = await movement(account, -7);
      const inIds = (
        await h.api('GET', `/bank-statements/lines/${inflow}/suggestions`)
      ).data.invoices.map((row: any) => row.id);
      const outIds = (
        await h.api('GET', `/bank-statements/lines/${outflow}/suggestions`)
      ).data.invoices.map((row: any) => row.id);
      assert.ok(inIds.includes(sale));
      assert.ok(!inIds.includes(purchase));
      assert.ok(outIds.includes(purchase));
      assert.ok(!outIds.includes(sale));
    });

    test('un cobro ya conciliado no se sugiere', async () => {
      const account = await newAccount();
      const payment = await paymentOf(await issued(), 13);
      const first = await movement(account, 13);
      await h.api('POST', `/bank-statements/lines/${first}/match`, { paymentIds: [payment] });
      const second = await movement(account, 13);
      const res = await h.api('GET', `/bank-statements/lines/${second}/suggestions`);
      assert.ok(!res.data.payments.some((row: any) => row.id === payment));
    });

    test('la ficha del movimiento dice con qué está conciliado', async () => {
      const account = await newAccount();
      const payment = await paymentOf(await issued(), 9);
      const line = await movement(account, 9);
      await h.api('POST', `/bank-statements/lines/${line}/match`, { paymentIds: [payment] });
      const res = await h.api('GET', `/bank-statements/lines/${line}`);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(res.data.matches[0].paymentId, payment);
      assert.ok(res.data.matches[0].invoiceCode);
    });
  });

  test('todo queda en la auditoría', async () => {
    const account = await newAccount();
    const payment = await paymentOf(await issued(), 21);
    const line = await movement(account, 21);
    await h.api('POST', `/bank-statements/lines/${line}/match`, { paymentIds: [payment] });
    await h.api('POST', `/bank-statements/lines/${line}/undo`);
    const rows = await h.query(
      `SELECT action FROM public."AuditLog" WHERE "entityType" = 'BankStatementLine' AND "entityId" = '${line}' ORDER BY "createdAt"`,
    );
    assert.ok(rows.length >= 2, JSON.stringify(rows));
  });
});
