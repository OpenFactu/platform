/**
 * Lo que puede y no puede cambiar en una factura según su estado, y qué cuentan
 * los informes de rentabilidad.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startDocumentsHarness, testDatabaseUrl, type DocumentsHarness } from './documentsHarness';

describe('facturas emitidas', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;

  before(async () => {
    h = await startDocumentsHarness();
  });
  after(async () => {
    await h?.close();
  });

  for (const side of ['sales', 'purchase'] as const) {
    const docType = side === 'sales' ? 'SINV' : 'PINV';
    const table = side === 'sales' ? 'SalesInvoice' : 'PurchaseInvoice';

    test(`una factura emitida de ${side} no se cancela por ninguna ruta`, async () => {
      const itemId = await h.seedItem({ stock: 10 });
      const id = await h.invoice(side, [{ itemId, quantity: 2 }]);
      await h.post(side, id);
      const stock = await h.stockOf(itemId);
      const entry = await h.entryOf(id);

      for (const attempt of [
        () => h.api('POST', `${h.invoicePath(side)}/${id}/cancel`),
        () => h.api('DELETE', `${h.invoicePath(side)}/${id}`),
        () => h.api('POST', `/documents/${docType}/${id}/cancel`),
      ]) {
        const result = await attempt();
        assert.equal(result.status, 409, JSON.stringify(result.data));
        assert.equal(result.data.code, 'INVOICE_LOCKED');
      }

      const [header] = await h.query(`SELECT status FROM "${table}" WHERE id = '${id}'`);
      assert.equal(header.status, 'O');
      assert.deepEqual(await h.stockOf(itemId), stock);
      assert.deepEqual(await h.entryOf(id), entry);
    });

    test(`un borrador de ${side} se sigue cancelando por las mismas rutas`, async () => {
      for (const attempt of [
        (id: string) => h.api('POST', `${h.invoicePath(side)}/${id}/cancel`),
        (id: string) => h.api('DELETE', `${h.invoicePath(side)}/${id}`),
        (id: string) => h.api('POST', `/documents/${docType}/${id}/cancel`),
      ]) {
        const itemId = await h.seedItem({ stock: 10 });
        const id = await h.invoice(side, [{ itemId, quantity: 2 }]);
        const result = await attempt(id);
        assert.equal(result.status, 200, JSON.stringify(result.data));
        const [header] = await h.query(`SELECT status FROM "${table}" WHERE id = '${id}'`);
        assert.equal(header.status, 'X');
      }
    });
  }
});

describe('informes de rentabilidad', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;
  let partnerId: string;
  let itemId: string;
  /** El informe suma `lineTotal`; una línea de 100 con su impuesto. */
  let issuedNet: number;
  const projectId = 'io-informes';
  const centerId = 'cc-informes';

  before(async () => {
    h = await startDocumentsHarness();
    await h.query(
      `INSERT INTO "InternalOrder" (id, code, name) VALUES ('${projectId}', 'PROY', 'Proyecto')`,
    );
    await h.query(
      `INSERT INTO "CostCenter" (id, code, name) VALUES ('${centerId}', 'CC', 'Centro')`,
    );
    partnerId = await h.seedPartner();
    itemId = await h.seedItem({ stock: 100 });

    const line = (price: number) => ({
      itemId,
      quantity: 1,
      price,
      internalOrderId: projectId,
      costCenterId: centerId,
    });
    for (const side of ['sales', 'purchase'] as const) {
      const issued = await h.invoice(side, [line(100)], { partnerId });
      await h.post(side, issued);
      const lines = side === 'sales' ? 'SalesInvoiceLine' : 'PurchaseInvoiceLine';
      const [row] = await h.query(
        `SELECT "lineTotal", "taxAmount" FROM "${lines}" WHERE "invoiceId" = '${issued}'`,
      );
      issuedNet = Number(row.lineTotal) - Number(row.taxAmount);
      await h.invoice(side, [line(1000)], { partnerId }); // borrador
      const cancelled = await h.invoice(side, [line(10000)], { partnerId });
      await h.api('POST', `${h.invoicePath(side)}/${cancelled}/cancel`);
    }
  });
  after(async () => {
    await h?.close();
  });

  test('por cliente solo cuentan las emitidas', async () => {
    const { data } = await h.api('GET', '/reports/profit-customer');
    const row = data.find((r: any) => r.id === partnerId);
    assert.equal(row.total, 100);
    assert.equal(row.count, 1);
  });

  test('por artículo solo cuentan las emitidas', async () => {
    const { data } = await h.api('GET', '/reports/profit-item');
    const row = data.find((r: any) => r.id === itemId);
    assert.equal(row.qty, 1);
    assert.equal(row.revenue, issuedNet);
  });

  test('por proyecto solo cuentan las emitidas, también en gastos', async () => {
    const { data } = await h.api('GET', '/reports/profit-project');
    const row = data.find((r: any) => r.code === 'PROY');
    assert.equal(row.income, issuedNet);
    assert.equal(row.expense, issuedNet);
  });

  test('por centro de coste solo cuentan las emitidas, también en gastos', async () => {
    const { data } = await h.api('GET', '/reports/profit-cost-center');
    const row = data.find((r: any) => r.code === 'CC');
    assert.equal(row.income, issuedNet);
    assert.equal(row.expense, issuedNet);
  });
});
