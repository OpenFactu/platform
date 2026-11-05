/**
 * Reposición y pedido en borrador, por la API real. Lo que no puede pasar: pedir de más porque se
 * cuenta lo cancelado, que un borrador se reciba, o que quede a medias una tanda de pedidos.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  startDocumentsHarness,
  testDatabaseUrl,
  type DocumentsHarness,
} from '../../documents/__tests__/documentsHarness';

const FULL = { read: true, write: true, delete: true };
const TODAY = new Date().toISOString().slice(0, 10);

describe('reposición', { skip: !testDatabaseUrl }, () => {
  let h: DocumentsHarness;
  let poSeries: string;
  let soSeries: string;
  let pdnSeries: string;

  before(async () => {
    h = await startDocumentsHarness();
    poSeries = `po-${crypto.randomUUID().slice(0, 8)}`;
    soSeries = `so-${crypto.randomUUID().slice(0, 8)}`;
    // Un periodo que cubre hoy, sea cuando sea que corra la prueba.
    const year = new Date().getFullYear();
    await h.query(
      `UPDATE "AccountingPeriod" SET "startDate" = '${year}-01-01', "endDate" = '${year}-12-31' WHERE id = '${h.periodId}'`,
    );
    await h.query(
      `INSERT INTO "DocumentSeries" (id, name, "periodId", "docType", "firstNumber", "nextNumber", "lastNumber", "isDefault") VALUES
        ('${poSeries}', 'Pedidos de compra', '${h.periodId}', 'PO', 1, 1, 9999, true),
        ('${soSeries}', 'Pedidos de venta', '${h.periodId}', 'SO', 1, 1, 9999, true)`,
    );
    const [pdn] = await h.query(
      `SELECT id FROM "DocumentSeries" WHERE "periodId" = '${h.periodId}' AND "docType" = 'PDN'`,
    );
    pdnSeries = pdn.id;
  });
  after(async () => {
    await h?.close();
  });

  /** Un artículo con mínimo y proveedor. */
  const seed = async (
    over: {
      stock?: number;
      minStock?: number;
      reorderQty?: number;
      leadTimeDays?: number | null;
      supplierId?: string | null;
      lastPurchaseCost?: number;
    } = {},
  ) => {
    const itemId = await h.seedItem({ stock: over.stock ?? 2 });
    const supplierId = over.supplierId === undefined ? await h.seedPartner() : over.supplierId;
    await h.query(
      `UPDATE "Item" SET
        "minStock" = ${over.minStock ?? 10},
        "reorderQty" = ${over.reorderQty ?? 0},
        "leadTimeDays" = ${over.leadTimeDays ?? 'NULL'},
        "preferredSupplierId" = ${supplierId ? `'${supplierId}'` : 'NULL'},
        "lastPurchaseCost" = ${over.lastPurchaseCost ?? 'NULL'}
       WHERE id = '${itemId}'`,
    );
    return { itemId, supplierId };
  };

  const rowOf = async (itemId: string) => {
    const res = await h.api('GET', '/replenishment');
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data.find((row: any) => row.itemId === itemId);
  };

  const salesOrder = async (
    itemId: string,
    quantity: number,
    extra: Record<string, unknown> = {},
  ) => {
    const res = await h.api('POST', '/documents/SO', {
      seriesId: soSeries,
      periodId: h.periodId,
      partnerId: await h.seedPartner(),
      date: TODAY,
      warehouseId: h.warehouseId,
      lines: [{ itemId, quantity, price: 10, taxGroupId: h.tax.general, ...extra }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data.id as string;
  };

  const purchaseOrder = async (
    itemId: string,
    quantity: number,
    extra: Record<string, unknown> = {},
  ) => {
    const res = await h.api('POST', '/purchases/orders', {
      seriesId: poSeries,
      periodId: h.periodId,
      partnerId: await h.seedPartner(),
      date: TODAY,
      warehouseId: h.warehouseId,
      lines: [{ itemId, quantity, price: 10, taxGroupId: h.tax.general, ...extra }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data.id as string;
  };

  const generate = async (lines: Array<Record<string, unknown>>) => {
    const res = await h.api('POST', '/replenishment/orders', { lines });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data.orders as Array<{ id: string; docNum: number; supplierId: string }>;
  };

  describe('qué queda por debajo', () => {
    test('sale lo que está bajo el mínimo, con lo que falta', async () => {
      const { itemId, supplierId } = await seed({ leadTimeDays: 5 });
      const row = await rowOf(itemId);
      assert.equal(row.stock, 2);
      assert.equal(row.minStock, 10);
      assert.equal(row.projected, 2);
      assert.equal(row.suggested, 8);
      assert.equal(row.supplierId, supplierId);
      assert.ok(row.supplierName);
      assert.equal(row.leadTimeDays, 5);
    });

    test('no sale lo que llega al mínimo ni lo que no tiene', async () => {
      const enough = await seed({ stock: 10 });
      const noMinimum = await seed({ minStock: 0 });
      assert.equal(await rowOf(enough.itemId), undefined);
      assert.equal(await rowOf(noMinimum.itemId), undefined);
    });

    test('lo comprometido de un pedido abierto resta', async () => {
      const { itemId } = await seed({ stock: 12 });
      assert.equal(await rowOf(itemId), undefined);
      await salesOrder(itemId, 5);
      const row = await rowOf(itemId);
      assert.equal(row.committed, 5);
      assert.equal(row.projected, 7);
      assert.equal(row.suggested, 3);
    });

    test('lo pedido a un proveedor suma', async () => {
      const { itemId } = await seed();
      await purchaseOrder(itemId, 3);
      const row = await rowOf(itemId);
      assert.equal(row.ordered, 3);
      assert.equal(row.projected, 5);
      assert.equal(row.suggested, 5);
    });

    test('un pedido cancelado no cuenta', async () => {
      const { itemId } = await seed();
      const sale = await salesOrder(itemId, 4);
      const purchase = await purchaseOrder(itemId, 3);
      await h.query(`UPDATE "SalesOrder" SET status = 'X' WHERE id = '${sale}'`);
      await h.query(`UPDATE "PurchaseOrder" SET status = 'X' WHERE id = '${purchase}'`);
      const row = await rowOf(itemId);
      assert.equal(row.committed, 0);
      assert.equal(row.ordered, 0);
    });

    test('un pedido cerrado tampoco, aunque quede algo por servir', async () => {
      const { itemId } = await seed();
      const sale = await salesOrder(itemId, 4);
      const purchase = await purchaseOrder(itemId, 3);
      await h.query(`UPDATE "SalesOrder" SET status = 'C' WHERE id = '${sale}'`);
      await h.query(`UPDATE "PurchaseOrder" SET status = 'C' WHERE id = '${purchase}'`);
      const row = await rowOf(itemId);
      assert.equal(row.committed, 0);
      assert.equal(row.ordered, 0);
    });

    test('solo cuenta lo que queda por servir o recibir', async () => {
      const { itemId } = await seed();
      const sale = await salesOrder(itemId, 4);
      const purchase = await purchaseOrder(itemId, 6);
      await h.query(`UPDATE "SalesOrderLine" SET "deliveredQty" = 1 WHERE "orderId" = '${sale}'`);
      await h.query(
        `UPDATE "PurchaseOrderLine" SET "receivedQty" = 2 WHERE "orderId" = '${purchase}'`,
      );
      const row = await rowOf(itemId);
      assert.equal(row.committed, 3);
      assert.equal(row.ordered, 4);
    });

    test('se cuenta en la unidad del artículo', async () => {
      const { itemId } = await seed({ minStock: 100, stock: 100 });
      const purchase = await purchaseOrder(itemId, 2);
      const sale = await salesOrder(itemId, 3);
      await h.query(
        `UPDATE "PurchaseOrderLine" SET "uomFactor" = 12 WHERE "orderId" = '${purchase}'`,
      );
      await h.query(`UPDATE "SalesOrderLine" SET "uomFactor" = 12 WHERE "orderId" = '${sale}'`);
      const row = await rowOf(itemId);
      assert.equal(row.committed, 36);
      assert.equal(row.ordered, 24);
    });

    test('servido de más no da comprometido negativo', async () => {
      const { itemId } = await seed();
      const sale = await salesOrder(itemId, 1);
      await h.query(`UPDATE "SalesOrderLine" SET "deliveredQty" = 5 WHERE "orderId" = '${sale}'`);
      assert.equal((await rowOf(itemId)).committed, 0);
    });

    test('el listado de artículos cuenta igual', async () => {
      const { itemId } = await seed();
      const sale = await salesOrder(itemId, 4);
      await salesOrder(itemId, 2);
      await purchaseOrder(itemId, 3);
      await h.query(`UPDATE "SalesOrder" SET status = 'X' WHERE id = '${sale}'`);
      const { data } = await h.api('GET', '/items');
      const row = data.find((item: any) => item.id === itemId);
      assert.equal(Number(row.committed), 2);
      assert.equal(Number(row.ordered), 3);
    });
  });

  describe('crear pedidos', () => {
    test('uno por proveedor, en borrador y con sus líneas', async () => {
      const first = await seed({ lastPurchaseCost: 7 });
      const second = await seed({ supplierId: first.supplierId, lastPurchaseCost: 3 });
      const third = await seed();

      const orders = await generate([
        { itemId: first.itemId, quantity: 8 },
        { itemId: second.itemId, quantity: 5 },
        { itemId: third.itemId, quantity: 1 },
      ]);

      assert.equal(orders.length, 2);
      const own = orders.find((order) => order.supplierId === first.supplierId)!;
      const [header] = await h.query(
        `SELECT o.status, o."partnerId", s."docType" FROM "PurchaseOrder" o
         JOIN "DocumentSeries" s ON s.id = o."seriesId" WHERE o.id = '${own.id}'`,
      );
      assert.equal(header.status, 'D');
      assert.equal(header.partnerId, first.supplierId);
      assert.equal(header.docType, 'PO');

      const lines = await h.query(
        `SELECT "itemId", quantity, price FROM "PurchaseOrderLine" WHERE "orderId" = '${own.id}' ORDER BY "lineNum"`,
      );
      assert.deepEqual(
        lines.map((line) => [line.itemId, Number(line.quantity), Number(line.price)]),
        [
          [first.itemId, 8, 7],
          [second.itemId, 5, 3],
        ],
      );
    });

    test('se puede cambiar de proveedor al generar', async () => {
      const { itemId } = await seed();
      const other = await h.seedPartner();
      const [order] = await generate([{ itemId, quantity: 1, supplierId: other }]);
      assert.equal(order.supplierId, other);
    });

    test('sin coste conocido el precio queda a cero, y el borrador lo enseña', async () => {
      const { itemId } = await seed();
      const [order] = await generate([{ itemId, quantity: 1 }]);
      const [line] = await h.query(
        `SELECT price FROM "PurchaseOrderLine" WHERE "orderId" = '${order.id}'`,
      );
      assert.equal(Number(line.price), 0);
    });

    test('la fecha de entrega sale del mayor plazo', async () => {
      const first = await seed({ leadTimeDays: 3 });
      const second = await seed({ supplierId: first.supplierId, leadTimeDays: 10 });
      const [order] = await generate([
        { itemId: first.itemId, quantity: 1 },
        { itemId: second.itemId, quantity: 1 },
      ]);
      const [header] = await h.query(
        `SELECT "deliveryDate"::date::text AS date FROM "PurchaseOrder" WHERE id = '${order.id}'`,
      );
      const expected = new Date(`${TODAY}T00:00:00Z`);
      expected.setUTCDate(expected.getUTCDate() + 10);
      assert.equal(header.date, expected.toISOString().slice(0, 10));
    });

    test('el impuesto sale como en cualquier pedido', async () => {
      const { itemId, supplierId } = await seed({ lastPurchaseCost: 10 });
      await h.query(
        `UPDATE "BusinessPartner" SET "defaultTaxGroupId" = '${h.tax.reduced}' WHERE id = '${supplierId}'`,
      );
      const [order] = await generate([{ itemId, quantity: 1 }]);
      const [line] = await h.query(
        `SELECT "taxGroupId", "taxRate" FROM "PurchaseOrderLine" WHERE "orderId" = '${order.id}'`,
      );
      assert.equal(line.taxGroupId, h.tax.reduced);
      assert.equal(Number(line.taxRate), 10);
    });

    test('el almacén sale del artículo y, si no, el predeterminado', async () => {
      const own = await seed();
      await h.query(
        `UPDATE "Item" SET "defaultWarehouseId" = '${h.warehouseId}' WHERE id = '${own.itemId}'`,
      );
      const [order] = await generate([{ itemId: own.itemId, quantity: 1 }]);
      const [line] = await h.query(
        `SELECT "warehouseId" FROM "PurchaseOrderLine" WHERE "orderId" = '${order.id}'`,
      );
      assert.equal(line.warehouseId, h.warehouseId);
    });

    test('sin proveedor no se crea nada, tampoco de los demás', async () => {
      const good = await seed();
      const bad = await seed({ supplierId: null });
      const before = await h.query(`SELECT COUNT(*)::int AS n FROM "PurchaseOrder"`);

      const res = await h.api('POST', '/replenishment/orders', {
        lines: [
          { itemId: good.itemId, quantity: 1 },
          { itemId: bad.itemId, quantity: 1 },
        ],
      });
      assert.equal(res.status, 400);
      const after = await h.query(`SELECT COUNT(*)::int AS n FROM "PurchaseOrder"`);
      assert.equal(after[0].n, before[0].n);
    });

    test('una cantidad que no vale no crea nada', async () => {
      const { itemId } = await seed();
      for (const quantity of [0, -1, 'x']) {
        const res = await h.api('POST', '/replenishment/orders', {
          lines: [{ itemId, quantity }],
        });
        assert.equal(res.status, 400, String(quantity));
      }
    });

    test('sin líneas no hay nada que crear', async () => {
      assert.equal((await h.api('POST', '/replenishment/orders', { lines: [] })).status, 400);
    });

    test('un artículo que no existe no pasa', async () => {
      const res = await h.api('POST', '/replenishment/orders', {
        lines: [{ itemId: 'nada', quantity: 1 }],
      });
      assert.equal(res.status, 404);
    });

    test('un proveedor que no existe no pasa', async () => {
      const { itemId } = await seed();
      const res = await h.api('POST', '/replenishment/orders', {
        lines: [{ itemId, quantity: 1, supplierId: 'nadie' }],
      });
      assert.equal(res.status, 400);
    });

    test('un borrador ya no se propone otra vez', async () => {
      const { itemId } = await seed();
      assert.equal((await rowOf(itemId)).suggested, 8);
      await generate([{ itemId, quantity: 8 }]);
      const row = await rowOf(itemId);
      assert.equal(row.inDraft, 8);
      assert.equal(row.ordered, 0);
      assert.equal(row.suggested, 0);
    });

    test('sin serie para pedidos dice qué falta y no crea nada', async () => {
      await h.query(`UPDATE "DocumentSeries" SET "docType" = 'XX' WHERE "docType" = 'PO'`);
      try {
        const { itemId } = await seed();
        const res = await h.api('POST', '/replenishment/orders', {
          lines: [{ itemId, quantity: 1 }],
        });
        assert.equal(res.status, 409);
      } finally {
        await h.query(`UPDATE "DocumentSeries" SET "docType" = 'PO' WHERE "docType" = 'XX'`);
      }
    });

    test('lleva las direcciones del proveedor, como el formulario', async () => {
      const { itemId, supplierId } = await seed();
      await h.query(
        `INSERT INTO "PartnerAddress" (id, "partnerId", type, name, street, city, "zipCode", country, "isDefault") VALUES
          ('${crypto.randomUUID()}', '${supplierId}', 'B', 'Otra', 'Calle Vieja 1', 'Lugo', '27001', 'España', false),
          ('${crypto.randomUUID()}', '${supplierId}', 'B', 'Sede', 'Calle Mayor 2', 'Soria', '42001', 'España', true),
          ('${crypto.randomUUID()}', '${supplierId}', 'S', 'Nave', 'Polígono 3', 'Ávila', '05001', 'España', false)`,
      );
      const [order] = await generate([{ itemId, quantity: 1 }]);
      const [header] = await h.query(
        `SELECT "billToAddress", "shipToAddress" FROM "PurchaseOrder" WHERE id = '${order.id}'`,
      );
      assert.equal(header.billToAddress, 'Calle Mayor 2\n42001 Soria\nEspaña');
      assert.equal(header.shipToAddress, 'Polígono 3\n05001 Ávila\nEspaña');
    });

    test('la entrega prevista de un pedido normal también se guarda', async () => {
      const { itemId } = await seed();
      const id = await purchaseOrder(itemId, 1, {});
      const res = await h.api('POST', '/purchases/orders', {
        seriesId: poSeries,
        periodId: h.periodId,
        partnerId: await h.seedPartner(),
        date: TODAY,
        deliveryDate: TODAY,
        warehouseId: h.warehouseId,
        lines: [{ itemId, quantity: 1, price: 10, taxGroupId: h.tax.general }],
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const [withDate] = await h.query(
        `SELECT "deliveryDate" FROM "PurchaseOrder" WHERE id = '${res.data.id}'`,
      );
      assert.ok(withDate.deliveryDate);
      const [without] = await h.query(
        `SELECT "deliveryDate" FROM "PurchaseOrder" WHERE id = '${id}'`,
      );
      assert.equal(without.deliveryDate, null);
    });
  });

  describe('el pedido en borrador', () => {
    const draft = async (quantity = 2) => {
      const { itemId, supplierId } = await seed({ lastPurchaseCost: 5 });
      const [order] = await generate([{ itemId, quantity }]);
      return { itemId, supplierId, id: order.id };
    };

    const receiveFrom = (orderId: string, itemId: string, supplierId: string, quantity = 1) =>
      h.api('POST', '/documents/PDN', {
        seriesId: pdnSeries,
        periodId: h.periodId,
        partnerId: supplierId,
        date: TODAY,
        warehouseId: h.warehouseId,
        orderId,
        lines: [
          {
            itemId,
            quantity,
            price: 5,
            taxGroupId: h.tax.general,
            baseType: 'PO',
            baseId: orderId,
            baseLine: 1,
          },
        ],
      });

    test('no se puede recibir hasta confirmarlo', async () => {
      const { id, itemId, supplierId } = await draft();
      const refused = await receiveFrom(id, itemId, supplierId);
      assert.equal(refused.status, 409, JSON.stringify(refused.data));

      const confirmed = await h.api('POST', `/purchases/orders/${id}/confirm`);
      assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
      const received = await receiveFrom(id, itemId, supplierId);
      assert.equal(received.status, 200, JSON.stringify(received.data));
    });

    test('confirmado cuenta como pedido', async () => {
      const { id, itemId } = await draft(2);
      await h.api('POST', `/purchases/orders/${id}/confirm`);
      const row = await rowOf(itemId);
      assert.equal(row.ordered, 2);
      assert.equal(row.inDraft, 0);
    });

    test('no se confirma dos veces ni uno que no sea borrador', async () => {
      const { id } = await draft();
      await h.api('POST', `/purchases/orders/${id}/confirm`);
      assert.equal((await h.api('POST', `/purchases/orders/${id}/confirm`)).status, 409);
      assert.equal((await h.api('POST', `/purchases/orders/no-existe/confirm`)).status, 404);
    });

    test('dos confirmaciones a la vez pasan una', async () => {
      const { id } = await draft();
      const results = await Promise.all([
        h.api('POST', `/purchases/orders/${id}/confirm`),
        h.api('POST', `/purchases/orders/${id}/confirm`),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    });

    test('se puede cancelar', async () => {
      const { id, itemId } = await draft();
      const res = await h.api('POST', `/purchases/orders/${id}/cancel`, {
        reason: 'No hace falta',
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const row = await rowOf(itemId);
      assert.equal(row.inDraft, 0);
      assert.equal(row.suggested, 8);
    });

    test('se puede editar, y uno confirmado no', async () => {
      const { id, itemId, supplierId } = await draft();
      const body = {
        partnerId: supplierId,
        date: TODAY,
        warehouseId: h.warehouseId,
        lines: [{ itemId, quantity: 9, price: 6, taxGroupId: h.tax.general }],
      };
      const edited = await h.api('PUT', `/purchases/orders/${id}`, body);
      assert.equal(edited.status, 200, JSON.stringify(edited.data));
      const [line] = await h.query(
        `SELECT quantity, price FROM "PurchaseOrderLine" WHERE "orderId" = '${id}'`,
      );
      assert.equal(Number(line.quantity), 9);
      assert.equal(Number(line.price), 6);
      const [header] = await h.query(`SELECT status FROM "PurchaseOrder" WHERE id = '${id}'`);
      assert.equal(header.status, 'D');

      await h.api('POST', `/purchases/orders/${id}/confirm`);
      const refused = await h.api('PUT', `/purchases/orders/${id}`, body);
      assert.equal(refused.status, 409);
    });

    test('el estado a mano no se salta el borrador', async () => {
      const { id } = await draft();
      const res = await h.api('PATCH', `/purchases/orders/${id}/status`, { status: 'C' });
      assert.equal(res.status, 409);
    });

    test('un pedido normal sigue naciendo abierto', async () => {
      const { itemId } = await seed();
      const id = await purchaseOrder(itemId, 1);
      const [header] = await h.query(`SELECT status FROM "PurchaseOrder" WHERE id = '${id}'`);
      assert.equal(header.status, 'O');
    });
  });

  describe('permisos', () => {
    test('generar pide también crear pedidos de compra', async () => {
      const { itemId } = await seed();
      const noOrders = await h.seedUser(`rep-${crypto.randomUUID().slice(0, 6)}`, {
        '/inventory/replenishment': FULL,
      });
      const withOrders = await h.seedUser(`rep-${crypto.randomUUID().slice(0, 6)}`, {
        '/inventory/replenishment': FULL,
        '/purchase-orders': FULL,
      });
      const body = { lines: [{ itemId, quantity: 1 }] };
      assert.equal((await h.api('POST', '/replenishment/orders', body, noOrders)).status, 403);
      assert.equal((await h.api('POST', '/replenishment/orders', body, withOrders)).status, 200);
    });

    test('con las compras apagadas no se crean pedidos', async () => {
      const { itemId } = await seed();
      await h.query(
        `INSERT INTO "SystemConfig" (id, key, value) VALUES ('${crypto.randomUUID()}', 'flags_purchases_enabled', 'false')`,
      );
      try {
        const res = await h.api('POST', '/replenishment/orders', {
          lines: [{ itemId, quantity: 1 }],
        });
        assert.equal(res.status, 409);
      } finally {
        await h.query(`DELETE FROM "SystemConfig" WHERE key = 'flags_purchases_enabled'`);
      }
    });

    test('el último coste solo lo ve quien puede', async () => {
      const { itemId } = await seed({ lastPurchaseCost: 7 });
      const denied = await h.seedUser(`nocost-${crypto.randomUUID().slice(0, 6)}`, {
        '/inventory/replenishment': FULL,
      });
      const res = await h.api('GET', '/replenishment', undefined, denied);
      const row = res.data.find((entry: any) => entry.itemId === itemId);
      assert.equal(row.lastPurchaseCost, undefined);
      assert.equal(Number((await rowOf(itemId)).lastPurchaseCost), 7);
    });

    test('generar queda en la auditoría', async () => {
      const { itemId } = await seed();
      const [order] = await generate([{ itemId, quantity: 1 }]);
      const actions = async () =>
        h.query(`SELECT action FROM public."AuditLog" WHERE "entityId" = '${order.id}'`);
      const until = Date.now() + 2000;
      while ((await actions()).length === 0 && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal((await actions())[0]?.action, 'CREATE');
    });
  });
});
