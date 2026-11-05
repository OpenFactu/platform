/**
 * Reclamar impagos: lo vencido por cliente, la carta y su nivel. Ningún correo sale de
 * verdad: `sendMail` y el PDF se sustituyen. El nivel solo sube si el correo se acepta.
 */
import { after, before, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startDocumentsHarness,
  testDatabaseUrl,
  type DocumentsHarness,
} from '../../documents/__tests__/documentsHarness';
import * as Mailer from '../../email/Mailer';
import * as attachments from '../../documents/documentAttachment';
import { runAutomaticDunning } from '../dunningCron';

describe('reclamación de impagos', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;
  let itemId: string;
  let sent: any[] = [];
  let failWith: string | null = null;
  let delayMs = 0;

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
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (failWith) throw new Error(failWith);
      sent.push(input);
      return { messageId: 'm', accepted: [input.to], rejected: [] };
    });
  });
  after(async () => {
    mock.restoreAll();
    await h?.close();
  });
  beforeEach(async () => {
    sent = [];
    failWith = null;
    delayMs = 0;
    await h.query(`UPDATE "BusinessPartner" SET "dunningExcluded" = true`);
    await h.api('PUT', '/sales-settings', {
      dunning: {
        autoSend: false,
        minDaysBetween: 7,
        levels: [
          { days: 7, subject: '', body: '' },
          { days: 30, subject: '', body: '' },
          { days: 60, subject: '', body: '' },
        ],
      },
    });
  });

  const customer = async (fields: { name?: string; email?: string | null } = {}) => {
    const id = await h.seedPartner();
    const email = fields.email === undefined ? `c-${id}@example.com` : fields.email;
    await h.query(
      `UPDATE "BusinessPartner" SET email = ${email === null ? 'NULL' : `'${email}'`}${
        fields.name ? `, name = '${fields.name}'` : ''
      } WHERE id = '${id}'`,
    );
    return id;
  };
  /** Una factura emitida de 121, vencida hace tantos días. */
  const overdueInvoice = async (partnerId: string, days: number) => {
    const id = await h.invoice(
      'sales',
      [{ itemId, quantity: 1, price: 100, taxGroupId: h.tax.general }],
      { partnerId },
    );
    await h.post('sales', id);
    await h.query(
      `UPDATE "SalesInvoice" SET "dueDate" = CURRENT_DATE - ${days}, "lockedAt" = CURRENT_DATE - ${days} WHERE id = '${id}'`,
    );
    return id;
  };
  const overdue = async () => {
    const res = await h.api('GET', '/dunning/overdue');
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data as any[];
  };
  const rowOf = async (partnerId: string) =>
    (await overdue()).find((c) => c.partnerId === partnerId);
  const send = (partnerId: string, body: Record<string, unknown> = {}) =>
    h.api('POST', `/dunning/send/${partnerId}`, body);

  describe('lo vencido', () => {
    test('agrupa por cliente, con lo que debe y desde cuándo', async () => {
      const partnerId = await customer({ name: 'Moroso' });
      const old = await overdueInvoice(partnerId, 40);
      const recent = await overdueInvoice(partnerId, 10);

      const row = await rowOf(partnerId);
      assert.equal(row.name, 'Moroso');
      assert.equal(row.total, 242);
      assert.equal(row.oldestDays, 40);
      assert.deepEqual(row.invoices.map((i: any) => i.id).sort(), [old, recent].sort());
      const invoice = row.invoices.find((i: any) => i.id === old);
      assert.equal(invoice.overdue, 121);
      assert.equal(invoice.days, 40);
      assert.equal(invoice.sentLevel, 0);
      assert.equal(invoice.nextLevel, 1);
      assert.ok(invoice.code);
    });

    test('no entra lo que no se debe: borrador, futura, saldada, cancelada ni abono', async () => {
      const partnerId = await customer();
      await h.invoice('sales', [{ itemId, quantity: 1, price: 100, taxGroupId: h.tax.general }], {
        partnerId,
      });
      await overdueInvoice(partnerId, -5);
      const noteLike = await overdueInvoice(partnerId, 20);
      const paid = await overdueInvoice(partnerId, 20);
      const res = await h.api('POST', '/payments', {
        salesInvoiceId: paid,
        amount: 121,
        date: '2026-06-16',
        reference: `R-${paid}`,
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      await h.query(
        `UPDATE "SalesInvoice" SET "rectifiesInvoiceId" = '${paid}' WHERE id = '${noteLike}'`,
      );
      assert.equal(await rowOf(partnerId), undefined);
    });

    test('cuenta lo que queda tras un cobro parcial', async () => {
      const partnerId = await customer();
      const id = await overdueInvoice(partnerId, 20);
      await h.api('POST', '/payments', {
        salesInvoiceId: id,
        amount: 21,
        date: '2026-06-16',
        reference: `R-${id}`,
      });
      assert.equal((await rowOf(partnerId)).total, 100);
    });

    test('lo vencido hace poco se ve, pero aún no toca reclamarlo', async () => {
      const partnerId = await customer();
      await overdueInvoice(partnerId, 3);
      const row = await rowOf(partnerId);
      assert.equal(row.total, 121);
      assert.equal(row.claimable, 0);
      const res = await send(partnerId);
      assert.equal(res.status, 409);
      assert.equal(sent.length, 0);
    });
  });

  describe('la vista previa', () => {
    test('enseña la carta sin enviar ni apuntar nada', async () => {
      const partnerId = await customer({ name: 'Cliente Previo' });
      await overdueInvoice(partnerId, 40);
      const res = await h.api('GET', `/dunning/preview/${partnerId}`);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(res.data.level, 1);
      assert.equal(res.data.total, 121);
      assert.equal(res.data.to, `c-${partnerId}@example.com`);
      assert.match(res.data.html, /Cliente Previo/);
      assert.match(res.data.html, /121/);
      assert.ok(res.data.subject);
      assert.equal(sent.length, 0);
      const rows = await h.query(
        `SELECT id FROM "DunningLetter" WHERE "partnerId" = '${partnerId}'`,
      );
      assert.equal(rows.length, 0);
    });

    test('un nombre con HTML no se cuela en la carta', async () => {
      const partnerId = await customer({ name: '<img src=x onerror=alert(1)>' });
      await overdueInvoice(partnerId, 40);
      const res = await h.api('GET', `/dunning/preview/${partnerId}`);
      assert.doesNotMatch(res.data.html, /<img src=x/);
    });

    test('un cliente sin nada que reclamar da 409', async () => {
      const res = await h.api('GET', `/dunning/preview/${await customer()}`);
      assert.equal(res.status, 409);
    });

    test('usa el texto que escribe la empresa, con sus datos y sin dejarle meter HTML', async () => {
      await h.api('PUT', '/sales-settings', {
        dunning: {
          levels: [
            { days: 7, subject: 'Aviso a {{partner}}', body: 'Debes {{total}}.\n\n<b>Paga</b>' },
          ],
        },
      });
      const partnerId = await customer({ name: 'Cliente Texto' });
      await overdueInvoice(partnerId, 40);
      const res = await h.api('GET', `/dunning/preview/${partnerId}`);
      assert.equal(res.data.subject, 'Aviso a Cliente Texto');
      assert.match(res.data.html, /Debes [^<]*121/);
      assert.match(res.data.html, /&lt;b&gt;Paga/);
    });
  });

  describe('el envío', () => {
    test('va al correo del cliente, con cada factura adjunta, y queda apuntado', async () => {
      const partnerId = await customer();
      const a = await overdueInvoice(partnerId, 40);
      const b = await overdueInvoice(partnerId, 35);

      const res = await send(partnerId);

      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(sent.length, 1);
      assert.equal(sent[0].to, `c-${partnerId}@example.com`);
      assert.deepEqual(
        sent[0].attachments.map((x: any) => x.filename).sort(),
        [`${a}.pdf`, `${b}.pdf`].sort(),
      );
      const [letter] = await h.query(`SELECT * FROM "DunningLetter" WHERE id = '${res.data.id}'`);
      assert.equal(letter.status, 'sent');
      assert.equal(letter.level, 1);
      assert.equal(Number(letter.total), 242);
      assert.equal(letter.auto, false);
      assert.ok(letter.sentAt);
      const lines = await h.query(
        `SELECT * FROM "DunningLetterLine" WHERE "letterId" = '${res.data.id}'`,
      );
      assert.equal(lines.length, 2);
      const audit = await h.query(`SELECT id FROM "AuditLog" WHERE "entityId" = '${res.data.id}'`);
      assert.equal(audit.length, 1);
    });

    test('solo lleva lo que ya toca reclamar', async () => {
      const partnerId = await customer();
      const due = await overdueInvoice(partnerId, 40);
      await overdueInvoice(partnerId, 3);
      await send(partnerId);
      assert.deepEqual(
        sent[0].attachments.map((x: any) => x.filename),
        [`${due}.pdf`],
      );
    });

    test('sube de nivel con cada envío y se queda en el último', async () => {
      const partnerId = await customer();
      await overdueInvoice(partnerId, 90);
      const levels: number[] = [];
      for (let i = 0; i < 4; i++) {
        const res = await send(partnerId);
        assert.equal(res.status, 200, JSON.stringify(res.data));
        levels.push(res.data.level);
      }
      assert.deepEqual(levels, [1, 2, 3, 3]);
      const row = await rowOf(partnerId);
      assert.equal(row.invoices[0].sentLevel, 3);
      assert.equal(row.invoices[0].nextLevel, null);
    });

    test('cada factura lleva su propio nivel', async () => {
      const partnerId = await customer();
      const first = await overdueInvoice(partnerId, 90);
      await send(partnerId);
      const second = await overdueInvoice(partnerId, 90);
      const res = await send(partnerId);
      assert.equal(res.data.level, 2);
      const lines = await h.query(
        `SELECT "invoiceId", level FROM "DunningLetterLine" WHERE "letterId" = '${res.data.id}'`,
      );
      const levelOf = (id: string) => lines.find((l) => l.invoiceId === id).level;
      assert.equal(levelOf(first), 2);
      assert.equal(levelOf(second), 1);
    });

    test('si el correo falla, queda apuntado y no sube de nivel', async () => {
      const partnerId = await customer();
      await overdueInvoice(partnerId, 40);
      failWith = 'Conexión rechazada';

      const res = await send(partnerId);

      assert.equal(res.status, 502);
      assert.match(res.data.error, /Conexión rechazada/);
      const [letter] = await h.query(
        `SELECT * FROM "DunningLetter" WHERE "partnerId" = '${partnerId}'`,
      );
      assert.equal(letter.status, 'failed');
      assert.match(letter.error, /Conexión rechazada/);
      assert.equal((await rowOf(partnerId)).invoices[0].sentLevel, 0);

      failWith = null;
      assert.equal((await send(partnerId)).data.level, 1);
    });

    test('sin correo del cliente pide uno, y se puede indicar otro', async () => {
      const partnerId = await customer({ email: null });
      await overdueInvoice(partnerId, 40);
      assert.equal((await send(partnerId)).status, 400);
      const res = await send(partnerId, { to: 'pagos@example.com' });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(sent[0].to, 'pagos@example.com');
    });

    test('una dirección que no lo es se rechaza', async () => {
      const partnerId = await customer();
      await overdueInvoice(partnerId, 40);
      assert.equal((await send(partnerId, { to: 'no es un correo' })).status, 400);
    });

    test('con el correo sin configurar lo dice y no apunta nada', async () => {
      const partnerId = await customer();
      await overdueInvoice(partnerId, 40);
      await Mailer.writeConfig(h.db, { enabled: false });
      try {
        const res = await send(partnerId);
        assert.equal(res.status, 409);
        const rows = await h.query(
          `SELECT id FROM "DunningLetter" WHERE "partnerId" = '${partnerId}'`,
        );
        assert.equal(rows.length, 0);
      } finally {
        await Mailer.writeConfig(h.db, { enabled: true });
      }
    });

    test('de dos envíos a la vez solo sale uno', async () => {
      const partnerId = await customer();
      await overdueInvoice(partnerId, 40);
      delayMs = 200;
      const results = await Promise.all([send(partnerId), send(partnerId)]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal(sent.length, 1);
    });

    test('un envío colgado de hace rato no bloquea para siempre', async () => {
      const partnerId = await customer();
      await overdueInvoice(partnerId, 40);
      await h.query(
        `INSERT INTO "DunningLetter" (id, "partnerId", level, status, "toAddress", subject, html, "createdAt")
         VALUES ('colgado-${partnerId}', '${partnerId}', 1, 'sending', 'a@b.c', 's', 'h', NOW() - INTERVAL '1 hour')`,
      );
      const res = await send(partnerId);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const [old] = await h.query(
        `SELECT status FROM "DunningLetter" WHERE id = 'colgado-${partnerId}'`,
      );
      assert.equal(old.status, 'failed');
    });

    test('al pagarla deja de salir', async () => {
      const partnerId = await customer();
      const id = await overdueInvoice(partnerId, 40);
      await send(partnerId);
      await h.api('POST', '/payments', {
        salesInvoiceId: id,
        amount: 121,
        date: '2026-06-16',
        reference: `R-${id}`,
      });
      assert.equal(await rowOf(partnerId), undefined);
    });
  });

  test('un token de API necesita el permiso de ventas para reclamar', async () => {
    const partnerId = await customer();
    await overdueInvoice(partnerId, 40);
    const denied = await h.api('POST', `/dunning/send/${partnerId}`, {}, null, ['read:maestros']);
    assert.equal(denied.status, 403);
    assert.equal(sent.length, 0);
    const allowed = await h.api('POST', `/dunning/send/${partnerId}`, {}, null, ['write:ventas']);
    assert.equal(allowed.status, 200, JSON.stringify(allowed.data));
  });

  describe('excluir a un cliente', () => {
    test('sigue en la lista, marcado, y no se le puede reclamar', async () => {
      const partnerId = await customer();
      await overdueInvoice(partnerId, 40);
      const res = await h.api('PATCH', `/dunning/partners/${partnerId}`, { excluded: true });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal((await rowOf(partnerId)).excluded, true);
      assert.equal((await send(partnerId)).status, 409);

      await h.api('PATCH', `/dunning/partners/${partnerId}`, { excluded: false });
      assert.equal((await send(partnerId)).status, 200);
    });

    test('un interlocutor que no existe da 404', async () => {
      const res = await h.api('PATCH', '/dunning/partners/no-existe', { excluded: true });
      assert.equal(res.status, 404);
    });
  });

  describe('historial', () => {
    test('lista lo enviado de un cliente, y una carta se puede volver a ver', async () => {
      const partnerId = await customer();
      await overdueInvoice(partnerId, 40);
      const { data: letter } = await send(partnerId);

      const list = await h.api('GET', `/dunning/letters?partnerId=${partnerId}`);
      assert.equal(list.status, 200);
      assert.equal(list.data.length, 1);
      assert.equal(list.data[0].html, undefined);

      const one = await h.api('GET', `/dunning/letters/${letter.id}`);
      assert.equal(one.status, 200);
      assert.ok(one.data.html);
      assert.equal(one.data.lines.length, 1);
      assert.ok(one.data.lines[0].code);
    });
  });

  describe('ajustes', () => {
    test('de fábrica: tres niveles y el envío automático apagado', async () => {
      await h.query(`DELETE FROM "SystemConfig" WHERE key LIKE 'dunning_%'`);
      const { data } = await h.api('GET', '/sales-settings');
      assert.equal(data.dunning.autoSend, false);
      assert.deepEqual(
        data.dunning.levels.map((l: any) => l.days),
        [7, 30, 60],
      );
    });

    test('rechaza niveles desordenados, vacíos o días raros', async () => {
      for (const dunning of [
        { levels: [] },
        { levels: [{ days: 30 }, { days: 7 }] },
        { levels: [{ days: 7 }, { days: 7 }] },
        { levels: [{ days: -1 }] },
        { minDaysBetween: 0 },
      ]) {
        const res = await h.api('PUT', '/sales-settings', { dunning });
        assert.equal(res.status, 400, JSON.stringify(dunning));
      }
    });
  });

  describe('envío automático', () => {
    const run = () => runAutomaticDunning(h.tenantId, h.db);

    test('apagado, no sale nada', async () => {
      const partnerId = await customer();
      await overdueInvoice(partnerId, 40);
      await run();
      assert.equal(sent.length, 0);
    });

    const turnOn = () => h.api('PUT', '/sales-settings', { dunning: { autoSend: true } });

    test('encendido, reclama lo que toca y lo marca como automático', async () => {
      const partnerId = await customer();
      await overdueInvoice(partnerId, 40);
      await turnOn();
      await run();
      assert.equal(sent.filter((m) => m.to === `c-${partnerId}@example.com`).length, 1);
      const [letter] = await h.query(
        `SELECT auto FROM "DunningLetter" WHERE "partnerId" = '${partnerId}'`,
      );
      assert.equal(letter.auto, true);
    });

    test('no repite hasta pasar los días mínimos, aunque ya toque otro nivel', async () => {
      const partnerId = await customer();
      await overdueInvoice(partnerId, 90);
      await turnOn();
      await run();
      await run();
      const to = `c-${partnerId}@example.com`;
      assert.equal(sent.filter((m) => m.to === to).length, 1);

      await h.query(
        `UPDATE "DunningLetter" SET "sentAt" = NOW() - INTERVAL '8 days' WHERE "partnerId" = '${partnerId}'`,
      );
      await run();
      assert.equal(sent.filter((m) => m.to === to).length, 2);
    });

    test('con el último nivel enviado no insiste', async () => {
      const partnerId = await customer();
      await overdueInvoice(partnerId, 10);
      await turnOn();
      await run();
      await h.query(
        `UPDATE "DunningLetter" SET "sentAt" = NOW() - INTERVAL '30 days' WHERE "partnerId" = '${partnerId}'`,
      );
      await run();
      const to = `c-${partnerId}@example.com`;
      assert.equal(sent.filter((m) => m.to === to).length, 1);
    });

    test('se salta a los excluidos y a quien no tiene correo', async () => {
      const excluded = await customer();
      await overdueInvoice(excluded, 40);
      await h.api('PATCH', `/dunning/partners/${excluded}`, { excluded: true });
      const noEmail = await customer({ email: null });
      await overdueInvoice(noEmail, 40);
      await turnOn();
      await run();
      assert.equal(sent.filter((m) => m.to === `c-${excluded}@example.com`).length, 0);
      const rows = await h.query(`SELECT id FROM "DunningLetter" WHERE "partnerId" = '${noEmail}'`);
      assert.equal(rows.length, 0);
    });

    test('si un envío falla sigue con los demás, y avisa una sola vez al día', async () => {
      const partnerId = await customer();
      await overdueInvoice(partnerId, 40);
      const admin = await h.seedAdmin('dunning-admin');
      await turnOn();
      failWith = 'SMTP caído';
      await run();
      await run();
      const rows = await h.query(
        `SELECT id FROM "Notification" WHERE "userId" = '${admin.id}' AND title LIKE '%reclamaci%'`,
      );
      assert.equal(rows.length, 1);
    });
  });
});
