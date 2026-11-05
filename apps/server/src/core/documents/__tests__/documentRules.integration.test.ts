/**
 * Lo que la API de documentos no deja pasar, y el número de cada documento: dos a la vez no
 * pueden salir con el mismo, y un periodo cerrado no admite nada.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { JournalEngine } from '../../accounting/JournalEngine';
import { startDocumentsHarness, testDatabaseUrl, type DocumentsHarness } from './documentsHarness';

describe('reglas de los documentos', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;
  let item: string;
  let partner: string;
  let seq = 0;

  before(async () => {
    h = await startDocumentsHarness();
    item = await h.seedItem({ stock: 1000 });
    partner = await h.seedPartner();
  });
  after(async () => {
    await h?.close();
  });

  const body = (extra: Record<string, unknown> = {}) => ({
    seriesId: h.seriesId.sales,
    periodId: h.periodId,
    partnerId: partner,
    date: '2026-06-15',
    warehouseId: h.warehouseId,
    lines: [{ itemId: item, quantity: 1, price: 10, taxGroupId: h.tax.general }],
    ...extra,
  });
  const create = (extra: Record<string, unknown> = {}) =>
    h.api('POST', '/sales/invoices', body(extra));
  const line = (patch: Record<string, unknown>) => ({
    lines: [{ itemId: item, quantity: 1, price: 10, taxGroupId: h.tax.general, ...patch }],
  });

  /** Un periodo propio, con su serie de facturas de venta. */
  const newPeriod = async (year: number, status = 'O') => {
    const id = `p-${crypto.randomUUID().slice(0, 8)}`;
    await h.query(
      `INSERT INTO "AccountingPeriod" (id, code, name, "startDate", "endDate", status)
       VALUES ('${id}', '${id}', 'Periodo ${year}', '${year}-01-01', '${year}-12-31', '${status}')`,
    );
    const seriesId = `s-${id}`;
    await h.query(
      `INSERT INTO "DocumentSeries" (id, name, "periodId", "docType", "firstNumber", "nextNumber", "lastNumber")
       VALUES ('${seriesId}', 'Serie ${year}', '${id}', 'SINV', 1, 1, 9999)`,
    );
    return { periodId: id, seriesId };
  };
  const newSeries = async (values: { next?: number; last?: number; mode?: string }) => {
    const id = `sr-${++seq}-${crypto.randomUUID().slice(0, 6)}`;
    await h.query(
      `INSERT INTO "DocumentSeries" (id, name, "periodId", "docType", "firstNumber", "nextNumber", "lastNumber", "numberingMode")
       VALUES ('${id}', 'Serie ${id}', '${h.periodId}', 'SINV', 1, ${values.next ?? 1}, ${values.last ?? 9999}, '${values.mode ?? 'AUTO'}')`,
    );
    return id;
  };
  const closePeriod = (id: string) =>
    h.query(`UPDATE "AccountingPeriod" SET status = 'C' WHERE id = '${id}'`);

  describe('el número', () => {
    test('ocho a la vez salen con ocho números distintos', async () => {
      const seriesId = await newSeries({ next: 100 });
      const results = await Promise.all(Array.from({ length: 8 }, () => create({ seriesId })));
      assert.deepEqual(
        results.map((r) => r.status),
        Array(8).fill(200),
        JSON.stringify(results.map((r) => r.data)),
      );
      const numbers = results.map((r) => r.data.docNum).sort((a, b) => a - b);
      assert.deepEqual(numbers, [100, 101, 102, 103, 104, 105, 106, 107]);
      const [series] = await h.query(
        `SELECT "nextNumber" FROM "DocumentSeries" WHERE id = '${seriesId}'`,
      );
      assert.equal(series.nextNumber, 108);
    });

    test('en una serie manual, el mismo número a la vez entra una sola vez', async () => {
      const seriesId = await newSeries({ mode: 'MANUAL' });
      const results = await Promise.all(
        Array.from({ length: 3 }, () => create({ seriesId, docNum: 50 })),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409]);
    });

    test('la base no admite dos veces el mismo número en una serie', async () => {
      const seriesId = await newSeries({});
      const created = await create({ seriesId });
      await assert.rejects(
        h.query(
          `INSERT INTO "SalesInvoice" (id, "seriesId", "docNum", "periodId", "partnerId", date, status)
           VALUES ('copia-${crypto.randomUUID().slice(0, 8)}', '${seriesId}', ${created.data.docNum}, '${h.periodId}', '${partner}', now(), 'D')`,
        ),
      );
    });

    test('una serie que ha llegado a su último número no da más', async () => {
      const seriesId = await newSeries({ next: 3, last: 2 });
      const result = await create({ seriesId });
      assert.equal(result.status, 409);
      assert.match(result.data.error, /último número/);
    });

    test('el último número de la serie todavía vale', async () => {
      const seriesId = await newSeries({ next: 2, last: 2 });
      const result = await create({ seriesId });
      assert.equal(result.status, 200);
      assert.equal(result.data.docNum, 2);
    });

    test('si alguien echa atrás el contador, no repite el número', async () => {
      const seriesId = await newSeries({});
      assert.equal((await create({ seriesId })).status, 200);
      await h.query(`UPDATE "DocumentSeries" SET "nextNumber" = 1 WHERE id = '${seriesId}'`);
      const result = await create({ seriesId });
      assert.equal(result.status, 409);
      assert.match(result.data.error, /ya existe/i);
    });

    test('la serie tiene que ser de ese tipo de documento', async () => {
      const result = await create({ seriesId: h.seriesId.purchase });
      assert.equal(result.status, 400);
      assert.match(result.data.error, /serie/);
    });

    test('y de ese periodo', async () => {
      const other = await newPeriod(2032);
      const result = await create({ seriesId: other.seriesId });
      assert.equal(result.status, 400);
      assert.match(result.data.error, /serie/);
    });

    test('el contador no se puede poner por debajo de lo ya usado', async () => {
      const seriesId = await newSeries({});
      await create({ seriesId });
      await create({ seriesId });
      const back = await h.api('PATCH', `/series/${seriesId}`, { nextNumber: 1 });
      assert.equal(back.status, 409, JSON.stringify(back.data));
      assert.equal((await h.api('PATCH', `/series/${seriesId}`, { nextNumber: 3 })).status, 200);
      assert.equal((await h.api('PATCH', `/series/${seriesId}`, { nextNumber: 20 })).status, 200);
    });

    test('ni fuera del rango de la serie', async () => {
      const seriesId = await newSeries({ last: 10 });
      const result = await h.api('PATCH', `/series/${seriesId}`, { nextNumber: 12 });
      assert.equal(result.status, 400, JSON.stringify(result.data));
    });
  });

  describe('el periodo', () => {
    test('uno cerrado no admite documentos nuevos', async () => {
      const closed = await newPeriod(2020, 'C');
      const result = await create({ ...closed, date: '2020-06-01' });
      assert.equal(result.status, 409);
      assert.match(result.data.error, /cerrado/);
    });

    test('la fecha tiene que caer dentro', async () => {
      const result = await create({ date: '2019-03-01' });
      assert.equal(result.status, 400);
      assert.match(result.data.error, /periodo/);
    });

    test('un periodo que no existe se dice', async () => {
      const result = await create({ periodId: 'no-existe' });
      assert.equal(result.status, 400);
      assert.doesNotMatch(result.data.error, /Failed query/);
    });

    test('un borrador no se emite si su periodo se ha cerrado', async () => {
      const period = await newPeriod(2021);
      const draft = await create({ ...period, date: '2021-06-01' });
      assert.equal(draft.status, 200, JSON.stringify(draft.data));
      await closePeriod(period.periodId);
      const result = await h.api('POST', `/sales/invoices/${draft.data.id}/post`);
      assert.equal(result.status, 409);
      const [row] = await h.query(
        `SELECT status, "isLocked" FROM "SalesInvoice" WHERE id = '${draft.data.id}'`,
      );
      assert.equal(row.status, 'D');
      assert.equal(row.isLocked, false);
      assert.equal(await h.entryOf(draft.data.id), null);
    });

    test('tampoco se asienta nada en él', async () => {
      const closed = await newPeriod(2022, 'C');
      const accounts = await h.query(`SELECT id FROM "ChartOfAccount" LIMIT 2`);
      const entry = await JournalEngine.create(h.db, {
        date: '2022-06-01',
        periodId: closed.periodId,
        lines: [
          { accountId: accounts[0].id, debit: 10, credit: 0 },
          { accountId: accounts[1].id, debit: 0, credit: 10 },
        ],
      } as any);
      await assert.rejects(JournalEngine.post(h.db, entry.id), /cerrado/);
    });
  });

  describe('los cobros', () => {
    const issued = async (year: number) => {
      const period = await newPeriod(year);
      const draft = await create({ ...period, date: `${year}-06-01` });
      assert.equal(draft.status, 200, JSON.stringify(draft.data));
      await h.post('sales', draft.data.id);
      return { ...period, id: draft.data.id as string };
    };
    const pay = (id: string, date: string, reference = 'R1') =>
      h.api('POST', '/payments', { salesInvoiceId: id, date, amount: 5, reference });

    test('no se cobra con fecha de un periodo cerrado', async () => {
      const invoice = await issued(2024);
      const closed = await newPeriod(2023, 'C');
      const result = await pay(invoice.id, '2023-06-01');
      assert.equal(result.status, 409, JSON.stringify(result.data));
      assert.match(result.data.error, /cerrado/);
      assert.ok(closed.periodId);
      const rows = await h.query(
        `SELECT id FROM "Payment" WHERE "salesInvoiceId" = '${invoice.id}'`,
      );
      assert.equal(rows.length, 0);
    });

    test('cobrar una factura de un periodo cerrado va al periodo del cobro', async () => {
      const invoice = await issued(2025);
      await closePeriod(invoice.periodId);
      const next = await newPeriod(2030);
      const result = await pay(invoice.id, '2030-01-15');
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.ok(result.data.journalEntryId, 'sin asiento');
      const [entry] = await h.query(
        `SELECT "periodId", status FROM "JournalEntry" WHERE id = '${result.data.journalEntryId}'`,
      );
      assert.equal(entry.periodId, next.periodId);
      assert.equal(entry.status, 'posted');
    });

    test('sin periodo para esa fecha y con el de la factura cerrado, no se cobra', async () => {
      const invoice = await issued(2027);
      await closePeriod(invoice.periodId);
      const result = await pay(invoice.id, '2040-01-15');
      assert.equal(result.status, 409, JSON.stringify(result.data));
    });

    test('anular un cobro de un periodo cerrado revierte en uno abierto', async () => {
      const invoice = await issued(2028);
      const paid = await pay(invoice.id, '2028-07-01');
      assert.ok(paid.data.journalEntryId);
      await closePeriod(invoice.periodId);
      const removed = await h.api('DELETE', `/payments/${paid.data.id}`);
      assert.equal(removed.status, 200, JSON.stringify(removed.data));
      const [reversal] = await h.query(
        `SELECT "periodId", status FROM "JournalEntry" WHERE source = 'reversal' AND "sourceDocumentId" = '${paid.data.journalEntryId}'`,
      );
      assert.ok(reversal, 'sin contra-asiento');
      assert.notEqual(reversal.periodId, invoice.periodId);
      assert.equal(reversal.status, 'posted');
    });

    test('no se mueve un cobro a un periodo cerrado', async () => {
      const invoice = await issued(2029);
      const paid = await pay(invoice.id, '2029-07-01');
      await newPeriod(2018, 'C');
      const moved = await h.api('PATCH', `/payments/${paid.data.id}`, { date: '2018-03-01' });
      assert.equal(moved.status, 409, JSON.stringify(moved.data));
    });
  });

  describe('lo que no tiene sentido se rechaza con su motivo', () => {
    const cases: Array<[string, () => Record<string, unknown>]> = [
      ['sin líneas', () => ({ lines: [] })],
      ['sin interlocutor', () => ({ partnerId: undefined })],
      ['un interlocutor que no existe', () => ({ partnerId: 'no-existe' })],
      ['sin fecha', () => ({ date: undefined })],
      ['una fecha sin sentido', () => ({ date: 'hola' })],
      ['una serie que no existe', () => ({ seriesId: 'no-existe' })],
      ['un artículo que no existe', () => line({ itemId: 'no-existe' })],
      ['cantidad cero', () => line({ quantity: 0 })],
      ['cantidad negativa', () => line({ quantity: -3 })],
      ['cantidad de texto', () => line({ quantity: 'abc' })],
      ['precio negativo', () => line({ price: -5 })],
      ['precio de texto', () => line({ price: 'abc' })],
      ['descuento de más del 100 %', () => line({ discountRate: 150 })],
      ['un impuesto que no existe', () => line({ taxGroupId: 'no-existe' })],
    ];
    for (const [name, patch] of cases) {
      test(name, async () => {
        const before_ = await h.query(`SELECT count(*)::int AS n FROM "SalesInvoice"`);
        const result = await create(patch());
        assert.equal(result.status, 400, JSON.stringify(result.data));
        assert.doesNotMatch(result.data.error, /Failed query|insert into/);
        const after_ = await h.query(`SELECT count(*)::int AS n FROM "SalesInvoice"`);
        assert.equal(after_[0].n, before_[0].n);
      });
    }
  });

  describe('los errores de siempre dan su código, no un 500', () => {
    test('más de lo que hay en stock', async () => {
      const draft = await create(line({ quantity: 99999999 }));
      assert.equal(draft.status, 200, JSON.stringify(draft.data));
      const result = await h.api('POST', `/sales/invoices/${draft.data.id}/post`);
      assert.equal(result.status, 409);
      assert.match(result.data.error, /Stock insuficiente/);
    });

    test('un artículo con lotes sin lote', async () => {
      const lotItem = await h.seedItem({ stock: 5, manageBy: 'B' });
      const result = await create(line({ itemId: lotItem }));
      assert.ok(result.status === 400 || result.status === 409, JSON.stringify(result.data));
    });

    test('cancelar dos veces', async () => {
      const draft = await create();
      assert.equal((await h.api('POST', `/sales/invoices/${draft.data.id}/cancel`)).status, 200);
      assert.equal((await h.api('POST', `/sales/invoices/${draft.data.id}/cancel`)).status, 409);
    });

    test('cancelar lo que no existe', async () => {
      assert.equal((await h.api('POST', '/sales/invoices/no-existe/cancel')).status, 404);
    });

    test('el PDF de lo que no existe', async () => {
      assert.equal((await h.api('GET', '/sales/invoices/no-existe/pdf')).status, 404);
    });

    test('la factura de compra sin referencia y con una repetida', async () => {
      const supplier = await h.seedPartner();
      const purchase = (extra: Record<string, unknown>) =>
        h.api('POST', '/purchases/invoices', {
          ...body({ seriesId: h.seriesId.purchase, partnerId: supplier }),
          ...extra,
        });
      assert.equal((await purchase({})).status, 400);
      assert.equal((await purchase({ externalRef: 'REF-UNICA' })).status, 200);
      assert.equal((await purchase({ externalRef: 'REF-UNICA' })).status, 409);
    });
  });
});
