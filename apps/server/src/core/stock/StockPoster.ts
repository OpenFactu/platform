/**
 * Aplica los efectos de stock de los documentos internos:
 *   - TransferNote  (entre almacenes y opcionalmente entre zonas)
 *   - GoodsReceipt  (entrada)
 *   - GoodsIssue    (salida)
 *
 * Mutaciones:
 *   - `itemWarehouseStocks.stock`        (agregado por almacén)
 *   - `itemZoneStocks.stock`             (agregado por almacén+zona, solo si la línea trae zoneId)
 *   - `items.stock`                      (stock global denormalizado)
 *   - `itemBatchStocks.quantity`         (lote por almacén, solo si la línea trae batchNum)
 *   - `itemBatches.quantity`             (lote global, solo si la línea trae batchNum)
 *
 * Las funciones se invocan UNA vez por transición (`draft→sent`, `→received`,
 * `→posted`). El router se encarga de no re-ejecutar sobre un doc ya posteado.
 */

import { eq, and, sql } from 'drizzle-orm';
import crypto from 'crypto';
import * as schema from '../../db/schema';

/** Upsert en itemWarehouseStocks sumando `delta`. */
async function addWarehouseStock(client: any, itemId: string, warehouseId: string, delta: number) {
  if (delta === 0) return;
  const [existing] = await client
    .select()
    .from(schema.itemWarehouseStocks)
    .where(
      and(
        eq(schema.itemWarehouseStocks.itemId, itemId),
        eq(schema.itemWarehouseStocks.warehouseId, warehouseId),
      ),
    );
  if (existing) {
    await client
      .update(schema.itemWarehouseStocks)
      .set({
        stock: sql`${schema.itemWarehouseStocks.stock} + ${delta}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.itemWarehouseStocks.itemId, itemId),
          eq(schema.itemWarehouseStocks.warehouseId, warehouseId),
        ),
      );
  } else {
    await client.insert(schema.itemWarehouseStocks).values({
      itemId,
      warehouseId,
      stock: Math.max(0, delta),
      updatedAt: new Date(),
    });
  }
}

/** Upsert en itemZoneStocks sumando `delta`. */
async function addZoneStock(
  client: any,
  itemId: string,
  warehouseId: string,
  zoneId: string,
  delta: number,
) {
  if (delta === 0) return;
  const [existing] = await client
    .select()
    .from(schema.itemZoneStocks)
    .where(
      and(
        eq(schema.itemZoneStocks.itemId, itemId),
        eq(schema.itemZoneStocks.warehouseId, warehouseId),
        eq(schema.itemZoneStocks.zoneId, zoneId),
      ),
    );
  if (existing) {
    await client
      .update(schema.itemZoneStocks)
      .set({
        stock: sql`${schema.itemZoneStocks.stock} + ${delta}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.itemZoneStocks.itemId, itemId),
          eq(schema.itemZoneStocks.warehouseId, warehouseId),
          eq(schema.itemZoneStocks.zoneId, zoneId),
        ),
      );
  } else {
    await client.insert(schema.itemZoneStocks).values({
      itemId,
      warehouseId,
      zoneId,
      stock: Math.max(0, delta),
      updatedAt: new Date(),
    });
  }
}

/** Actualiza stock global denormalizado en items.stock. */
async function bumpGlobalStock(client: any, itemId: string, delta: number) {
  if (delta === 0) return;
  await client
    .update(schema.items)
    .set({ stock: sql`COALESCE(${schema.items.stock}, 0) + ${delta}` })
    .where(eq(schema.items.id, itemId));
}

/**
 * Upsert en itemBatchStocks sumando `delta` para (itemId, batchNum, warehouseId).
 * Mantiene la ubicación ACTUAL de un lote — a diferencia de itemBatches
 * (cantidad global), esto es lo que consulta la trazabilidad por almacén.
 */
async function addBatchStock(
  client: any,
  itemId: string,
  batchNum: string,
  warehouseId: string,
  delta: number,
) {
  if (delta === 0) return;
  const [existing] = await client
    .select()
    .from(schema.itemBatchStocks)
    .where(
      and(
        eq(schema.itemBatchStocks.itemId, itemId),
        eq(schema.itemBatchStocks.batchNum, batchNum),
        eq(schema.itemBatchStocks.warehouseId, warehouseId),
      ),
    );
  if (existing) {
    await client
      .update(schema.itemBatchStocks)
      .set({
        quantity: sql`${schema.itemBatchStocks.quantity} + ${delta}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.itemBatchStocks.itemId, itemId),
          eq(schema.itemBatchStocks.batchNum, batchNum),
          eq(schema.itemBatchStocks.warehouseId, warehouseId),
        ),
      );
  } else {
    await client.insert(schema.itemBatchStocks).values({
      itemId,
      batchNum,
      warehouseId,
      quantity: Math.max(0, delta),
      updatedAt: new Date(),
    });
  }
}

/**
 * Asegura que exista un registro global en itemBatches para un lote nuevo
 * (p.ej. una entrada interna de un lote nunca visto), sumando `delta` si ya
 * existe. `StockPoster` nunca tocaba `itemBatches` — sin esto, un lote creado
 * únicamente vía traspaso/entrada/salida quedaría con fila en
 * `itemBatchStocks` pero sin fila global en `itemBatches`.
 */
async function ensureBatch(client: any, itemId: string, batchNum: string, delta: number) {
  if (delta === 0) return;
  const [existing] = await client
    .select()
    .from(schema.itemBatches)
    .where(and(eq(schema.itemBatches.itemId, itemId), eq(schema.itemBatches.batchNum, batchNum)));
  if (existing) {
    await client
      .update(schema.itemBatches)
      .set({ quantity: sql`${schema.itemBatches.quantity} + ${delta}` })
      .where(eq(schema.itemBatches.id, existing.id));
  } else if (delta > 0) {
    await client.insert(schema.itemBatches).values({
      id: crypto.randomUUID(),
      itemId,
      batchNum,
      quantity: delta,
    });
  }
}

/** Aplica un movimiento: warehouse + (opcional zone) + global. */
async function applyDelta(
  client: any,
  itemId: string,
  warehouseId: string,
  zoneId: string | null,
  delta: number,
) {
  await addWarehouseStock(client, itemId, warehouseId, delta);
  if (zoneId) await addZoneStock(client, itemId, warehouseId, zoneId, delta);
  await bumpGlobalStock(client, itemId, delta);
}

// ── Traspasos ───────────────────────────────────────────────────────────
export async function postTransferSent(client: any, transferId: string) {
  const [doc] = await client
    .select()
    .from(schema.transferNotes)
    .where(eq(schema.transferNotes.id, transferId));
  if (!doc) throw new Error('Traspaso no encontrado');
  const lines = await client
    .select()
    .from(schema.transferNoteLines)
    .where(eq(schema.transferNoteLines.transferId, transferId));
  for (const l of lines) {
    await applyDelta(
      client,
      l.itemId,
      doc.fromWarehouseId,
      l.fromZoneId || null,
      -Number(l.quantity),
    );
    if (l.batchNum) {
      await addBatchStock(client, l.itemId, l.batchNum, doc.fromWarehouseId, -Number(l.quantity));
    }
  }
}

export async function postTransferReceived(client: any, transferId: string) {
  const [doc] = await client
    .select()
    .from(schema.transferNotes)
    .where(eq(schema.transferNotes.id, transferId));
  if (!doc) throw new Error('Traspaso no encontrado');
  const lines = await client
    .select()
    .from(schema.transferNoteLines)
    .where(eq(schema.transferNoteLines.transferId, transferId));
  for (const l of lines) {
    await applyDelta(client, l.itemId, doc.toWarehouseId, l.toZoneId || null, Number(l.quantity));
    if (l.batchNum) {
      await addBatchStock(client, l.itemId, l.batchNum, doc.toWarehouseId, Number(l.quantity));
    }
  }
}

// ── Entradas ────────────────────────────────────────────────────────────
export async function postReceipt(client: any, receiptId: string) {
  const [doc] = await client
    .select()
    .from(schema.goodsReceipts)
    .where(eq(schema.goodsReceipts.id, receiptId));
  if (!doc) throw new Error('Entrada no encontrada');
  const lines = await client
    .select()
    .from(schema.goodsReceiptLines)
    .where(eq(schema.goodsReceiptLines.receiptId, receiptId));
  for (const l of lines) {
    await applyDelta(client, l.itemId, doc.warehouseId, l.zoneId || null, Number(l.quantity));
    if (l.batchNum) {
      await ensureBatch(client, l.itemId, l.batchNum, Number(l.quantity));
      await addBatchStock(client, l.itemId, l.batchNum, doc.warehouseId, Number(l.quantity));
    }
  }
}

// ── Salidas ─────────────────────────────────────────────────────────────
export async function postIssue(client: any, issueId: string) {
  const [doc] = await client
    .select()
    .from(schema.goodsIssues)
    .where(eq(schema.goodsIssues.id, issueId));
  if (!doc) throw new Error('Salida no encontrada');
  const lines = await client
    .select()
    .from(schema.goodsIssueLines)
    .where(eq(schema.goodsIssueLines.issueId, issueId));
  for (const l of lines) {
    await applyDelta(client, l.itemId, doc.warehouseId, l.zoneId || null, -Number(l.quantity));
    if (l.batchNum) {
      await addBatchStock(client, l.itemId, l.batchNum, doc.warehouseId, -Number(l.quantity));
    }
  }
}
