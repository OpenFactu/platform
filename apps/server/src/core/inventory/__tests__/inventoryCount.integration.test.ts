/**
 * El recuento de punta a punta, por la API real. Lo que no puede pasar: que un recuento deje el
 * stock distinto entre artículo, almacén, zona y lote, ni que corrija dos veces.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  startDocumentsHarness,
  testDatabaseUrl,
  type DocumentsHarness,
  type HarnessUser,
} from '../../documents/__tests__/documentsHarness';

const COUNTS = '/inventory-counts';
const FULL = { read: true, write: true, delete: true };

describe('recuento de inventario', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;
  let seq = 0;
  const uid = () => `${++seq}-${crypto.randomUUID().slice(0, 6)}`;

  before(async () => {
    h = await startDocumentsHarness();
  });
  after(async () => {
    await h?.close();
  });

  const newWarehouse = async () => {
    const id = `wh-${uid()}`;
    await h.query(`INSERT INTO "Warehouse" (id, name) VALUES ('${id}', 'Almacén ${id}')`);
    return id;
  };
  const newZone = async (warehouseId: string) => {
    const id = `zn-${uid()}`;
    await h.query(
      `INSERT INTO "WarehouseZone" (id, name, "warehouseId") VALUES ('${id}', 'Zona ${id}', '${warehouseId}')`,
    );
    return id;
  };

  const receive = async (
    warehouseId: string,
    itemId: string,
    quantity: number,
    extra: Record<string, unknown> = {},
  ) => {
    const created = await h.api('POST', '/goods-receipts', {
      warehouseId,
      lines: [{ itemId, quantity, ...extra }],
    });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const posted = await h.api('POST', `/goods-receipts/${created.data.id}/post`);
    assert.equal(posted.status, 200, JSON.stringify(posted.data));
  };

  const issue = async (
    warehouseId: string,
    itemId: string,
    quantity: number,
    extra: Record<string, unknown> = {},
  ) => {
    const created = await h.api('POST', '/goods-issues', {
      warehouseId,
      lines: [{ itemId, quantity, ...extra }],
    });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const posted = await h.api('POST', `/goods-issues/${created.data.id}/post`);
    assert.equal(posted.status, 200, JSON.stringify(posted.data));
  };

  const open = async (warehouseId: string, extra: Record<string, unknown> = {}) => {
    const res = await h.api('POST', COUNTS, { warehouseId, ...extra });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data.id as string;
  };
  const detail = async (id: string, user?: HarnessUser) => {
    const res = await h.api('GET', `${COUNTS}/${id}`, undefined, user);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data;
  };
  const lineOf = async (id: string, itemId: string, key: Record<string, unknown> = {}) => {
    const { lines } = await detail(id);
    const line = lines.find(
      (row: any) =>
        row.itemId === itemId &&
        (key.zoneId === undefined || row.zoneId === key.zoneId) &&
        (key.batchNum === undefined || row.batchNum === key.batchNum),
    );
    assert.ok(line, `no hay línea de ${itemId}`);
    return line;
  };
  const count = async (id: string, lineId: string, countedQty: number | null) => {
    const res = await h.api('PATCH', `${COUNTS}/${id}/lines/${lineId}`, { countedQty });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data;
  };
  const finish = async (id: string) => {
    const res = await h.api('POST', `${COUNTS}/${id}/finish`);
    assert.equal(res.status, 200, JSON.stringify(res.data));
  };
  const close = async (id: string) => {
    await finish(id);
    const res = await h.api('POST', `${COUNTS}/${id}/close`);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data;
  };

  /** Toda la foto del stock de un artículo, y que las capas digan lo mismo. */
  const snapshot = async (itemId: string, warehouseId: string) => {
    const [item] = await h.query(`SELECT stock, "averageCost" FROM "Item" WHERE id = '${itemId}'`);
    const warehouses = await h.query(
      `SELECT "warehouseId", stock FROM "ItemWarehouseStock" WHERE "itemId" = '${itemId}'`,
    );
    const zones = await h.query(
      `SELECT "zoneId", stock FROM "ItemZoneStock" WHERE "itemId" = '${itemId}' AND "warehouseId" = '${warehouseId}'`,
    );
    const batchLocal = await h.query(
      `SELECT "batchNum", "warehouseId", quantity FROM "ItemBatchStock" WHERE "itemId" = '${itemId}'`,
    );
    const batchGlobal = await h.query(
      `SELECT "batchNum", quantity FROM "ItemBatch" WHERE "itemId" = '${itemId}'`,
    );
    const sum = (rows: any[], key: string) =>
      Math.round(rows.reduce((t, r) => t + Number(r[key]), 0) * 1e4) / 1e4;

    assert.equal(Number(item.stock), sum(warehouses, 'stock'), 'artículo frente a almacenes');
    for (const batch of batchGlobal) {
      assert.equal(
        Number(batch.quantity),
        sum(
          batchLocal.filter((row) => row.batchNum === batch.batchNum),
          'quantity',
        ),
        `lote ${batch.batchNum} frente a sus almacenes`,
      );
    }
    const here = warehouses.find((row) => row.warehouseId === warehouseId);
    return {
      global: Number(item.stock),
      warehouse: Number(here?.stock ?? 0),
      average: Number(item.averageCost),
      zones: Object.fromEntries(zones.map((row) => [row.zoneId, Number(row.stock)])),
      batches: Object.fromEntries(
        batchLocal
          .filter((row) => row.warehouseId === warehouseId)
          .map((row) => [row.batchNum, Number(row.quantity)]),
      ),
    };
  };

  describe('abrir', () => {
    test('guarda lo que hay, por artículo', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      const b = await h.seedItem();
      await receive(wh, a, 10);
      await receive(wh, b, 3);

      const id = await open(wh);
      const data = await detail(id);
      assert.equal(data.status, 'open');
      assert.match(data.code, /^REC-/);
      assert.equal(data.lines.length, 2);
      assert.equal((await lineOf(id, a)).expectedQty, 10);
      assert.equal((await lineOf(id, b)).expectedQty, 3);
      assert.equal((await lineOf(id, a)).countedQty, null);
    });

    test('con zonas, separa por zona y lo que no tiene ubicación', async () => {
      const wh = await newWarehouse();
      const z = await newZone(wh);
      const a = await h.seedItem();
      await receive(wh, a, 6, { zoneId: z });
      await receive(wh, a, 4);

      const id = await open(wh);
      assert.equal((await lineOf(id, a, { zoneId: z })).expectedQty, 6);
      assert.equal((await lineOf(id, a, { zoneId: null })).expectedQty, 4);
    });

    test('solo una zona', async () => {
      const wh = await newWarehouse();
      const z1 = await newZone(wh);
      const z2 = await newZone(wh);
      const a = await h.seedItem();
      const b = await h.seedItem();
      await receive(wh, a, 6, { zoneId: z1 });
      await receive(wh, b, 2, { zoneId: z2 });

      const { lines } = await detail(await open(wh, { zoneId: z1 }));
      assert.deepEqual(
        lines.map((line: any) => line.itemId),
        [a],
      );
    });

    test('solo una categoría, con sus subcategorías', async () => {
      const wh = await newWarehouse();
      const parent = `cat-${uid()}`;
      const child = `cat-${uid()}`;
      await h.query(`INSERT INTO "Category" (id, name) VALUES ('${parent}', 'Padre')`);
      await h.query(
        `INSERT INTO "Category" (id, name, "parentId") VALUES ('${child}', 'Hija', '${parent}')`,
      );
      const a = await h.seedItem();
      const b = await h.seedItem();
      const c = await h.seedItem();
      await h.query(`UPDATE "Item" SET "categoryId" = '${parent}' WHERE id = '${a}'`);
      await h.query(`UPDATE "Item" SET "categoryId" = '${child}' WHERE id = '${b}'`);
      await receive(wh, a, 1);
      await receive(wh, b, 1);
      await receive(wh, c, 1);

      const { lines } = await detail(await open(wh, { categoryId: parent }));
      assert.deepEqual(lines.map((line: any) => line.itemId).sort(), [a, b].sort());
    });

    test('una zona de otro almacén no vale', async () => {
      const wh = await newWarehouse();
      const other = await newWarehouse();
      const z = await newZone(other);
      const res = await h.api('POST', COUNTS, { warehouseId: wh, zoneId: z });
      assert.equal(res.status, 400);
    });

    test('un almacén que no existe no vale', async () => {
      const res = await h.api('POST', COUNTS, { warehouseId: 'no-existe' });
      assert.equal(res.status, 404);
    });

    test('dos recuentos no pueden pisarse: corregirían dos veces', async () => {
      const wh = await newWarehouse();
      const z1 = await newZone(wh);
      const z2 = await newZone(wh);
      const a = await h.seedItem();
      await receive(wh, a, 1, { zoneId: z1 });

      const first = await open(wh, { zoneId: z1 });
      assert.equal((await h.api('POST', COUNTS, { warehouseId: wh, zoneId: z1 })).status, 409);
      assert.equal((await h.api('POST', COUNTS, { warehouseId: wh })).status, 409);
      await open(wh, { zoneId: z2 });

      await h.api('POST', `${COUNTS}/${first}/cancel`);
      await open(wh, { zoneId: z1 });
    });

    test('otro almacén no estorba', async () => {
      await open(await newWarehouse());
      await open(await newWarehouse());
    });
  });

  describe('contar y cerrar', () => {
    test('lo que falta sale y lo que sobra entra, en todas las capas', async () => {
      const wh = await newWarehouse();
      const less = await h.seedItem();
      const more = await h.seedItem();
      await receive(wh, less, 10);
      await receive(wh, more, 5);

      const id = await open(wh);
      await count(id, (await lineOf(id, less)).id, 8);
      await count(id, (await lineOf(id, more)).id, 7);
      const closed = await close(id);

      assert.deepEqual([closed.adjusted, !!closed.receiptId, !!closed.issueId], [2, true, true]);
      assert.equal((await snapshot(less, wh)).warehouse, 8);
      assert.equal((await snapshot(less, wh)).global, 8);
      assert.equal((await snapshot(more, wh)).warehouse, 7);

      const [receipt] = await h.query(
        `SELECT status, type, "sourceDocType", "sourceDocId" FROM "GoodsReceipt" WHERE id = '${closed.receiptId}'`,
      );
      assert.deepEqual(receipt, {
        status: 'posted',
        type: 'adjustment',
        sourceDocType: 'InventoryCount',
        sourceDocId: id,
      });
      const [exit] = await h.query(
        `SELECT status, type, "sourceDocId" FROM "GoodsIssue" WHERE id = '${closed.issueId}'`,
      );
      assert.deepEqual(exit, { status: 'posted', type: 'adjustment', sourceDocId: id });

      const data = await detail(id);
      assert.equal(data.status, 'closed');
      assert.equal((await lineOf(id, less)).appliedQty, -2);
    });

    test('se valora al coste medio y la media no cambia', async () => {
      const wh = await newWarehouse();
      const less = await h.seedItem();
      const more = await h.seedItem();
      await receive(wh, less, 10, { unitCost: 4 });
      await receive(wh, more, 10, { unitCost: 7 });

      const id = await open(wh);
      await count(id, (await lineOf(id, less)).id, 8);
      await count(id, (await lineOf(id, more)).id, 13);
      const closed = await close(id);

      assert.equal((await snapshot(less, wh)).average, 4);
      assert.equal((await snapshot(more, wh)).average, 7);
      const [outLine] = await h.query(
        `SELECT "unitCost" FROM "GoodsIssueLine" WHERE "issueId" = '${closed.issueId}'`,
      );
      assert.equal(Number(outLine.unitCost), 4);
      const [inLine] = await h.query(
        `SELECT "unitCost" FROM "GoodsReceiptLine" WHERE "receiptId" = '${closed.receiptId}'`,
      );
      assert.equal(Number(inLine.unitCost), 7);
      const [movement] = await h.query(
        `SELECT kind FROM "ItemCostMovement" WHERE "itemId" = '${more}' AND "docId" = '${closed.receiptId}'`,
      );
      assert.equal(movement.kind, 'count');
    });

    test('sin coste conocido entra sin inventarse uno', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 1);

      const id = await open(wh);
      await count(id, (await lineOf(id, a)).id, 3);
      const closed = await close(id);

      const [line] = await h.query(
        `SELECT "unitCost" FROM "GoodsReceiptLine" WHERE "receiptId" = '${closed.receiptId}'`,
      );
      assert.equal(line.unitCost, null);
      assert.equal((await snapshot(a, wh)).average, 0);
    });

    test('lo vendido después de contar no se corrige otra vez', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);

      const id = await open(wh);
      await count(id, (await lineOf(id, a)).id, 9);
      await issue(wh, a, 4);
      await close(id);

      assert.equal((await snapshot(a, wh)).warehouse, 5);
    });

    test('lo movido antes de contar no cuenta como diferencia', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);

      const id = await open(wh);
      await issue(wh, a, 4);
      await count(id, (await lineOf(id, a)).id, 6);
      const line = await lineOf(id, a);
      assert.equal(line.expectedQty, 10);
      assert.equal(line.systemAtCount, 6);
      assert.equal(line.difference, 0);
      assert.equal(line.movedBeforeCount, -4);

      const closed = await close(id);
      assert.equal(closed.adjusted, 0);
      assert.equal((await snapshot(a, wh)).warehouse, 6);
    });

    test('la revisión enseña lo movido después de contar', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);

      const id = await open(wh);
      await count(id, (await lineOf(id, a)).id, 9);
      await issue(wh, a, 4);
      await finish(id);

      const line = await lineOf(id, a);
      assert.equal(line.difference, -1);
      assert.equal(line.movedAfterCount, -4);
      assert.equal(line.stockNow, 6);
      assert.equal(line.finalStock, 5);
    });

    test('lo que no se contó no se toca', async () => {
      const wh = await newWarehouse();
      const counted = await h.seedItem();
      const skipped = await h.seedItem();
      await receive(wh, counted, 10);
      await receive(wh, skipped, 10);

      const id = await open(wh);
      await count(id, (await lineOf(id, counted)).id, 9);
      await close(id);

      assert.equal((await snapshot(skipped, wh)).warehouse, 10);
    });

    test('contar cero se lo lleva todo', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);

      const id = await open(wh);
      await count(id, (await lineOf(id, a)).id, 0);
      await close(id);
      assert.equal((await snapshot(a, wh)).warehouse, 0);
    });

    test('borrar lo contado vuelve a dejarla sin contar', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);

      const id = await open(wh);
      const { id: lineId } = await lineOf(id, a);
      await count(id, lineId, 1);
      await count(id, lineId, null);
      const closed = await close(id);

      assert.equal(closed.adjusted, 0);
      assert.equal((await snapshot(a, wh)).warehouse, 10);
    });

    test('sin diferencias se cierra sin documentos', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);

      const id = await open(wh);
      await count(id, (await lineOf(id, a)).id, 10);
      const closed = await close(id);
      assert.equal(closed.receiptId, null);
      assert.equal(closed.issueId, null);
    });

    test('no se puede cerrar sin pasar por la revisión', async () => {
      const wh = await newWarehouse();
      const id = await open(wh);
      assert.equal((await h.api('POST', `${COUNTS}/${id}/close`)).status, 409);
    });

    test('dos cierres a la vez corrigen una sola vez', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);

      const id = await open(wh);
      await count(id, (await lineOf(id, a)).id, 8);
      await finish(id);
      const results = await Promise.all([
        h.api('POST', `${COUNTS}/${id}/close`),
        h.api('POST', `${COUNTS}/${id}/close`),
      ]);

      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await snapshot(a, wh)).warehouse, 8);
    });

    test('cerrado, ya no se puede contar ni cerrar otra vez', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);

      const id = await open(wh);
      const { id: lineId } = await lineOf(id, a);
      await count(id, lineId, 8);
      await close(id);

      const again = await h.api('PATCH', `${COUNTS}/${id}/lines/${lineId}`, { countedQty: 1 });
      assert.equal(again.status, 409);
      assert.equal((await h.api('POST', `${COUNTS}/${id}/close`)).status, 409);
      assert.equal((await h.api('POST', `${COUNTS}/${id}/cancel`)).status, 409);
      assert.equal((await h.api('POST', `${COUNTS}/${id}/reopen`)).status, 409);
    });

    test('cancelar no mueve nada y deja libre el almacén', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);

      const id = await open(wh);
      const { id: lineId } = await lineOf(id, a);
      await count(id, lineId, 2);
      await finish(id);
      assert.equal((await h.api('POST', `${COUNTS}/${id}/cancel`)).status, 200);

      assert.equal((await snapshot(a, wh)).warehouse, 10);
      assert.equal((await detail(id)).status, 'cancelled');
      assert.equal(
        (await h.api('PATCH', `${COUNTS}/${id}/lines/${lineId}`, { countedQty: 1 })).status,
        409,
      );
      await open(wh);
    });

    test('reabrir deja seguir contando, y en revisión no se cuenta', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);

      const id = await open(wh);
      const { id: lineId } = await lineOf(id, a);
      await count(id, lineId, 2);
      await finish(id);
      assert.equal(
        (await h.api('PATCH', `${COUNTS}/${id}/lines/${lineId}`, { countedQty: 3 })).status,
        409,
      );
      assert.equal((await h.api('POST', `${COUNTS}/${id}/reopen`)).status, 200);
      await count(id, lineId, 9);
      await close(id);
      assert.equal((await snapshot(a, wh)).warehouse, 9);
    });

    test('una cantidad negativa no se apunta', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);
      const id = await open(wh);
      const { id: lineId } = await lineOf(id, a);
      assert.equal(
        (await h.api('PATCH', `${COUNTS}/${id}/lines/${lineId}`, { countedQty: -1 })).status,
        400,
      );
    });

    test('una línea de otro recuento no se toca', async () => {
      const wh1 = await newWarehouse();
      const wh2 = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh1, a, 10);
      const first = await open(wh1);
      const second = await open(wh2);
      const { id: lineId } = await lineOf(first, a);
      assert.equal(
        (await h.api('PATCH', `${COUNTS}/${second}/lines/${lineId}`, { countedQty: 1 })).status,
        404,
      );
    });
  });

  describe('algo que no se esperaba', () => {
    test('se añade y entra al cerrar', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();

      const id = await open(wh);
      const added = await h.api('POST', `${COUNTS}/${id}/lines`, { itemId: a, countedQty: 4 });
      assert.equal(added.status, 200, JSON.stringify(added.data));
      assert.equal(added.data.addedDuringCount, true);
      assert.equal(added.data.countedQty, 4);

      await close(id);
      assert.equal((await snapshot(a, wh)).warehouse, 4);
    });

    test('añadirlo dos veces no da dos líneas', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      const id = await open(wh);
      const first = await h.api('POST', `${COUNTS}/${id}/lines`, { itemId: a });
      const second = await h.api('POST', `${COUNTS}/${id}/lines`, { itemId: a });
      assert.equal(first.data.id, second.data.id);
      assert.equal((await detail(id)).lines.length, 1);
    });

    test('en un recuento de zona entra en esa zona', async () => {
      const wh = await newWarehouse();
      const z = await newZone(wh);
      const a = await h.seedItem();
      const id = await open(wh, { zoneId: z });
      const added = await h.api('POST', `${COUNTS}/${id}/lines`, { itemId: a, countedQty: 2 });
      assert.equal(added.data.zoneId, z);
      await close(id);
      assert.equal((await snapshot(a, wh)).zones[z], 2);
    });

    test('un artículo fuera de la categoría no entra', async () => {
      const wh = await newWarehouse();
      const cat = `cat-${uid()}`;
      await h.query(`INSERT INTO "Category" (id, name) VALUES ('${cat}', 'Otra')`);
      const a = await h.seedItem();
      const id = await open(wh, { categoryId: cat });
      assert.equal((await h.api('POST', `${COUNTS}/${id}/lines`, { itemId: a })).status, 400);
    });

    test('un artículo que no existe no entra', async () => {
      const id = await open(await newWarehouse());
      assert.equal((await h.api('POST', `${COUNTS}/${id}/lines`, { itemId: 'nada' })).status, 404);
    });

    test('un artículo con lote pide el lote', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem({ manageBy: 'B' });
      const id = await open(wh);
      assert.equal((await h.api('POST', `${COUNTS}/${id}/lines`, { itemId: a })).status, 400);
    });

    test('se puede buscar qué añadir', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      const [{ code }] = await h.query(`SELECT code FROM "Item" WHERE id = '${a}'`);
      const id = await open(wh);
      const res = await h.api('GET', `${COUNTS}/${id}/items?q=${code}`);
      assert.equal(res.status, 200);
      assert.deepEqual(
        res.data.map((row: any) => row.id),
        [a],
      );
    });
  });

  describe('a ciegas', () => {
    const HIDDEN = [
      'expectedQty',
      'systemAtCount',
      'stockNow',
      'difference',
      'movedBeforeCount',
      'movedAfterCount',
      'finalStock',
    ];
    const assertHidden = (line: any) => {
      for (const key of HIDDEN) assert.equal(line[key], undefined, `se ve ${key}`);
    };

    test('mientras se cuenta nadie ve lo esperado, ni un administrador', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      const b = await h.seedItem();
      await receive(wh, a, 10);
      const [{ code }] = await h.query(`SELECT code FROM "Item" WHERE id = '${b}'`);

      const id = await open(wh, { blind: true });
      const { lines, summary } = await detail(id);
      assertHidden(lines[0]);
      assert.equal(summary.withDifference, undefined);

      const counted = await count(id, lines[0].id, 3);
      assertHidden(counted);
      assert.equal(counted.countedQty, 3);

      const added = await h.api('POST', `${COUNTS}/${id}/lines`, { itemId: b });
      assertHidden(added.data);
      const scanned = await h.api('POST', `${COUNTS}/${id}/scan`, { code });
      assertHidden(scanned.data.line);
    });

    test('en la revisión lo ve quien revisa', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);
      const id = await open(wh, { blind: true });
      await count(id, (await detail(id)).lines[0].id, 3);
      await finish(id);

      const reviewer = await h.seedUser(`rev-${uid()}`, {
        '/inventory/counts': FULL,
        '/inventory/count-review': FULL,
      });
      const { lines } = await detail(id, reviewer);
      assert.equal(lines[0].expectedQty, 10);
      assert.equal(lines[0].difference, -7);
    });

    test('quien solo cuenta no lo ve nunca', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);
      const id = await open(wh, { blind: true });
      await count(id, (await detail(id)).lines[0].id, 3);
      await finish(id);

      const counter = await h.seedUser(`cnt-${uid()}`, { '/inventory/counts': FULL });
      assertHidden((await detail(id, counter)).lines[0]);
      await close2(id);
      assertHidden((await detail(id, counter)).lines[0]);
    });
    const close2 = async (id: string) => {
      const res = await h.api('POST', `${COUNTS}/${id}/close`);
      assert.equal(res.status, 200, JSON.stringify(res.data));
    };

    test('sin ser a ciegas, se ve mientras se cuenta', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);
      const id = await open(wh);
      const counter = await h.seedUser(`cnt-${uid()}`, { '/inventory/counts': FULL });
      assert.equal((await detail(id, counter)).lines[0].expectedQty, 10);
    });
  });

  describe('lotes', () => {
    test('corrige el lote en todas las capas', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem({ manageBy: 'B' });
      await receive(wh, a, 7, { batchNum: 'L1' });
      await receive(wh, a, 3, { batchNum: 'L2' });

      const id = await open(wh);
      await count(id, (await lineOf(id, a, { batchNum: 'L1' })).id, 5);
      await count(id, (await lineOf(id, a, { batchNum: 'L2' })).id, 4);
      await close(id);

      const after = await snapshot(a, wh);
      assert.deepEqual(after.batches, { L1: 5, L2: 4 });
      assert.equal(after.warehouse, 9);
      assert.equal(after.global, 9);
    });

    test('un lote que aparece se añade con su número y se da de alta', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem({ manageBy: 'B' });
      const id = await open(wh);
      const added = await h.api('POST', `${COUNTS}/${id}/lines`, {
        itemId: a,
        batchNum: 'NUEVO',
        countedQty: 2,
      });
      assert.equal(added.status, 200, JSON.stringify(added.data));
      await close(id);
      assert.deepEqual((await snapshot(a, wh)).batches, { NUEVO: 2 });
    });

    test('lo que falta de un lote con zonas sale primero de lo que no tiene ubicación', async () => {
      const wh = await newWarehouse();
      const z = await newZone(wh);
      const a = await h.seedItem({ manageBy: 'B' });
      await receive(wh, a, 6, { batchNum: 'L1', zoneId: z });
      await receive(wh, a, 2, { batchNum: 'L1' });

      const id = await open(wh);
      await count(id, (await lineOf(id, a, { batchNum: 'L1' })).id, 5);
      await close(id);

      const after = await snapshot(a, wh);
      assert.equal(after.warehouse, 5);
      assert.equal(after.zones[z], 5);
      assert.deepEqual(after.batches, { L1: 5 });
    });

    test('lo que sobra va a la ubicación del artículo', async () => {
      const wh = await newWarehouse();
      const z = await newZone(wh);
      const other = await newZone(wh);
      const a = await h.seedItem({ manageBy: 'B' });
      await h.query(`UPDATE "Item" SET "defaultZoneId" = '${z}' WHERE id = '${a}'`);
      await receive(wh, a, 6, { batchNum: 'L1', zoneId: other });

      const id = await open(wh);
      await count(id, (await lineOf(id, a, { batchNum: 'L1' })).id, 8);
      await close(id);

      const after = await snapshot(a, wh);
      assert.equal(after.zones[z], 2);
      assert.equal(after.zones[other], 6);
    });

    test('una ubicación de otro almacén no se usa', async () => {
      const wh = await newWarehouse();
      const foreign = await newZone(await newWarehouse());
      const a = await h.seedItem({ manageBy: 'B' });
      await h.query(`UPDATE "Item" SET "defaultZoneId" = '${foreign}' WHERE id = '${a}'`);
      await receive(wh, a, 6, { batchNum: 'L1' });

      const id = await open(wh);
      await count(id, (await lineOf(id, a, { batchNum: 'L1' })).id, 8);
      await close(id);
      assert.deepEqual((await snapshot(a, wh)).zones, {});
    });

    test('lo que no está en ningún lote solo puede bajar', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem({ manageBy: 'B', stock: 5, warehouseId: wh });

      const id = await open(wh);
      const { id: lineId, batchNum } = await lineOf(id, a);
      assert.equal(batchNum, null);
      assert.equal(
        (await h.api('PATCH', `${COUNTS}/${id}/lines/${lineId}`, { countedQty: 6 })).status,
        400,
      );
      await count(id, lineId, 3);
      await close(id);
      assert.equal((await snapshot(a, wh)).warehouse, 3);
    });

    describe('contado por zona', () => {
      test('con varios lotes hay que decir de cuál es la diferencia', async () => {
        const wh = await newWarehouse();
        const z = await newZone(wh);
        const a = await h.seedItem({ manageBy: 'B' });
        await receive(wh, a, 5, { batchNum: 'L1', zoneId: z });
        await receive(wh, a, 5, { batchNum: 'L2', zoneId: z });

        const id = await open(wh, { zoneId: z });
        const { id: lineId } = await lineOf(id, a);
        await count(id, lineId, 8);
        await finish(id);

        const line = await lineOf(id, a);
        assert.equal(line.needsBatch, true);
        assert.deepEqual(line.batchOptions.map((row: any) => row.batchNum).sort(), ['L1', 'L2']);

        const refused = await h.api('POST', `${COUNTS}/${id}/close`);
        assert.equal(refused.status, 409);
        assert.equal(refused.data.problems[0].lineId, lineId);
        assert.equal(refused.data.problems[0].code, 'NEEDS_BATCH');
        assert.equal((await snapshot(a, wh)).warehouse, 10);

        const bad = await h.api('PUT', `${COUNTS}/${id}/lines/${lineId}/allocations`, {
          allocations: [{ batchNum: 'L1', quantity: -1 }],
        });
        assert.equal(bad.status, 400);

        const saved = await h.api('PUT', `${COUNTS}/${id}/lines/${lineId}/allocations`, {
          allocations: [
            { batchNum: 'L1', quantity: -1 },
            { batchNum: 'L2', quantity: -1 },
          ],
        });
        assert.equal(saved.status, 200, JSON.stringify(saved.data));
        assert.equal(saved.data.needsBatch, false);

        const closed = await h.api('POST', `${COUNTS}/${id}/close`);
        assert.equal(closed.status, 200, JSON.stringify(closed.data));
        const after = await snapshot(a, wh);
        assert.deepEqual(after.batches, { L1: 4, L2: 4 });
        assert.equal(after.zones[z], 8);
        assert.equal(after.warehouse, 8);
      });

      test('con un solo lote no hace falta decirlo', async () => {
        const wh = await newWarehouse();
        const z = await newZone(wh);
        const a = await h.seedItem({ manageBy: 'B' });
        await receive(wh, a, 5, { batchNum: 'L1', zoneId: z });

        const id = await open(wh, { zoneId: z });
        await count(id, (await lineOf(id, a)).id, 6);
        await close(id);
        const after = await snapshot(a, wh);
        assert.deepEqual(after.batches, { L1: 6 });
        assert.equal(after.zones[z], 6);
      });

      test('solo se reparte en revisión', async () => {
        const wh = await newWarehouse();
        const z = await newZone(wh);
        const a = await h.seedItem({ manageBy: 'B' });
        await receive(wh, a, 5, { batchNum: 'L1', zoneId: z });
        const id = await open(wh, { zoneId: z });
        const { id: lineId } = await lineOf(id, a);
        await count(id, lineId, 4);
        const res = await h.api('PUT', `${COUNTS}/${id}/lines/${lineId}/allocations`, {
          allocations: [{ batchNum: 'L1', quantity: -1 }],
        });
        assert.equal(res.status, 409);
      });
    });
  });

  describe('series', () => {
    const serial = () => `S-${uid()}`;

    test('una serie que falta sale y otra que aparece entra', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem({ manageBy: 'S' });
      const gone = serial();
      const kept = serial();
      const found = serial();
      await receive(wh, a, 1, { batchNum: gone });
      await receive(wh, a, 1, { batchNum: kept });

      const id = await open(wh);
      await count(id, (await lineOf(id, a, { batchNum: gone })).id, 0);
      await count(id, (await lineOf(id, a, { batchNum: kept })).id, 1);
      const added = await h.api('POST', `${COUNTS}/${id}/lines`, {
        itemId: a,
        batchNum: found,
        countedQty: 1,
      });
      assert.equal(added.status, 200, JSON.stringify(added.data));
      await close(id);

      const after = await snapshot(a, wh);
      assert.deepEqual(after.batches, { [gone]: 0, [kept]: 1, [found]: 1 });
      assert.equal(after.warehouse, 2);
    });

    test('una serie está o no está', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem({ manageBy: 'S' });
      const num = serial();
      await receive(wh, a, 1, { batchNum: num });
      const id = await open(wh);
      const { id: lineId } = await lineOf(id, a);
      assert.equal(
        (await h.api('PATCH', `${COUNTS}/${id}/lines/${lineId}`, { countedQty: 2 })).status,
        400,
      );
    });

    test('una serie que está en otro almacén no se da de alta aquí', async () => {
      const wh = await newWarehouse();
      const other = await newWarehouse();
      const a = await h.seedItem({ manageBy: 'S' });
      const num = serial();
      await receive(other, a, 1, { batchNum: num });

      const id = await open(wh);
      const res = await h.api('POST', `${COUNTS}/${id}/lines`, { itemId: a, batchNum: num });
      assert.equal(res.status, 409);
    });
  });

  describe('no se deja nada en negativo', () => {
    test('si ya no llega se pide contar otra vez, y entonces pasa', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);

      const id = await open(wh);
      const { id: lineId } = await lineOf(id, a);
      await count(id, lineId, 8);
      await issue(wh, a, 9);
      await finish(id);

      const refused = await h.api('POST', `${COUNTS}/${id}/close`);
      assert.equal(refused.status, 409);
      assert.equal(refused.data.problems[0].code, 'NEGATIVE');
      assert.equal(refused.data.problems[0].lineId, lineId);
      assert.equal((await snapshot(a, wh)).warehouse, 1);

      await h.api('POST', `${COUNTS}/${id}/reopen`);
      await count(id, lineId, 1);
      await close(id);
      assert.equal((await snapshot(a, wh)).warehouse, 1);
    });

    test('un negativo que ya había se arregla contando', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await issue(wh, a, 3);
      assert.equal((await snapshot(a, wh)).warehouse, -3);

      const id = await open(wh);
      const line = await lineOf(id, a);
      assert.equal(line.expectedQty, -3);
      await count(id, line.id, 2);
      await close(id);
      assert.equal((await snapshot(a, wh)).warehouse, 2);
      assert.equal((await snapshot(a, wh)).global, 2);
    });
  });

  describe('con lector', () => {
    const barcode = async (itemId: string) => {
      const code = `BC-${uid()}`;
      await h.query(`UPDATE "Item" SET barcode = '${code}' WHERE id = '${itemId}'`);
      return code;
    };
    const scan = (id: string, code: string, extra: Record<string, unknown> = {}) =>
      h.api('POST', `${COUNTS}/${id}/scan`, { code, ...extra });

    test('cada lectura suma uno', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);
      const code = await barcode(a);
      const id = await open(wh);

      const first = await scan(id, code);
      assert.equal(first.status, 200, JSON.stringify(first.data));
      assert.equal(first.data.outcome, 'counted');
      assert.equal(first.data.line.countedQty, 1);
      assert.equal((await scan(id, code)).data.line.countedQty, 2);
      assert.equal((await lineOf(id, a)).countedQty, 2);
    });

    test('dos lecturas a la vez cuentan dos', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);
      const code = await barcode(a);
      const id = await open(wh);

      await Promise.all([scan(id, code), scan(id, code), scan(id, code)]);
      assert.equal((await lineOf(id, a)).countedQty, 3);
    });

    test('también por el código interno', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);
      const [{ code }] = await h.query(`SELECT code FROM "Item" WHERE id = '${a}'`);
      const id = await open(wh);
      assert.equal((await scan(id, code)).data.outcome, 'counted');
    });

    test('un artículo que no estaba se añade', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      const code = await barcode(a);
      const id = await open(wh);
      const res = await scan(id, code);
      assert.equal(res.data.outcome, 'counted');
      assert.equal(res.data.line.addedDuringCount, true);
      assert.equal(res.data.line.countedQty, 1);
    });

    test('en varias zonas pregunta cuál', async () => {
      const wh = await newWarehouse();
      const z1 = await newZone(wh);
      const z2 = await newZone(wh);
      const a = await h.seedItem();
      await receive(wh, a, 1, { zoneId: z1 });
      await receive(wh, a, 1, { zoneId: z2 });
      const code = await barcode(a);
      const id = await open(wh);

      const res = await scan(id, code);
      assert.equal(res.data.outcome, 'choose');
      assert.equal(res.data.lines.length, 2);
      assert.equal((await detail(id)).summary.counted, 0);
    });

    test('un lote suma en el suyo', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem({ manageBy: 'B' });
      const num = `L-${uid()}`;
      await receive(wh, a, 4, { batchNum: num });
      await receive(wh, a, 4, { batchNum: `L-${uid()}` });
      const id = await open(wh);

      const res = await scan(id, num);
      assert.equal(res.data.line.batchNum, num);
      assert.equal(res.data.line.countedQty, 1);
    });

    test('una serie no suma: está', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem({ manageBy: 'S' });
      const num = `S-${uid()}`;
      await receive(wh, a, 1, { batchNum: num });
      const id = await open(wh);

      await scan(id, num);
      const res = await scan(id, num);
      assert.equal(res.data.line.countedQty, 1);
    });

    test('el artículo con lote sin decir el lote lo pide', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem({ manageBy: 'S' });
      const num = `S-${uid()}`;
      await receive(wh, a, 1, { batchNum: num });
      const code = await barcode(a);
      const id = await open(wh);

      const res = await scan(id, code);
      assert.equal(res.data.outcome, 'needs_batch');
      assert.equal(res.data.item.id, a);
    });

    test('un artículo con lote y sin línea lo pide también', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem({ manageBy: 'B' });
      const code = await barcode(a);
      const id = await open(wh);
      assert.equal((await scan(id, code)).data.outcome, 'needs_batch');
    });

    test('lo que no se conoce da 404', async () => {
      const id = await open(await newWarehouse());
      assert.equal((await scan(id, 'NO-EXISTE')).status, 404);
    });

    test('fuera de la categoría no entra', async () => {
      const wh = await newWarehouse();
      const cat = `cat-${uid()}`;
      await h.query(`INSERT INTO "Category" (id, name) VALUES ('${cat}', 'Otra')`);
      const a = await h.seedItem();
      const code = await barcode(a);
      const id = await open(wh, { categoryId: cat });
      assert.equal((await scan(id, code)).status, 400);
    });

    test('cerrado, no lee', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 1);
      const code = await barcode(a);
      const id = await open(wh);
      await close(id);
      assert.equal((await scan(id, code)).status, 409);
    });
  });

  describe('permisos y costes', () => {
    test('quien solo cuenta no reparte, no reabre y no cierra', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);
      const id = await open(wh);
      const { id: lineId } = await lineOf(id, a);
      await count(id, lineId, 8);
      await finish(id);

      const counter = await h.seedUser(`cnt-${uid()}`, { '/inventory/counts': FULL });
      for (const [method, path, body] of [
        ['POST', `${COUNTS}/${id}/close`, undefined],
        ['POST', `${COUNTS}/${id}/reopen`, undefined],
        ['PUT', `${COUNTS}/${id}/lines/${lineId}/allocations`, { allocations: [] }],
      ] as const) {
        assert.equal((await h.api(method, path, body, counter)).status, 403, path);
      }
      assert.equal((await snapshot(a, wh)).warehouse, 10);
    });

    test('el valor de la diferencia solo lo ve quien puede ver costes', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10, { unitCost: 4 });
      const id = await open(wh);
      await count(id, (await lineOf(id, a)).id, 8);
      await finish(id);

      const allowed = await h.seedUser(`cost-${uid()}`, {
        '/inventory/counts': FULL,
        '/inventory/count-review': FULL,
        '/item-costs': FULL,
      });
      const denied = await h.seedUser(`nocost-${uid()}`, {
        '/inventory/counts': FULL,
        '/inventory/count-review': FULL,
      });
      const seen = (await detail(id, allowed)).lines[0];
      assert.equal(seen.differenceValue, -8);
      assert.equal(seen.averageCost, 4);
      const hidden = (await detail(id, denied)).lines[0];
      assert.equal(hidden.difference, -2);
      assert.equal(hidden.differenceValue, undefined);
      assert.equal(hidden.averageCost, undefined);
    });

    test('abrir, cerrar y cancelar quedan en la auditoría', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      await receive(wh, a, 10);
      const closedId = await open(wh);
      await count(closedId, (await lineOf(closedId, a)).id, 8);
      await close(closedId);
      const cancelledId = await open(wh);
      await h.api('POST', `${COUNTS}/${cancelledId}/cancel`);

      const actions = async (id: string) =>
        (
          await h.query(
            `SELECT action FROM public."AuditLog" WHERE "entityType" = 'InventoryCount' AND "entityId" = '${id}'`,
          )
        ).map((row) => row.action);
      const until = Date.now() + 2000;
      while ((await actions(closedId)).length < 2 && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.deepEqual((await actions(closedId)).sort(), ['CLOSE', 'CREATE']);
      assert.ok((await actions(cancelledId)).includes('CANCEL'));
    });

    test('el listado dice cómo va cada uno', async () => {
      const wh = await newWarehouse();
      const a = await h.seedItem();
      const b = await h.seedItem();
      await receive(wh, a, 10);
      await receive(wh, b, 10);
      const id = await open(wh);
      await count(id, (await lineOf(id, a)).id, 8);

      const { data } = await h.api('GET', COUNTS);
      const row = data.find((entry: any) => entry.id === id);
      assert.equal(row.warehouseName, `Almacén ${wh}`);
      assert.equal(row.totalLines, 2);
      assert.equal(row.countedLines, 1);
    });

    test('las opciones del alta no piden otros permisos', async () => {
      const wh = await newWarehouse();
      const z = await newZone(wh);
      const res = await h.api('GET', `${COUNTS}/options`);
      assert.equal(res.status, 200);
      assert.ok(res.data.warehouses.some((row: any) => row.id === wh));
      assert.ok(res.data.zones.some((row: any) => row.id === z && row.warehouseId === wh));
      assert.ok(Array.isArray(res.data.categories));
    });
  });
});
