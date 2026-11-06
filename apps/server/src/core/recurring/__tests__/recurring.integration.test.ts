/**
 * Facturas recurrentes: se crean por el motor, no repiten ni se saltan periodos, y emitir
 * o enviar solo pasa si se ha pedido. Ningún correo sale de verdad.
 */
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startDocumentsHarness,
  testDatabaseUrl,
  type DocumentsHarness,
} from '../../documents/__tests__/documentsHarness';
import * as Mailer from '../../email/Mailer';
import * as attachments from '../../documents/documentAttachment';
import { DocumentEngine } from '../../documents/DocumentEngine';
import {
  createRecurring,
  generateDue,
  runRecurringForTenant,
  setRecurringStatus,
  updateRecurring,
} from '../recurringDocuments';

const USER = { id: null, role: 'ADMIN' };

describe('facturas recurrentes', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;
  let itemId: string;
  let sent: any[] = [];

  before(async () => {
    h = await startDocumentsHarness();
    itemId = await h.seedItem({ stock: 100000 });
    await Mailer.writeConfig(h.db, { enabled: true, host: 'smtp.test' });
    mock.method(attachments, 'buildDocumentAttachment', async (_docType: string, id: string) => ({
      filename: `${id}.pdf`,
      content: Buffer.from('%PDF'),
      contentType: 'application/pdf',
    }));
    mock.method(Mailer, 'sendMail', async (_tenantId: string, _db: any, input: any) => {
      sent.push(input);
      return { messageId: 'm', accepted: [input.to], rejected: [] };
    });
  });
  after(async () => {
    mock.restoreAll();
    await h?.close();
  });
  beforeEach(() => {
    sent = [];
  });
  afterEach(async () => {
    await h.query(`UPDATE "AccountingPeriod" SET status = 'O'`);
    await h.query(`UPDATE "RecurringDocument" SET status = 'finished', "nextDate" = NULL`);
    await h.api('PUT', '/sales-settings', { creditMode: 'warn' });
  });

  const lines = () => [{ itemId, quantity: 2, price: 50, taxGroupId: h.tax.general }];
  const input = async (extra: Record<string, unknown> = {}) => ({
    name: 'Mantenimiento',
    partnerId: extra.partnerId ?? (await h.seedPartner()),
    frequency: 'monthly',
    startDate: '2026-03-15',
    warehouseId: h.warehouseId,
    seriesId: h.seriesId.sales,
    lines: lines(),
    ...extra,
  });
  const create = async (extra: Record<string, unknown> = {}, today = '2026-03-01') =>
    createRecurring(h.db, USER, await input(extra), { today });
  const invoicesOf = (partnerId: string) =>
    h.query(`SELECT * FROM "SalesInvoice" WHERE "partnerId" = '${partnerId}' ORDER BY date`);
  const rowOf = async (id: string) => {
    const [row] = await h.query(`SELECT * FROM "RecurringDocument" WHERE id = '${id}'`);
    return row;
  };
  const isoOf = (value: any) => new Date(value).toISOString().slice(0, 10);

  describe('generar', () => {
    test('crea un borrador con sus líneas por el motor y pasa a la fecha siguiente', async () => {
      const row = await create();
      assert.equal(row.nextDate, '2026-03-15');

      const generated = await generateDue(h.db, h.tenantId, row.id, { today: '2026-03-15' });

      assert.equal(generated.length, 1);
      const [invoice] = await invoicesOf(row.partnerId);
      assert.equal(invoice.status, 'D');
      assert.equal(Number(invoice.total), 121);
      assert.equal(invoice.isLocked, false);
      assert.equal(
        invoice.date.toISOString?.().slice(0, 7) ?? String(invoice.date).slice(0, 7),
        '2026-03',
      );
      const [line] = await h.query(
        `SELECT * FROM "SalesInvoiceLine" WHERE "invoiceId" = '${invoice.id}'`,
      );
      assert.equal(line.itemId, itemId);
      assert.equal(Number(line.quantity), 2);

      const after = await rowOf(row.id);
      assert.equal(isoOf(after.nextDate).slice(0, 7), '2026-04');
      assert.equal(after.status, 'active');
      const runs = await h.query(
        `SELECT * FROM "RecurringDocumentRun" WHERE "recurringId" = '${row.id}'`,
      );
      assert.equal(runs.length, 1);
      assert.equal(runs[0].documentId, invoice.id);
    });

    test('antes de su fecha no hace nada', async () => {
      const row = await create();
      assert.deepEqual(await generateDue(h.db, h.tenantId, row.id, { today: '2026-03-14' }), []);
      assert.equal((await invoicesOf(row.partnerId)).length, 0);
    });

    test('borrador, sin emitir ni enviar, salvo que se pida', async () => {
      const row = await create();
      await generateDue(h.db, h.tenantId, row.id, { today: '2026-03-15' });
      assert.equal(sent.length, 0);
    });

    test('recupera lo que no se generó estando activa, cada uno con su fecha', async () => {
      const row = await create();
      const generated = await generateDue(h.db, h.tenantId, row.id, { today: '2026-05-20' });
      assert.deepEqual(
        generated.map((g) => g.periodDate),
        ['2026-03-15', '2026-04-15', '2026-05-15'],
      );
      assert.equal((await invoicesOf(row.partnerId)).length, 3);
    });

    test('con fecha de fin, genera la última y termina', async () => {
      const row = await create({ endDate: '2026-04-20' });
      await generateDue(h.db, h.tenantId, row.id, { today: '2026-12-01' });
      assert.equal((await invoicesOf(row.partnerId)).length, 2);
      const after = await rowOf(row.id);
      assert.equal(after.status, 'finished');
      assert.equal(after.nextDate, null);
    });

    test('al cambiar de ejercicio toma la serie del nuevo, con el mismo prefijo', async () => {
      await h.query(
        `INSERT INTO "AccountingPeriod" (id, code, name, "startDate", "endDate") VALUES ('per-2027', 'P2027', 'Periodo 2027', '2027-01-01', '2027-12-31')`,
      );
      await h.query(`UPDATE "DocumentSeries" SET prefix = 'FA' WHERE id = '${h.seriesId.sales}'`);
      await h.query(
        `INSERT INTO "DocumentSeries" (id, name, "periodId", "docType", "firstNumber", "nextNumber", "lastNumber", prefix) VALUES
          ('s-otra-2027', 'Otra 2027', 'per-2027', 'SINV', 1, 1, 9999, 'XX'),
          ('s-fa-2027', 'FA 2027', 'per-2027', 'SINV', 1, 1, 9999, 'FA')`,
      );
      const row = await create({ startDate: '2026-12-15' });
      await generateDue(h.db, h.tenantId, row.id, { today: '2027-01-20' });
      const invoices = await invoicesOf(row.partnerId);
      assert.deepEqual(
        invoices.map((i) => i.seriesId),
        [h.seriesId.sales, 's-fa-2027'],
      );
      assert.deepEqual(
        invoices.map((i) => i.periodId),
        [h.periodId, 'per-2027'],
      );
    });
  });

  describe('sin repetir', () => {
    test('generar otra vez el mismo día no crea otra', async () => {
      const row = await create();
      await generateDue(h.db, h.tenantId, row.id, { today: '2026-03-15' });
      await generateDue(h.db, h.tenantId, row.id, { today: '2026-03-15' });
      assert.equal((await invoicesOf(row.partnerId)).length, 1);
    });

    test('dos a la vez generan una sola', async () => {
      const row = await create();
      await Promise.all([
        generateDue(h.db, h.tenantId, row.id, { today: '2026-03-15' }),
        generateDue(h.db, h.tenantId, row.id, { today: '2026-03-15' }),
      ]);
      assert.equal((await invoicesOf(row.partnerId)).length, 1);
    });

    test('un periodo ya generado no se vuelve a crear aunque la fecha retroceda', async () => {
      const row = await create();
      await generateDue(h.db, h.tenantId, row.id, { today: '2026-03-15' });
      await h.query(
        `UPDATE "RecurringDocument" SET "nextDate" = '2026-03-15' WHERE id = '${row.id}'`,
      );
      await generateDue(h.db, h.tenantId, row.id, { today: '2026-03-20' });
      assert.equal((await invoicesOf(row.partnerId)).length, 1);
      assert.equal(isoOf((await rowOf(row.id)).nextDate).slice(0, 7), '2026-04');
    });
  });

  describe('si falla', () => {
    test('no crea nada, no avanza, avisa una vez al día y al arreglarlo genera ese periodo', async () => {
      const admin = await h.seedAdmin(`rec-admin-${Math.random().toString(36).slice(2, 7)}`);
      const row = await create();
      await h.query(`UPDATE "AccountingPeriod" SET status = 'C'`);
      const [seriesBefore] = await h.query(
        `SELECT "nextNumber" FROM "DocumentSeries" WHERE id = '${h.seriesId.sales}'`,
      );

      await runRecurringForTenant(h.tenantId, h.db, { today: '2026-03-15' });
      await runRecurringForTenant(h.tenantId, h.db, { today: '2026-03-15' });

      assert.equal((await invoicesOf(row.partnerId)).length, 0);
      const failed = await rowOf(row.id);
      assert.equal(isoOf(failed.nextDate), isoOf('2026-03-15'));
      assert.match(failed.lastError, /periodo contable/);
      const notices = await h.query(
        `SELECT id FROM "Notification" WHERE "userId" = '${admin.id}' AND link = '/sales/recurring/${row.id}'`,
      );
      assert.equal(notices.length, 1);
      const [seriesAfter] = await h.query(
        `SELECT "nextNumber" FROM "DocumentSeries" WHERE id = '${h.seriesId.sales}'`,
      );
      assert.equal(seriesAfter.nextNumber, seriesBefore.nextNumber);

      await h.query(`UPDATE "AccountingPeriod" SET status = 'O'`);
      await runRecurringForTenant(h.tenantId, h.db, { today: '2026-03-16' });
      const invoices = await invoicesOf(row.partnerId);
      assert.equal(invoices.length, 1);
      assert.equal((await rowOf(row.id)).lastError, null);
    });

    test('una que falla no para a las demás', async () => {
      const broken = await create({ lines: [{ itemId: 'no-existe', quantity: 1, price: 1 }] });
      const fine = await create();
      await runRecurringForTenant(h.tenantId, h.db, { today: '2026-03-15' });
      assert.equal((await invoicesOf(broken.partnerId)).length, 0);
      assert.equal((await invoicesOf(fine.partnerId)).length, 1);
    });

    test('el límite de crédito también la para, y no se salta el periodo', async () => {
      await h.api('PUT', '/sales-settings', { creditMode: 'block' });
      const partnerId = await h.seedPartner();
      await h.query(`UPDATE "BusinessPartner" SET "creditLimit" = 1 WHERE id = '${partnerId}'`);
      const row = await create({ partnerId });
      await runRecurringForTenant(h.tenantId, h.db, { today: '2026-03-15' });
      assert.equal((await invoicesOf(partnerId)).length, 0);
      const failed = await rowOf(row.id);
      assert.match(failed.lastError, /crédito/);
      assert.equal(isoOf(failed.nextDate), isoOf('2026-03-15'));
    });

    test('avisando, se crea y queda dicho', async () => {
      const partnerId = await h.seedPartner();
      await h.query(`UPDATE "BusinessPartner" SET "creditLimit" = 1 WHERE id = '${partnerId}'`);
      const row = await create({ partnerId });
      await generateDue(h.db, h.tenantId, row.id, { today: '2026-03-15' });
      const [run] = await h.query(
        `SELECT note FROM "RecurringDocumentRun" WHERE "recurringId" = '${row.id}'`,
      );
      assert.match(run.note, /crédito/);
    });
  });

  describe('emitir y enviar', () => {
    test('emitir solo si se ha pedido', async () => {
      const row = await create({ autoPost: true });
      await generateDue(h.db, h.tenantId, row.id, { today: '2026-03-15' });
      const [invoice] = await invoicesOf(row.partnerId);
      assert.equal(invoice.status, 'O');
      assert.equal(invoice.isLocked, true);
      assert.equal(sent.length, 0);
    });

    test('enviar solo si se ha pedido, al correo del cliente y con el PDF', async () => {
      const partnerId = await h.seedPartner();
      await h.query(
        `UPDATE "BusinessPartner" SET email = 'cliente@example.com' WHERE id = '${partnerId}'`,
      );
      const row = await create({ partnerId, autoPost: true, autoSend: true });
      await generateDue(h.db, h.tenantId, row.id, { today: '2026-03-15' });
      const [invoice] = await invoicesOf(partnerId);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].to, 'cliente@example.com');
      assert.equal(sent[0].attachments[0].filename, `${invoice.id}.pdf`);
    });

    test('enviar sin emitir no se admite', async () => {
      await assert.rejects(create({ autoSend: true }), /emitirla/);
    });

    test('si no se puede emitir queda en borrador, se apunta y se avisa', async () => {
      const admin = await h.seedAdmin(`post-admin-${Math.random().toString(36).slice(2, 7)}`);
      const row = await create({ autoPost: true });
      const postMock = mock.method(DocumentEngine, 'post', async () => {
        throw new Error('Conector caído');
      });
      try {
        await generateDue(h.db, h.tenantId, row.id, { today: '2026-03-15' });
      } finally {
        postMock.mock.restore();
      }
      const [invoice] = await invoicesOf(row.partnerId);
      assert.equal(invoice.status, 'D');
      const [run] = await h.query(
        `SELECT note FROM "RecurringDocumentRun" WHERE "recurringId" = '${row.id}'`,
      );
      assert.match(run.note, /Conector caído/);
      const notices = await h.query(`SELECT id FROM "Notification" WHERE "userId" = '${admin.id}'`);
      assert.ok(notices.length >= 1);
      assert.equal(isoOf((await rowOf(row.id)).nextDate).slice(0, 7), '2026-04');
    });

    test('sin correo del cliente se emite, se apunta y no se reintenta', async () => {
      const row = await create({ autoPost: true, autoSend: true });
      await generateDue(h.db, h.tenantId, row.id, { today: '2026-03-15' });
      const [invoice] = await invoicesOf(row.partnerId);
      assert.equal(invoice.status, 'O');
      assert.equal(sent.length, 0);
      const [run] = await h.query(
        `SELECT note FROM "RecurringDocumentRun" WHERE "recurringId" = '${row.id}'`,
      );
      assert.match(run.note, /correo/);
    });
  });

  describe('fechas al crearla y al reanudarla', () => {
    test('un inicio antiguo no dispara lo pasado: empieza en la primera fecha desde hoy', async () => {
      const row = await create({ startDate: '2026-01-31' }, '2026-03-10');
      assert.equal(row.nextDate, '2026-03-31');
      assert.deepEqual(await generateDue(h.db, h.tenantId, row.id, { today: '2026-03-10' }), []);
    });

    test('pausada no genera, y al reanudar no recupera lo de la pausa', async () => {
      const row = await create();
      await setRecurringStatus(h.db, row.id, 'pause');
      assert.deepEqual(await generateDue(h.db, h.tenantId, row.id, { today: '2026-06-30' }), []);

      const resumed = await setRecurringStatus(h.db, row.id, 'resume', { today: '2026-06-30' });
      assert.equal(resumed.status, 'active');
      assert.equal(resumed.nextDate, '2026-07-15');
      assert.equal((await invoicesOf(row.partnerId)).length, 0);
    });

    test('al reanudar el mismo día de la última no la repite', async () => {
      const row = await create();
      await generateDue(h.db, h.tenantId, row.id, { today: '2026-03-15' });
      await setRecurringStatus(h.db, row.id, 'pause');
      const resumed = await setRecurringStatus(h.db, row.id, 'resume', { today: '2026-03-15' });
      assert.equal(resumed.nextDate, '2026-04-15');
    });

    test('cambiar el texto no mueve la fecha; cambiar la frecuencia sí', async () => {
      const row = await create();
      const same = await updateRecurring(
        h.db,
        row.id,
        { ...(await input({ partnerId: row.partnerId })), name: 'Otro nombre' },
        { today: '2026-03-01' },
      );
      assert.equal(same.nextDate, '2026-03-15');
      assert.equal(same.name, 'Otro nombre');

      const changed = await updateRecurring(
        h.db,
        row.id,
        {
          ...(await input({ partnerId: row.partnerId })),
          frequency: 'quarterly',
          startDate: '2026-01-10',
        },
        { today: '2026-03-01' },
      );
      assert.equal(changed.nextDate, '2026-04-10');
    });

    test('adelantar el fin por debajo de la próxima la termina', async () => {
      const row = await create();
      const ended = await updateRecurring(
        h.db,
        row.id,
        {
          ...(await input({ partnerId: row.partnerId })),
          endDate: '2026-03-15',
          startDate: '2026-03-15',
        },
        { today: '2026-03-01' },
      );
      assert.equal(ended.status, 'active');
      const earlier = await updateRecurring(
        h.db,
        row.id,
        {
          ...(await input({ partnerId: row.partnerId })),
          startDate: '2026-03-15',
          endDate: '2026-03-15',
        },
        { today: '2026-03-20' },
      );
      assert.equal(earlier.nextDate, '2026-03-15');
    });
  });

  describe('la API', () => {
    const body = async (extra: Record<string, unknown> = {}) =>
      input({ startDate: '2099-01-01', ...extra });

    test('crea, lista, enseña lo generado y borra si no ha generado nada', async () => {
      const created = await h.api('POST', '/recurring-documents', await body());
      assert.equal(created.status, 200, JSON.stringify(created.data));

      const list = await h.api('GET', '/recurring-documents');
      const row = list.data.find((r: any) => r.id === created.data.id);
      assert.equal(row.net, 100);
      assert.equal(row.runCount, 0);
      assert.ok(row.partnerName);

      const one = await h.api('GET', `/recurring-documents/${created.data.id}`);
      assert.deepEqual(one.data.runs, []);

      const removed = await h.api('DELETE', `/recurring-documents/${created.data.id}`);
      assert.equal(removed.status, 200);
    });

    test('lo que ya generó no se borra', async () => {
      const row = await create();
      await generateDue(h.db, h.tenantId, row.id, { today: '2026-03-15' });
      const res = await h.api('DELETE', `/recurring-documents/${row.id}`);
      assert.equal(res.status, 409);
    });

    test('generar ahora no adelanta lo que no toca', async () => {
      const created = await h.api('POST', '/recurring-documents', await body());
      const res = await h.api('POST', `/recurring-documents/${created.data.id}/run`);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.deepEqual(res.data.generated, []);
    });

    test('rechaza lo que no se puede generar', async () => {
      for (const extra of [
        { name: '' },
        { lines: [] },
        { frequency: 'cuando-sea' },
        { startDate: '2026-02-30' },
        { endDate: '2020-01-01' },
        { partnerId: 'no-existe' },
        { lines: [{ itemId: 'x', quantity: 0, price: 1 }] },
        { docType: 'PINV' },
      ]) {
        const res = await h.api('POST', '/recurring-documents', await body(extra));
        assert.equal(res.status, 400, JSON.stringify(extra));
      }
    });

    test('un fin que no llega a ninguna fecha se rechaza', async () => {
      const res = await h.api(
        'POST',
        '/recurring-documents',
        await input({ startDate: '2020-01-01', endDate: '2020-02-01' }),
      );
      assert.equal(res.status, 400);
    });

    test('un token de API necesita el permiso de ventas', async () => {
      const res = await h.api('POST', '/recurring-documents', await body(), null, [
        'read:logistics',
      ]);
      assert.equal(res.status, 403);
    });

    test('lo que no existe da 404', async () => {
      assert.equal((await h.api('GET', '/recurring-documents/no-existe')).status, 404);
      assert.equal((await h.api('POST', '/recurring-documents/no-existe/pause')).status, 404);
    });
  });
});
