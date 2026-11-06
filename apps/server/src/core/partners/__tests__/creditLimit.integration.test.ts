/**
 * El límite de crédito: lo que cuenta como deuda, cuándo avisa, cuándo bloquea y quién se
 * lo puede saltar. Convertir un documento en otro no añade deuda: ya estaba contada.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startDocumentsHarness,
  testDatabaseUrl,
  type DocumentsHarness,
} from '../../documents/__tests__/documentsHarness';
import { openCreditGuard } from '../creditLimit';

const WRITE = { read: true, write: true, delete: false };

describe('límite de crédito', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;
  let itemId: string;
  const series: Record<string, string> = {};

  before(async () => {
    h = await startDocumentsHarness();
    await h.query(
      `INSERT INTO "DocumentSeries" (id, name, "periodId", "docType", "firstNumber", "nextNumber", "lastNumber") VALUES
        ('credit-so', 'Pedidos', '${h.periodId}', 'SO', 1, 1, 9999),
        ('credit-sq', 'Presupuestos', '${h.periodId}', 'SQ', 1, 1, 9999)`,
    );
    await h.query(
      `INSERT INTO "DocumentType" (id, code, name, "docCategory", "isRectify", "isActive", "sortOrder")
       VALUES ('dt-rect', 'RECT', 'Rectificativa', 'credit_note', true, true, 1)`,
    );
    for (const row of await h.query(`SELECT id, "docType" FROM "DocumentSeries"`)) {
      series[row.docType] = row.id;
    }
    itemId = await h.seedItem({ stock: 100000 });
  });
  after(async () => {
    await h?.close();
  });

  const setMode = async (mode: string) => {
    const res = await h.api('PUT', '/sales-settings', { creditMode: mode });
    assert.equal(res.status, 200, JSON.stringify(res.data));
  };
  const partner = async (limit: number | null) => {
    const id = await h.seedPartner();
    if (limit !== null) {
      await h.query(`UPDATE "BusinessPartner" SET "creditLimit" = ${limit} WHERE id = '${id}'`);
    }
    return id;
  };
  /** Cada línea vale 100 más el 21 % de impuesto, salvo que se diga otro precio. */
  const sale = (
    docType: string,
    partnerId: string,
    extra: Record<string, unknown> = {},
    user?: any,
  ) =>
    h.api(
      'POST',
      `/documents/${docType}`,
      {
        seriesId: series[docType],
        periodId: h.periodId,
        partnerId,
        date: '2026-06-15',
        warehouseId: h.warehouseId,
        lines: [{ itemId, quantity: 1, price: 100, taxGroupId: h.tax.general }],
        ...extra,
      },
      user,
    );
  const created = async (docType: string, partnerId: string, extra = {}) => {
    const res = await sale(docType, partnerId, extra);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data.id as string;
  };
  const usage = async (partnerId: string, query = '') => {
    const res = await h.api('GET', `/partner-credit/${partnerId}${query}`);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data;
  };

  describe('según lo que elige la empresa', () => {
    test('un interlocutor sin límite no se mira, ni bloqueando', async () => {
      await setMode('block');
      const res = await sale('SINV', await partner(null));
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(res.data.creditWarning, undefined);
    });

    test('por defecto avisa: el documento se crea y dice cuánto se pasa', async () => {
      await setMode('warn');
      const res = await sale('SINV', await partner(100));
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.deepEqual(res.data.creditWarning, { limit: 100, used: 121, added: 121, over: 21 });
    });

    test('sin elegir nada, el modo es avisar', async () => {
      await h.query(`DELETE FROM "SystemConfig" WHERE key = 'credit_mode'`);
      const res = await h.api('GET', '/sales-settings');
      assert.equal(res.status, 200);
      assert.equal(res.data.creditMode, 'warn');
    });

    test('apagado no mira nada', async () => {
      await setMode('off');
      const res = await sale('SINV', await partner(1));
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(res.data.creditWarning, undefined);
    });

    test('un modo que no existe se rechaza', async () => {
      const res = await h.api('PUT', '/sales-settings', { creditMode: 'quizas' });
      assert.equal(res.status, 400);
    });

    test('bloqueando, no deja ni el documento, ni el número, ni el stock', async () => {
      await setMode('block');
      const partnerId = await partner(100);
      const [before] = await h.query(
        `SELECT "nextNumber" FROM "DocumentSeries" WHERE id = '${series.SINV}'`,
      );
      const stockBefore = await h.stockOf(itemId);

      const res = await sale('SINV', partnerId);

      assert.equal(res.status, 409);
      assert.equal(res.data.code, 'CREDIT_LIMIT_EXCEEDED');
      assert.deepEqual(res.data.credit, { limit: 100, used: 121, added: 121, over: 21 });
      const rows = await h.query(
        `SELECT id FROM "SalesInvoice" WHERE "partnerId" = '${partnerId}'`,
      );
      assert.equal(rows.length, 0);
      const [after] = await h.query(
        `SELECT "nextNumber" FROM "DocumentSeries" WHERE id = '${series.SINV}'`,
      );
      assert.equal(after.nextNumber, before.nextNumber);
      assert.deepEqual(await h.stockOf(itemId), stockBefore);
    });

    test('bloquea también por la ruta propia de las facturas', async () => {
      await setMode('block');
      const res = await h.api('POST', '/sales/invoices', {
        seriesId: series.SINV,
        periodId: h.periodId,
        partnerId: await partner(100),
        date: '2026-06-15',
        warehouseId: h.warehouseId,
        lines: [{ itemId, quantity: 1, price: 100, taxGroupId: h.tax.general }],
      });
      assert.equal(res.status, 409);
      assert.equal(res.data.code, 'CREDIT_LIMIT_EXCEEDED');
    });

    test('bloquea en pedido y en albarán', async () => {
      await setMode('block');
      for (const docType of ['SO', 'SDN']) {
        const res = await sale(docType, await partner(100));
        assert.equal(res.status, 409, docType);
      }
    });

    test('llegar justo al límite no es pasarse', async () => {
      await setMode('block');
      const res = await sale('SINV', await partner(121));
      assert.equal(res.status, 200, JSON.stringify(res.data));
    });

    test('con límite cero no se le vende a crédito', async () => {
      await setMode('block');
      const res = await sale('SINV', await partner(0));
      assert.equal(res.status, 409);
    });
  });

  describe('saltarse un bloqueo', () => {
    test('un administrador puede, y queda en auditoría', async () => {
      await setMode('block');
      const partnerId = await partner(100);
      const res = await sale('SINV', partnerId, { creditOverride: true });
      assert.equal(res.status, 200, JSON.stringify(res.data));

      const rows = await h.query(
        `SELECT * FROM "AuditLog" WHERE "entityId" = '${res.data.id}' AND action = 'OVERRIDE'`,
      );
      assert.equal(rows.length, 1);
      const logged =
        typeof rows[0].newValue === 'string' ? JSON.parse(rows[0].newValue) : rows[0].newValue;
      assert.equal(logged.partnerId, partnerId);
      assert.equal(logged.limit, 100);
      assert.equal(logged.used, 121);
    });

    test('sin el permiso no sirve pedirlo, y se le dice que no puede', async () => {
      await setMode('block');
      const user = await h.seedUser('sin-permiso', { '/sales/invoices': WRITE });
      const res = await sale('SINV', await partner(100), { creditOverride: true }, user);
      assert.equal(res.status, 409);
      assert.equal(res.data.canOverride, false);
    });

    test('con el permiso, puede', async () => {
      await setMode('block');
      const user = await h.seedUser('con-permiso', {
        '/sales/invoices': WRITE,
        '/credit-override': WRITE,
      });
      const blocked = await sale('SINV', await partner(100), {}, user);
      assert.equal(blocked.status, 409);
      assert.equal(blocked.data.canOverride, true);

      const res = await sale('SINV', await partner(100), { creditOverride: true }, user);
      assert.equal(res.status, 200, JSON.stringify(res.data));
    });

    test('pedirlo sin hacer falta no deja nada en auditoría', async () => {
      await setMode('block');
      const res = await sale('SINV', await partner(1000), { creditOverride: true });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const rows = await h.query(
        `SELECT id FROM "AuditLog" WHERE "entityId" = '${res.data.id}' AND action = 'OVERRIDE'`,
      );
      assert.equal(rows.length, 0);
    });
  });

  describe('lo que cuenta como deuda', () => {
    test('una factura emitida cuenta lo que queda por cobrar', async () => {
      await setMode('warn');
      const partnerId = await partner(1000);
      const id = await created('SINV', partnerId);
      await h.post('sales', id);
      const paid = await h.api('POST', '/payments', {
        salesInvoiceId: id,
        amount: 21,
        date: '2026-06-16',
        reference: 'R1',
        paymentMethod: 'transfer',
      });
      assert.equal(paid.status, 200, JSON.stringify(paid.data));

      const credit = await usage(partnerId);
      assert.equal(credit.invoices, 100);
      assert.equal(credit.used, 100);
      assert.equal(credit.available, 900);
      assert.equal(credit.limit, 1000);
      assert.equal(credit.mode, 'warn');
    });

    test('un borrador cuenta: ya ha movido el stock y si no se podrían amontonar', async () => {
      await setMode('warn');
      const partnerId = await partner(1000);
      await created('SINV', partnerId);
      assert.equal((await usage(partnerId)).invoices, 121);
    });

    test('una cancelada no cuenta, y una saldada tampoco', async () => {
      await setMode('warn');
      const partnerId = await partner(1000);
      const draft = await created('SINV', partnerId);
      const cancel = await h.api('POST', `/sales/invoices/${draft}/cancel`, {});
      assert.equal(cancel.status, 200, JSON.stringify(cancel.data));

      const issued = await created('SINV', partnerId);
      await h.post('sales', issued);
      const paid = await h.api('POST', '/payments', {
        salesInvoiceId: issued,
        amount: 121,
        date: '2026-06-16',
        reference: 'R1',
        paymentMethod: 'transfer',
      });
      assert.equal(paid.status, 200, JSON.stringify(paid.data));

      assert.equal((await usage(partnerId)).used, 0);
    });

    test('un albarán sin facturar cuenta, y al facturarlo no se cuenta dos veces', async () => {
      await setMode('warn');
      const partnerId = await partner(1000);
      const note = await created('SDN', partnerId);
      assert.equal((await usage(partnerId)).deliveryNotes, 121);

      await created('SINV', partnerId, {
        lines: [
          {
            itemId,
            quantity: 1,
            price: 100,
            taxGroupId: h.tax.general,
            baseType: 'SDN',
            baseId: note,
            baseLine: 1,
          },
        ],
      });
      const credit = await usage(partnerId);
      assert.equal(credit.deliveryNotes, 0);
      assert.equal(credit.invoices, 121);
      assert.equal(credit.used, 121);
    });

    test('de un pedido cuenta lo que falta por servir', async () => {
      await setMode('warn');
      const partnerId = await partner(1000);
      const order = await created('SO', partnerId, {
        lines: [{ itemId, quantity: 10, price: 10, taxGroupId: h.tax.general }],
      });
      assert.equal((await usage(partnerId)).orders, 121);

      await created('SDN', partnerId, {
        orderId: order,
        lines: [{ itemId, quantity: 4, price: 10, taxGroupId: h.tax.general, baseLine: 1 }],
      });
      const credit = await usage(partnerId);
      assert.equal(credit.orders, 72.6);
      assert.equal(credit.deliveryNotes, 48.4);
      assert.equal(credit.used, 121);
    });

    test('un pedido cerrado o cancelado no cuenta', async () => {
      await setMode('warn');
      const partnerId = await partner(1000);
      const order = await created('SO', partnerId);
      await h.query(`UPDATE "SalesOrder" SET status = 'X' WHERE id = '${order}'`);
      assert.equal((await usage(partnerId)).orders, 0);
    });

    test('lo que queda a favor de un abono resta', async () => {
      await setMode('warn');
      const partnerId = await partner(1000);
      const paidInvoice = await created('SINV', partnerId);
      await h.post('sales', paidInvoice);
      await h.api('POST', '/payments', {
        salesInvoiceId: paidInvoice,
        amount: 121,
        date: '2026-06-16',
        reference: 'R1',
        paymentMethod: 'transfer',
      });
      const prep = await h.api('GET', `/sales/invoices/${paidInvoice}/credit-note`);
      assert.equal(prep.status, 200, JSON.stringify(prep.data));
      const line = prep.data.lines[0];
      const note = await h.api('POST', `/sales/invoices/${paidInvoice}/credit-note`, {
        reason: 'Error',
        documentTypeId: 'dt-rect',
        seriesId: series.SINV,
        periodId: h.periodId,
        date: '2026-06-17',
        lines: [{ lineId: line.lineId, quantity: line.available }],
      });
      assert.equal(note.status, 200, JSON.stringify(note.data));
      await h.post('sales', note.data.id);

      await created('SINV', partnerId);
      const credit = await usage(partnerId);
      assert.equal(credit.invoices, 121);
      assert.equal(credit.creditBalance, 121);
      assert.equal(credit.used, 0);
    });

    test('dice si un importe más cabría', async () => {
      await setMode('block');
      const partnerId = await partner(200);
      await created('SINV', partnerId);
      assert.equal((await usage(partnerId, '?amount=50')).wouldExceed, false);
      assert.equal((await usage(partnerId, '?amount=100')).wouldExceed, true);
      assert.equal((await usage(partnerId, '?amount=100')).canOverride, true);
    });

    test('un interlocutor que no existe da 404', async () => {
      const res = await h.api('GET', '/partner-credit/no-existe');
      assert.equal(res.status, 404);
    });
  });

  describe('convertir no añade deuda', () => {
    test('un pedido aceptado se puede servir y facturar aunque ya se pase', async () => {
      await setMode('block');
      const partnerId = await partner(1000);
      const order = await created('SO', partnerId);
      await h.query(`UPDATE "BusinessPartner" SET "creditLimit" = 50 WHERE id = '${partnerId}'`);

      const note = await sale('SDN', partnerId, {
        orderId: order,
        lines: [{ itemId, quantity: 1, price: 100, taxGroupId: h.tax.general, baseLine: 1 }],
      });
      assert.equal(note.status, 200, JSON.stringify(note.data));
      assert.equal(note.data.creditWarning, undefined);

      const invoice = await sale('SINV', partnerId, {
        lines: [
          {
            itemId,
            quantity: 1,
            price: 100,
            taxGroupId: h.tax.general,
            baseType: 'SDN',
            baseId: note.data.id,
            baseLine: 1,
          },
        ],
      });
      assert.equal(invoice.status, 200, JSON.stringify(invoice.data));
    });

    test('una venta nueva al mismo cliente sí se bloquea', async () => {
      await setMode('block');
      const partnerId = await partner(1000);
      await created('SO', partnerId);
      await h.query(`UPDATE "BusinessPartner" SET "creditLimit" = 50 WHERE id = '${partnerId}'`);
      const res = await sale('SO', partnerId);
      assert.equal(res.status, 409);
    });

    test('facturar a más precio que el albarán añade esa diferencia', async () => {
      await setMode('block');
      const partnerId = await partner(150);
      const note = await created('SDN', partnerId);
      const res = await sale('SINV', partnerId, {
        lines: [
          {
            itemId,
            quantity: 1,
            price: 200,
            taxGroupId: h.tax.general,
            baseType: 'SDN',
            baseId: note,
            baseLine: 1,
          },
        ],
      });
      assert.equal(res.status, 409);
      assert.equal(res.data.credit.added, 121);
    });
  });

  describe('lo que no se mira', () => {
    test('un abono se puede hacer aunque el cliente se pase', async () => {
      await setMode('block');
      const partnerId = await partner(1000);
      const invoice = await created('SINV', partnerId);
      await h.post('sales', invoice);
      await h.query(`UPDATE "BusinessPartner" SET "creditLimit" = 1 WHERE id = '${partnerId}'`);
      const prep = await h.api('GET', `/sales/invoices/${invoice}/credit-note`);
      const line = prep.data.lines[0];
      const note = await h.api('POST', `/sales/invoices/${invoice}/credit-note`, {
        reason: 'Error',
        documentTypeId: 'dt-rect',
        seriesId: series.SINV,
        periodId: h.periodId,
        date: '2026-06-17',
        lines: [{ lineId: line.lineId, quantity: line.available }],
      });
      assert.equal(note.status, 200, JSON.stringify(note.data));
    });

    test('una compra al mismo interlocutor no cuenta ni se bloquea', async () => {
      await setMode('block');
      const partnerId = await partner(0);
      const id = await h.invoice('purchase', [{ itemId, quantity: 1, price: 100 }], { partnerId });
      assert.ok(id);
      assert.equal((await usage(partnerId)).used, 0);
    });

    test('un presupuesto no es deuda', async () => {
      await setMode('block');
      const partnerId = await partner(0);
      const res = await sale('SQ', partnerId);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal((await usage(partnerId)).used, 0);
    });
  });

  test('de dos ventas a la vez que juntas se pasan, solo entra una', async () => {
    await setMode('block');
    const partnerId = await partner(150);
    // Tipos distintos: cada uno con su serie, para que no los ponga en fila el contador.
    const results = await Promise.all([sale('SINV', partnerId), sale('SO', partnerId)]);
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 409], JSON.stringify(results.map((r) => r.data)));
    assert.equal((await usage(partnerId)).used, 121);
  });

  test('mientras se crea una venta, otra del mismo cliente espera a que acabe', async () => {
    await setMode('block');
    const partnerId = await partner(150);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const first = h.db.transaction(async (tx: any) => {
      await openCreditGuard(tx, partnerId);
      await held;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    let finished = false;
    const second = sale('SINV', partnerId).then((res) => {
      finished = true;
      return res;
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const finishedWhileHeld = finished;
    release();
    await first;
    const res = await second;

    assert.equal(finishedWhileHeld, false);
    assert.equal(res.status, 200, JSON.stringify(res.data));
  });

  describe('poner el límite', () => {
    const partnerUser = () =>
      h.seedUser(`partners-${Math.random().toString(36).slice(2, 8)}`, { '/partners': WRITE });

    test('cambiarlo pide el mismo permiso que saltárselo', async () => {
      const id = await partner(100);
      const res = await h.api(
        'PATCH',
        `/partners/${id}`,
        { creditLimit: 5000 },
        await partnerUser(),
      );
      assert.equal(res.status, 403);
      const [row] = await h.query(`SELECT "creditLimit" FROM "BusinessPartner" WHERE id = '${id}'`);
      assert.equal(Number(row.creditLimit), 100);
    });

    test('guardar la ficha con el mismo límite no pide nada', async () => {
      const id = await partner(100);
      const res = await h.api(
        'PATCH',
        `/partners/${id}`,
        { name: 'Otro nombre', creditLimit: '100.00' },
        await partnerUser(),
      );
      assert.equal(res.status, 200, JSON.stringify(res.data));
    });

    test('crear un interlocutor con límite también lo pide', async () => {
      const res = await h.api(
        'POST',
        '/partners',
        { code: `NEW${Date.now()}`, name: 'Nuevo', creditLimit: 500 },
        await partnerUser(),
      );
      assert.equal(res.status, 403);
    });

    test('un administrador lo cambia, y vacío es sin límite', async () => {
      const id = await partner(100);
      const res = await h.api('PATCH', `/partners/${id}`, { creditLimit: '' });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const [row] = await h.query(`SELECT "creditLimit" FROM "BusinessPartner" WHERE id = '${id}'`);
      assert.equal(row.creditLimit, null);
    });

    test('un límite negativo o que no es un número se rechaza', async () => {
      const id = await partner(100);
      for (const creditLimit of [-1, 'mucho']) {
        const res = await h.api('PATCH', `/partners/${id}`, { creditLimit });
        assert.equal(res.status, 400, String(creditLimit));
      }
    });
  });
});
