import { and, eq, sql } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import type { LineHookContext, BatchDetailHookContext } from '../DocumentEngine';

/**
 * Validaciones de stock compartidas entre tipos de documento — cada
 * `hooks/<docType>/index.ts` compone las que le aplican en vez de duplicar
 * la lógica. Todas respetan `ctx.baseAlreadyMovedStock`: una línea cuyo
 * documento base ya movió el stock (p. ej. facturar un albarán entregado)
 * no mueve stock, así que no debe re-validarse.
 */

/**
 * Bloquea la salida si dejaría el stock global en negativo, salvo que el
 * flag `allowNegativeStock` lo permita. Para documentos con salida de stock
 * (SDN, SINV directa).
 */
export async function assertStockAvailable(ctx: LineHookContext) {
  const { flags, itemInfo, baseQty, baseAlreadyMovedStock } = ctx;
  if (baseAlreadyMovedStock) return;
  if (!flags.allowNegativeStock && Number(itemInfo.stock) < baseQty) {
    throw new Error(
      `Stock insuficiente para el artículo ${itemInfo.name}. Disponible: ${itemInfo.stock}, Requerido: ${baseQty}`,
    );
  }
}

/**
 * Auto-FIFO: si la línea no trae `batchDetails` y el flag `autoConfirmBatches`
 * está activo, auto-asigna lotes por caducidad más próxima primero, con
 * disponibilidad real del almacén de la línea cuando se conoce. Si el flag
 * está apagado, exige selección manual. Para documentos con salida de stock
 * (SDN, SINV directa) — las entradas (PDN, PINV) siempre exigen lotes
 * explícitos al recibir mercancía.
 */
export async function resolveBatchDetailsFifo(ctx: LineHookContext) {
  const { tx, flags, itemInfo, line, warehouseId, baseQty, baseAlreadyMovedStock } = ctx;

  // La línea viene de un documento que ya asignó/movió sus lotes — no
  // auto-asignamos otros distintos; si el caller no los copia, el motor
  // exigirá los explícitos con su error genérico de trazabilidad.
  if (baseAlreadyMovedStock) return undefined;

  if (!flags.autoConfirmBatches) {
    throw new Error(`El artículo ${itemInfo.name} requiere selección de lote/serie.`);
  }

  const availableBatches = warehouseId
    ? await tx
        .select({
          id: schema.itemBatches.id,
          batchNum: schema.itemBatches.batchNum,
          expiryDate: schema.itemBatches.expiryDate,
          quantity: schema.itemBatchStocks.quantity,
        })
        .from(schema.itemBatchStocks)
        .innerJoin(
          schema.itemBatches,
          and(
            eq(schema.itemBatchStocks.itemId, schema.itemBatches.itemId),
            eq(schema.itemBatchStocks.batchNum, schema.itemBatches.batchNum),
          ),
        )
        .where(
          and(
            eq(schema.itemBatchStocks.itemId, line.itemId),
            eq(schema.itemBatchStocks.warehouseId, warehouseId),
            sql`${schema.itemBatchStocks.quantity} > 0`,
          ),
        )
        .orderBy(sql`${schema.itemBatches.expiryDate} ASC NULLS LAST`)
    : await tx
        .select()
        .from(schema.itemBatches)
        .where(
          sql`${schema.itemBatches.itemId} = ${line.itemId} AND ${schema.itemBatches.quantity} > 0`,
        )
        .orderBy(sql`${schema.itemBatches.expiryDate} ASC NULLS LAST`);

  let remaining = baseQty;
  const resolved: Array<{ batchNum: string; quantity: number }> = [];
  for (const batch of availableBatches as any[]) {
    if (remaining <= 0) break;
    const take = Math.min(Number(batch.quantity), remaining);
    if (take <= 0) continue;
    resolved.push({ batchNum: batch.batchNum, quantity: take });
    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error(
      `Stock de lotes insuficiente para el artículo ${itemInfo.name}. Faltan ${remaining} unidades.`,
    );
  }

  return resolved;
}

/**
 * Exige zona (ubicación) por línea si el almacén tiene zonas definidas y el
 * flag `enforceWarehouseZones` está activo. Además de la clave nueva
 * (`flags_enforce_warehouse_zones`, ya cubierta por `ctx.flags`), esta
 * config también se guardó alguna vez sin prefijo — se comprueban ambas
 * hasta confirmar que ningún tenant depende solo de la clave legacy.
 * Para documentos con entrada de stock (PDN, PINV directa).
 */
export async function assertZoneRequired(ctx: LineHookContext) {
  const { tx, line, itemInfo, warehouseId, flags, baseAlreadyMovedStock } = ctx;
  if (baseAlreadyMovedStock) return;

  const [legacy] = await tx
    .select()
    .from(schema.systemConfigs)
    .where(eq(schema.systemConfigs.key, 'enforceWarehouseZones'));
  const enforceZones = flags.enforceWarehouseZones || legacy?.value === 'true';

  if (enforceZones && !line.zoneId && warehouseId) {
    const zones = await tx
      .select()
      .from(schema.warehouseZones)
      .where(eq(schema.warehouseZones.warehouseId, warehouseId));
    if (zones.length > 0) {
      throw new Error(
        `La configuración del almacén exige indicar una Ubicación (Zona) para el artículo ${itemInfo.name}.`,
      );
    }
  }
}

/**
 * Unicidad de serie: no se puede recibir dos veces la misma serie, ni con
 * cantidad distinta de 1. Para documentos con entrada de stock (PDN, PINV
 * directa). No necesita guard de `baseAlreadyMovedStock`: el motor solo
 * invoca `beforeBatchDetail` dentro del movimiento de stock, que ya se
 * salta para líneas con base.
 */
export async function assertSerialUniqueness(ctx: BatchDetailHookContext) {
  const { tx, itemInfo, batchDetail } = ctx;
  if (itemInfo.manageBy !== 'S') return;

  const [existingBatch] = await tx
    .select()
    .from(schema.itemBatches)
    .where(
      and(
        eq(schema.itemBatches.itemId, itemInfo.id),
        eq(schema.itemBatches.batchNum, batchDetail.batchNum),
      ),
    );
  if (existingBatch && Number(existingBatch.quantity) > 0) {
    throw new Error(
      `La serie ${batchDetail.batchNum} ya existe en stock para el artículo ${itemInfo.name}`,
    );
  }
  if (Number(batchDetail.quantity) !== 1) {
    throw new Error(
      `Un artículo gestionado por Serie solo puede tener cantidad 1 por serie. Serie: ${batchDetail.batchNum}`,
    );
  }
}
