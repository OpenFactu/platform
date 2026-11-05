/**
 * Las capas del stock tienen que decir lo mismo: artículo, almacén, zona y lote. Un recuento
 * corrige lo que hay contra estas capas, así que no puede partir de que se separen solas.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  startDocumentsHarness,
  testDatabaseUrl,
  type DocumentsHarness,
} from '../../documents/__tests__/documentsHarness';

describe('capas del stock', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;

  before(async () => {
    h = await startDocumentsHarness();
  });
  after(async () => {
    await h?.close();
  });

  const batchRow = async (itemId: string, batchNum: string) => {
    const [global] = await h.query(
      `SELECT quantity FROM "ItemBatch" WHERE "itemId" = '${itemId}' AND "batchNum" = '${batchNum}'`,
    );
    const [local] = await h.query(
      `SELECT quantity FROM "ItemBatchStock" WHERE "itemId" = '${itemId}' AND "batchNum" = '${batchNum}' AND "warehouseId" = '${h.warehouseId}'`,
    );
    return { global: Number(global?.quantity ?? 0), local: Number(local?.quantity ?? 0) };
  };

  const receive = async (itemId: string, quantity: number, batchNum?: string) => {
    const created = await h.api('POST', '/goods-receipts', {
      warehouseId: h.warehouseId,
      lines: [{ itemId, quantity, batchNum }],
    });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const posted = await h.api('POST', `/goods-receipts/${created.data.id}/post`);
    assert.equal(posted.status, 200, JSON.stringify(posted.data));
  };

  const issue = async (itemId: string, quantity: number, batchNum?: string) =>
    h.api('POST', '/goods-issues', {
      warehouseId: h.warehouseId,
      lines: [{ itemId, quantity, batchNum }],
    });

  test('una salida manual con lote baja también el lote de toda la empresa', async () => {
    const itemId = await h.seedItem({ manageBy: 'B' });
    await receive(itemId, 10, 'L1');
    const created = await issue(itemId, 3, 'L1');
    assert.equal(created.status, 200, JSON.stringify(created.data));
    await h.api('POST', `/goods-issues/${created.data.id}/post`);

    assert.deepEqual(await batchRow(itemId, 'L1'), { global: 7, local: 7 });
  });

  test('una salida de un almacén sin fila deja el almacén igual que el artículo', async () => {
    const itemId = await h.seedItem();
    const created = await issue(itemId, 2);
    await h.api('POST', `/goods-issues/${created.data.id}/post`);

    const stock = await h.stockOf(itemId);
    assert.equal(stock.global, -2);
    assert.equal(stock.warehouse, -2);
  });

  test('un albarán sin fila en el almacén deja el almacén igual que el artículo', async () => {
    await h.query(
      `INSERT INTO "SystemConfig" (id, key, value) VALUES ('${crypto.randomUUID()}', 'flags_allow_negative_stock', 'true')
       ON CONFLICT (key) DO UPDATE SET value = 'true'`,
    );
    const [series] = await h.query(
      `SELECT id FROM "DocumentSeries" WHERE "periodId" = '${h.periodId}' AND "docType" = 'SDN'`,
    );
    const itemId = await h.seedItem();
    const created = await h.api('POST', '/documents/SDN', {
      seriesId: series.id,
      periodId: h.periodId,
      partnerId: await h.seedPartner(),
      date: '2026-06-15',
      warehouseId: h.warehouseId,
      lines: [{ itemId, quantity: 2, price: 10, taxGroupId: h.tax.general }],
    });
    assert.equal(created.status, 200, JSON.stringify(created.data));

    const stock = await h.stockOf(itemId);
    assert.equal(stock.global, -2);
    assert.equal(stock.warehouse, -2);
    await h.query(`DELETE FROM "SystemConfig" WHERE key = 'flags_allow_negative_stock'`);
  });

  describe('series', () => {
    const serial = () => `S-${crypto.randomUUID().slice(0, 8)}`;

    test('una serie que entró se puede sacar a mano', async () => {
      const itemId = await h.seedItem({ manageBy: 'S' });
      const num = serial();
      await receive(itemId, 1, num);

      const created = await issue(itemId, 1, num);
      assert.equal(created.status, 200, JSON.stringify(created.data));
    });

    test('una serie que entró se puede traspasar', async () => {
      const itemId = await h.seedItem({ manageBy: 'S' });
      const num = serial();
      await receive(itemId, 1, num);
      await h.query(`INSERT INTO "Warehouse" (id, name) VALUES ('wh2-${num}', 'Otro')`);

      const created = await h.api('POST', '/transfer-notes', {
        fromWarehouseId: h.warehouseId,
        toWarehouseId: `wh2-${num}`,
        lines: [{ itemId, quantity: 1, batchNum: num }],
      });
      assert.equal(created.status, 200, JSON.stringify(created.data));
    });

    test('una serie que no ha entrado no se puede sacar', async () => {
      const itemId = await h.seedItem({ manageBy: 'S' });
      const created = await issue(itemId, 1, serial());
      assert.notEqual(created.status, 200);
    });

    test('una serie en stock no se puede volver a dar de alta', async () => {
      const itemId = await h.seedItem({ manageBy: 'S' });
      const num = serial();
      await receive(itemId, 1, num);

      const again = await h.api('POST', '/goods-receipts', {
        warehouseId: h.warehouseId,
        lines: [{ itemId, quantity: 1, batchNum: num }],
      });
      assert.notEqual(again.status, 200);
    });

    test('una serie de otro artículo no se puede sacar con este', async () => {
      const owner = await h.seedItem({ manageBy: 'S' });
      const other = await h.seedItem({ manageBy: 'S' });
      const num = serial();
      await receive(owner, 1, num);

      const created = await issue(other, 1, num);
      assert.notEqual(created.status, 200);
    });

    test('las series de un artículo se pueden elegir', async () => {
      const itemId = await h.seedItem({ manageBy: 'S' });
      const num = serial();
      await receive(itemId, 1, num);

      const res = await h.api('GET', `/stock/items/${itemId}/serials`);
      assert.equal(res.status, 200);
      assert.deepEqual(
        res.data.map((row: any) => row.serialNum),
        [num],
      );
    });
  });
});
