/**
 * Coste del artículo: precio medio ponderado en toda la empresa, en moneda base.
 *
 * Una entrada recalcula la media; una salida se lleva la media que hubiera en ese
 * momento, guardada en su línea, y ya no cambia aunque luego cambie la media. Las
 * cantidades y costes van siempre en la unidad base del artículo.
 */
import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';

export type CostMovementKind =
  | 'opening'
  /** Compra: albarán o factura directa. */
  | 'purchase'
  /** Entrada manual con coste. */
  | 'receipt'
  /** Devolución de un cliente: vuelve al coste con el que salió. */
  | 'sales_return'
  /** Devolución al proveedor: sale al coste con el que entró. */
  | 'purchase_return'
  /** Se cancela una salida, o faltó mercancía al prepararla: vuelve a su coste. */
  | 'undo_exit'
  /** Se cancela una entrada. */
  | 'undo_entry';

export interface CostMovement {
  itemId: string;
  kind: CostMovementKind;
  quantity: number;
  unitCost: number;
  docType?: string | null;
  docId?: string | null;
  lineId?: string | null;
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/** La media tras una entrada. Sin stock del que partir, el coste es el de la entrada. */
export function averageAfterEntry(
  stock: number,
  average: number,
  quantity: number,
  unitCost: number,
): number {
  if (stock <= 0) return round6(unitCost);
  return round6((stock * average + quantity * unitCost) / (stock + quantity));
}

/** La media tras deshacer una entrada. Sin stock que quede, se deja la que había. */
export function averageAfterUndo(
  stock: number,
  average: number,
  quantity: number,
  unitCost: number,
): number {
  const remaining = stock - quantity;
  if (remaining <= 0) return round6(average);
  return round6(Math.max(0, (stock * average - quantity * unitCost) / remaining));
}

/** Coste unitario de una compra, sin impuesto, en moneda base y por unidad base. */
export function purchaseUnitCost(net: number, baseQuantity: number, exchangeRate = 1): number {
  if (!baseQuantity) return 0;
  return round6((net / baseQuantity) * (exchangeRate || 1));
}

async function lockedItem(tx: any, itemId: string) {
  const [item] = await tx
    .select({ stock: schema.items.stock, averageCost: schema.items.averageCost })
    .from(schema.items)
    .where(eq(schema.items.id, itemId))
    .for('update');
  return { stock: Number(item?.stock ?? 0), average: Number(item?.averageCost ?? 0) };
}

async function saveAverage(
  tx: any,
  movement: CostMovement,
  before: { stock: number; average: number },
  after: number,
) {
  await tx
    .update(schema.items)
    .set({
      averageCost: String(after),
      ...(movement.kind === 'purchase' && movement.unitCost > 0
        ? { lastPurchaseCost: String(movement.unitCost) }
        : {}),
    })
    .where(eq(schema.items.id, movement.itemId));
  await tx.insert(schema.itemCostMovements).values({
    id: crypto.randomUUID(),
    itemId: movement.itemId,
    kind: movement.kind,
    quantity: String(movement.quantity),
    unitCost: String(movement.unitCost),
    stockBefore: String(before.stock),
    costBefore: String(before.average),
    costAfter: String(after),
    docType: movement.docType ?? null,
    docId: movement.docId ?? null,
    lineId: movement.lineId ?? null,
  });
}

/** Entra mercancía. Se llama antes de sumarla al stock, en la misma transacción. */
export async function recordCostEntry(tx: any, movement: CostMovement): Promise<void> {
  const before = await lockedItem(tx, movement.itemId);
  const after = averageAfterEntry(
    before.stock,
    before.average,
    movement.quantity,
    movement.unitCost,
  );
  await saveAverage(tx, movement, before, after);
}

/** Sale mercancía que había entrado a ese coste. Antes de restarla del stock. */
export async function recordCostUndo(tx: any, movement: CostMovement): Promise<void> {
  const before = await lockedItem(tx, movement.itemId);
  const after = averageAfterUndo(
    before.stock,
    before.average,
    movement.quantity,
    movement.unitCost,
  );
  await saveAverage(tx, movement, before, after);
}

/** El cambio de una moneda a la base: cuánta moneda base vale una unidad suya. */
export async function exchangeRateOf(tx: any, currencyId?: string | null): Promise<number> {
  if (!currencyId) return 1;
  const [currency] = await tx
    .select({ rate: schema.currencies.exchangeRate, isBase: schema.currencies.isBase })
    .from(schema.currencies)
    .where(
      sql`${schema.currencies.id} = ${currencyId} OR ${schema.currencies.code} = ${currencyId}`,
    )
    .limit(1);
  if (!currency || currency.isBase) return 1;
  return Number(currency.rate) || 1;
}
