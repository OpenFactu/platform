/**
 * Reposición: lo que queda por debajo del mínimo y los pedidos de compra en borrador que lo cubren.
 *
 * Los pedidos nacen en borrador para que nadie compre sin mirar. El precio sale del último coste
 * de compra y, si no se conoce, queda a cero: se ve en el borrador antes de confirmarlo.
 */
import { asc, desc, eq, gt, inArray } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { FLAGS_DEFAULTS } from '../config/appConfig';
import { getConfigSection } from '../config/systemConfigSection';
import { autoSeriesFor } from '../documents/autoSeries';
import { DocumentEngine } from '../documents/DocumentEngine';
import { DocumentRegistry } from '../documents/DocumentRegistry';
import { statusError } from '../documents/documentRules';
import { committedQty, draftOrderedQty, orderedQty } from '../stock/availability';
import { defaultLineTaxGroupId } from '../tax/TaxEngine';
import { deliveryDateFor, groupBySupplier, suggestion } from './replenishmentRules';

export async function replenishmentRows(db: any) {
  const rows = await db
    .select({
      itemId: schema.items.id,
      itemCode: schema.items.code,
      itemName: schema.items.name,
      uomCode: schema.unitsOfMeasure.code,
      stock: schema.items.stock,
      minStock: schema.items.minStock,
      reorderQty: schema.items.reorderQty,
      leadTimeDays: schema.items.leadTimeDays,
      lastPurchaseCost: schema.items.lastPurchaseCost,
      supplierId: schema.items.preferredSupplierId,
      supplierName: schema.businessPartners.name,
      committed: committedQty,
      ordered: orderedQty,
      inDraft: draftOrderedQty,
    })
    .from(schema.items)
    .leftJoin(schema.unitsOfMeasure, eq(schema.items.uomId, schema.unitsOfMeasure.id))
    .leftJoin(
      schema.businessPartners,
      eq(schema.items.preferredSupplierId, schema.businessPartners.id),
    )
    .where(gt(schema.items.minStock, 0))
    .orderBy(asc(schema.items.code));

  return rows
    .map((row: any) => {
      const supply = {
        stock: Number(row.stock),
        committed: Number(row.committed),
        ordered: Number(row.ordered),
        inDraft: Number(row.inDraft),
        minStock: Number(row.minStock),
        reorderQty: Number(row.reorderQty),
      };
      return { ...row, ...supply, ...suggestion(supply) };
    })
    .filter((row: any) => row.shortfall > 0);
}

/** Con quién se puede pedir, sin pedir el permiso de interlocutores. */
export async function supplierOptions(db: any) {
  return db
    .select({ id: schema.businessPartners.id, name: schema.businessPartners.name })
    .from(schema.businessPartners)
    .orderBy(asc(schema.businessPartners.name));
}

async function defaultWarehouseId(tx: any): Promise<string | null> {
  const [warehouse] = await tx
    .select({ id: schema.warehouses.id })
    .from(schema.warehouses)
    .orderBy(desc(schema.warehouses.isDefault), asc(schema.warehouses.name))
    .limit(1);
  return warehouse?.id ?? null;
}

/** Sus direcciones como texto, igual que al elegirlo en el formulario de un pedido. */
async function defaultAddressesOf(tx: any, partnerId: string) {
  const rows = await tx
    .select()
    .from(schema.partnerAddresses)
    .where(eq(schema.partnerAddresses.partnerId, partnerId));
  const pick = (type: string) =>
    rows.find((row: any) => row.type === type && row.isDefault) ??
    rows.find((row: any) => row.type === type);
  const format = (row: any) =>
    row
      ? `${row.street || ''}\n${row.zipCode || ''} ${row.city || ''}\n${row.state ? `${row.state}\n` : ''}${row.country || ''}`.trim()
      : undefined;
  return { billToAddress: format(pick('B')), shipToAddress: format(pick('S')) };
}

export interface OrderLineInput {
  itemId?: string;
  quantity?: unknown;
  supplierId?: string | null;
}

/** Un pedido en borrador por proveedor. Todo o nada: una tanda a medias se pediría dos veces. */
export async function createDraftOrders(
  tenantId: string,
  db: any,
  user: any,
  input: { lines?: OrderLineInput[] },
): Promise<Array<{ id: string; docNum: number; supplierId: string; lines: number }>> {
  const requested = Array.isArray(input.lines) ? input.lines : [];
  if (requested.length === 0) throw statusError(400, 'Elige qué pedir.');
  for (const line of requested) {
    const quantity = Number(line.quantity);
    if (!line.itemId || !Number.isFinite(quantity) || quantity <= 0) {
      throw statusError(400, 'Cada línea necesita un artículo y una cantidad mayor que cero.');
    }
  }

  return db.transaction(async (tx: any) => {
    const flags = await getConfigSection(tx, 'flags', FLAGS_DEFAULTS);
    if (!flags.purchasesEnabled) {
      throw statusError(409, 'Las compras están desactivadas en esta empresa.');
    }

    const itemIds = [...new Set(requested.map((line) => line.itemId!))];
    const items = await tx.select().from(schema.items).where(inArray(schema.items.id, itemIds));
    const itemById = new Map<string, any>(items.map((item: any) => [item.id, item]));
    for (const itemId of itemIds) {
      if (!itemById.has(itemId)) throw statusError(404, 'Ese artículo no existe.');
    }

    const lines = requested.map((line) => {
      const item = itemById.get(line.itemId!);
      const supplierId = line.supplierId || item.preferredSupplierId;
      if (!supplierId) throw statusError(400, `${item.code}: elige a qué proveedor pedirlo.`);
      return { item, supplierId: supplierId as string, quantity: Number(line.quantity) };
    });

    const supplierIds = [...new Set(lines.map((line) => line.supplierId))];
    const suppliers = await tx
      .select({
        id: schema.businessPartners.id,
        defaultTaxGroupId: schema.businessPartners.defaultTaxGroupId,
      })
      .from(schema.businessPartners)
      .where(inArray(schema.businessPartners.id, supplierIds));
    if (suppliers.length !== supplierIds.length) {
      throw statusError(400, 'Ese proveedor no existe.');
    }
    const supplierById = new Map<string, any>(suppliers.map((row: any) => [row.id, row]));

    const date = new Date().toISOString().slice(0, 10);
    const { period, series } = await autoSeriesFor(tx, 'PO', date);
    const fallbackWarehouse = await defaultWarehouseId(tx);
    const config = DocumentRegistry.get('PO' as any);

    const created: Array<{ id: string; docNum: number; supplierId: string; lines: number }> = [];
    for (const group of groupBySupplier(lines)) {
      const warehouseOf = (item: any) => item.defaultWarehouseId || fallbackWarehouse || undefined;
      const order = await DocumentEngine.create(
        tenantId,
        tx,
        user,
        {
          tableName: config.tableName,
          schemaTable: config.schemaTable,
          lineSchemaTable: config.lineSchemaTable,
          batchSchemaTable: config.batchSchemaTable,
          eventPrefix: config.eventPrefix,
          stockAction: config.stockAction,
          closeBaseDocuments: config.closeBaseDocuments,
          initialStatus: 'D',
          hooks: config.hooks,
        },
        {
          seriesId: series.id,
          periodId: period.id,
          partnerId: group.supplierId,
          date,
          deliveryDate:
            deliveryDateFor(
              date,
              group.lines.map((line) => line.item.leadTimeDays),
            ) ?? undefined,
          warehouseId: warehouseOf(group.lines[0].item),
          ...(await defaultAddressesOf(tx, group.supplierId)),
          lines: group.lines.map((line) => ({
            itemId: line.item.id,
            quantity: line.quantity,
            price: Number(line.item.lastPurchaseCost ?? 0),
            taxGroupId:
              defaultLineTaxGroupId(supplierById.get(group.supplierId), line.item) ?? undefined,
            warehouseId: warehouseOf(line.item),
            uomId: line.item.uomId,
          })),
        } as any,
      );
      created.push({
        id: order.id,
        docNum: order.docNum,
        supplierId: group.supplierId,
        lines: group.lines.length,
      });
    }
    return created;
  });
}
