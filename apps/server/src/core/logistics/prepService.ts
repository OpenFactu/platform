/**
 * Preparación de pedidos (picking) y recepción de compras.
 *
 * Ciclo: albarán → envío en `picking` (o `receiving`) con una tarea por línea o
 * por lote → tareas hechas o en falta → `packed` (o `received`).
 */
import { receiptReturnsByLine } from '../documents/deliveryReturns';
import crypto from 'crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { broadcastEvent } from '../realtime/EventSocket';
import { HookManager } from '../plugins/HookManager';
import { geocodeAddress } from './geocode';
import { LogisticsError, stateOf } from './shipmentLifecycle';
import { transitionShipment, withEffects, type LogisticsContext } from './shipmentTransitions';
import { issueShipmentTokens } from './shipmentTokens';
import { applyPickingShortage } from './pickingShortage';
import { nextLogisticsCode } from './logisticsCodes';

export type PrepDocType = 'SDN' | 'PDN';

const DOC_TABLES = {
  SDN: {
    header: schema.salesDeliveryNotes,
    lines: schema.salesDeliveryNoteLines,
    batches: schema.salesDeliveryNoteLineBatches,
    orderType: 'SO',
    closedStates: ['cancelled', 'returned'],
    initialState: 'picking' as const,
    description: 'Preparación iniciada desde SDN',
  },
  PDN: {
    header: schema.purchaseDeliveryNotes,
    lines: schema.purchaseDeliveryNoteLines,
    batches: schema.purchaseDeliveryNoteLineBatches,
    orderType: 'PO',
    closedStates: ['cancelled', 'returned'],
    initialState: 'receiving' as const,
    description: 'Recepción iniciada desde PDN',
  },
};

/**
 * Una tarea por lote o serie asignado en el albarán, para que el operario sepa
 * exactamente cuál coger, o una por línea si no los lleva. `skip` deja fuera las
 * combinaciones que ya están preparadas al resincronizar.
 */
async function buildTasks(
  db: any,
  docType: PrepDocType,
  docId: string,
  shipmentId: string,
  skip: Set<string> = new Set(),
) {
  const tables = DOC_TABLES[docType];
  const lines: any[] = await db
    .select()
    .from(tables.lines)
    .where(eq(tables.lines.deliveryId, docId));
  const lineIds = lines.map((l) => l.id);
  const batchRows: any[] = lineIds.length
    ? await db.select().from(tables.batches).where(inArray(tables.batches.deliveryLineId, lineIds))
    : [];

  const rows: any[] = [];
  for (const line of lines) {
    const base = {
      docType,
      docId,
      docLineId: line.id,
      itemId: line.itemId,
      warehouseId: line.warehouseId,
      zoneId: line.zoneId,
      pickedQty: 0,
      status: 'pending',
      shipmentId,
    };
    const batches = batchRows.filter((b) => b.deliveryLineId === line.id);
    if (batches.length > 0) {
      for (const batch of batches) {
        if (skip.has(`${line.id}::${batch.batchNum}`)) continue;
        rows.push({
          ...base,
          id: crypto.randomUUID(),
          batchNumber: batch.batchNum,
          requestedQty: Number(batch.quantity),
        });
      }
    } else if (!skip.has(`${line.id}::`)) {
      rows.push({ ...base, id: crypto.randomUUID(), requestedQty: Number(line.quantity) });
    }
  }
  return rows;
}

/**
 * Dirección del envío de un albarán de venta: la del albarán o, si no lleva, la
 * de envío del cliente, la de facturación y, en último caso, su nombre.
 */
async function salesDestination(db: any, note: any): Promise<string | null> {
  if (note.shipToAddress) return note.shipToAddress;
  if (!note.partnerId) return null;
  const addresses: any[] = await db
    .select()
    .from(schema.partnerAddresses)
    .where(eq(schema.partnerAddresses.partnerId, note.partnerId));
  const best =
    addresses.find((a) => a.type === 'S' && a.isDefault) ||
    addresses.find((a) => a.type === 'S') ||
    addresses.find((a) => a.type === 'B' && a.isDefault) ||
    addresses[0];
  const text = best ? [best.street, best.zipCode, best.city].filter(Boolean).join(', ') : '';
  if (text) return text;
  const [partner] = await db
    .select({ name: schema.businessPartners.name })
    .from(schema.businessPartners)
    .where(eq(schema.businessPartners.id, note.partnerId));
  return partner?.name || null;
}

/** Punto de recepción de una compra: el del albarán o el almacén de destino. */
async function purchaseDestination(db: any, note: any): Promise<string | null> {
  if (note.shipToAddress) return note.shipToAddress;
  if (!note.warehouseId) return null;
  const [warehouse] = await db
    .select()
    .from(schema.warehouses)
    .where(eq(schema.warehouses.id, note.warehouseId));
  return warehouse ? [warehouse.name, warehouse.address].filter(Boolean).join(' — ') || null : null;
}

/**
 * Crea el envío y sus tareas desde un albarán. Si el albarán ya tiene un envío
 * vivo lo devuelve: uno entregado o recibido también cuenta, porque no se puede
 * volver a preparar desde cero lo que ya se entregó, ni recibir lo ya recibido.
 */
export async function startPreparation(ctx: LogisticsContext, docType: PrepDocType, docId: string) {
  const tables = DOC_TABLES[docType];
  const [note] = await ctx.db.select().from(tables.header).where(eq(tables.header.id, docId));
  if (!note) throw new LogisticsError('Albarán no encontrado.', 404);

  const existing: any[] = await ctx.db
    .select()
    .from(schema.shipments)
    .where(
      and(eq(schema.shipments.sourceDocType, docType), eq(schema.shipments.sourceDocId, docId)),
    );
  const alive = existing.find((s) => !tables.closedStates.includes(stateOf(s)));
  if (alive) {
    const tasks = await ctx.db
      .select()
      .from(schema.pickingTasks)
      .where(eq(schema.pickingTasks.shipmentId, alive.id));
    return { shipmentId: alive.id as string, reused: true, tasks };
  }

  // Lo que ha vuelto ya está otra vez en el almacén, y este albarán solo descuenta una vez.
  if (docType === 'SDN' && (await receiptReturnsByLine(ctx.db, docId)).size > 0) {
    throw new LogisticsError(
      'Esta mercancía ha vuelto con su entrada: para enviarla otra vez, haz un albarán nuevo.',
      409,
    );
  }

  const destinationAddress =
    docType === 'SDN'
      ? await salesDestination(ctx.db, note).catch(() => null)
      : await purchaseDestination(ctx.db, note).catch(() => null);
  // Sin coordenadas el envío sigue valiendo: la app del conductor usa el texto.
  const coords = await geocodeAddress(destinationAddress).catch(() => null);

  const shipmentId = crypto.randomUUID();
  const tokens = await issueShipmentTokens(ctx.tenantId, shipmentId);
  const tasks = await withEffects(ctx, async (tx, effects) => {
    const row = {
      id: shipmentId,
      code: await nextLogisticsCode(tx, 'ENV'),
      deliveryNoteId: docId,
      sourceDocType: docType,
      sourceDocId: docId,
      sourceOrderType: note.orderId ? tables.orderType : null,
      sourceOrderId: note.orderId || null,
      ...tokens,
      status: 'pending',
      preparationStatus: 'pending',
      destinationAddress,
      destinationLat: coords?.lat ?? null,
      destinationLng: coords?.lng ?? null,
      carrier: (docType === 'PDN' && note.carrier) || 'propio',
    };
    await tx.insert(schema.shipments).values(row);
    const taskRows = await buildTasks(tx, docType, docId, shipmentId);
    if (taskRows.length > 0) await tx.insert(schema.pickingTasks).values(taskRows);
    await transitionShipment(ctx, tx, effects, row, tables.initialState, {
      description: tables.description,
      hook: 'shipment.created',
      payload: { sourceDocType: docType, sourceDocId: docId },
    });
    effects.push(() =>
      HookManager.trigger('picking.started', {
        tenantId: ctx.tenantId,
        shipmentId,
        docType,
        docId,
      }).catch(() => {}),
    );
    return taskRows;
  });
  return { shipmentId, reused: undefined, tasks };
}

/**
 * Sustituir el lote durante el picking no es renombrar un campo: hay que devolver
 * el stock del lote original, descontarlo del nuevo y reflejarlo en el albarán.
 */
async function swapBatch(tx: any, task: any, newBatch: string) {
  const oldBatch = task.batchNumber;
  const qty = Number(task.requestedQty);
  const stockOf = (batchNum: string) =>
    and(
      eq(schema.itemBatchStocks.itemId, task.itemId),
      eq(schema.itemBatchStocks.batchNum, batchNum),
      eq(schema.itemBatchStocks.warehouseId, task.warehouseId),
    );
  const batchOf = (batchNum: string) =>
    and(eq(schema.itemBatches.itemId, task.itemId), eq(schema.itemBatches.batchNum, batchNum));

  const [stock] = await tx
    .select({ quantity: schema.itemBatchStocks.quantity })
    .from(schema.itemBatchStocks)
    .where(stockOf(newBatch));
  if (!stock || Number(stock.quantity) < qty) {
    throw new LogisticsError(
      `Stock insuficiente en el lote ${newBatch}. Disponible: ${stock?.quantity || 0}, necesario: ${qty}.`,
      400,
    );
  }

  const move = async (batchNum: string, delta: number) => {
    await tx
      .update(schema.itemBatchStocks)
      .set({
        quantity: sql`${schema.itemBatchStocks.quantity} + ${delta}`,
        updatedAt: new Date(),
      })
      .where(stockOf(batchNum));
    await tx
      .update(schema.itemBatches)
      .set({ quantity: sql`${schema.itemBatches.quantity} + ${delta}` })
      .where(batchOf(batchNum));
  };
  await move(oldBatch, qty);
  await move(newBatch, -qty);

  if (task.docLineId) {
    const batches: any = DOC_TABLES[task.docType as PrepDocType].batches;
    await tx
      .update(batches)
      .set({ batchNum: newBatch })
      .where(and(eq(batches.deliveryLineId, task.docLineId), eq(batches.batchNum, oldBatch)));
  }
}

const isTaskFinished = (status: string) => status === 'done' || status === 'missing';

/** Progreso de una tarea. Con todas terminadas, el envío pasa de etapa solo. */
export function updatePickingTask(ctx: LogisticsContext, taskId: string, body: any) {
  return withEffects(ctx, async (tx, effects) => {
    const [task] = await tx
      .select()
      .from(schema.pickingTasks)
      .where(eq(schema.pickingTasks.id, taskId))
      .for('update');
    if (!task) throw new LogisticsError('Tarea no encontrada.', 404);
    if (task.shortageQty != null) {
      throw new LogisticsError('Esta falta ya corrigió el albarán y no se puede cambiar.');
    }

    const patch: any = {};
    for (const field of ['pickedQty', 'status', 'batchNumber', 'zoneId', 'warehouseId', 'notes']) {
      if (field in body) patch[field] = body[field];
    }
    if (!('status' in body) && 'pickedQty' in body) {
      const picked = Number(body.pickedQty);
      if (picked <= 0) patch.status = 'pending';
      else if (picked < Number(task.requestedQty)) patch.status = 'partial';
      else patch.status = 'done';
    }
    if (isTaskFinished(patch.status)) {
      patch.pickedByUserId = ctx.userId || task.pickedByUserId || null;
      patch.pickedAt = new Date();
    }
    if (
      patch.batchNumber &&
      task.batchNumber &&
      patch.batchNumber !== task.batchNumber &&
      task.itemId &&
      task.warehouseId
    ) {
      await swapBatch(tx, task, patch.batchNumber);
    }
    if (patch.status === 'missing') {
      const picked = Number('pickedQty' in patch ? patch.pickedQty : task.pickedQty) || 0;
      patch.shortageQty = await applyPickingShortage(tx, task, picked);
    }
    await tx.update(schema.pickingTasks).set(patch).where(eq(schema.pickingTasks.id, taskId));

    const status = patch.status || task.status;
    effects.push(() => {
      broadcastEvent(ctx.tenantId, {
        type: 'picking.task_changed',
        payload: {
          taskId,
          shipmentId: task.shipmentId,
          status,
          pickedQty: 'pickedQty' in patch ? patch.pickedQty : task.pickedQty,
        },
      } as any);
      HookManager.trigger('picking.taskUpdated', {
        tenantId: ctx.tenantId,
        taskId,
        shipmentId: task.shipmentId,
        status,
      }).catch(() => {});
    });

    if (!task.shipmentId) return;
    const all: any[] = await tx
      .select({ status: schema.pickingTasks.status, pickedQty: schema.pickingTasks.pickedQty })
      .from(schema.pickingTasks)
      .where(eq(schema.pickingTasks.shipmentId, task.shipmentId));
    if (!all.every((t) => isTaskFinished(t.status))) return;

    const [shipment] = await tx
      .select()
      .from(schema.shipments)
      .where(eq(schema.shipments.id, task.shipmentId))
      .for('update');
    const state = shipment ? stateOf(shipment) : null;
    if (state !== 'picking' && state !== 'receiving') return;
    // Si falta todo no hay nada que enviar: que se vea, en vez de salir un paquete vacío.
    if (!all.some((t) => Number(t.pickedQty) > 0)) {
      await transitionShipment(ctx, tx, effects, shipment, 'exception', {
        description: 'No se ha encontrado nada de lo que había que preparar.',
      });
      return;
    }
    const next = state === 'receiving' ? 'received' : 'packed';
    await transitionShipment(ctx, tx, effects, shipment, next, {
      description: next === 'packed' ? 'Picking completado' : 'Recepción completada',
      set: { preparedAt: new Date(), preparedByUserId: ctx.userId },
    });
    effects.push(() =>
      HookManager.trigger('picking.completed', {
        tenantId: ctx.tenantId,
        shipmentId: shipment.id,
        result: next,
      }).catch(() => {}),
    );
  });
}

/**
 * Vuelve a sacar las tareas del albarán, por si cambió después de empezar a
 * preparar. Las que ya tienen algo hecho no se tocan.
 */
export function resyncTasks(ctx: LogisticsContext, shipmentId: string) {
  return ctx.db.transaction(async (tx: any) => {
    const [shipment] = await tx
      .select()
      .from(schema.shipments)
      .where(eq(schema.shipments.id, shipmentId));
    if (!shipment) throw new LogisticsError('Envío no encontrado.', 404);
    if (!shipment.sourceDocType || !shipment.sourceDocId) {
      throw new LogisticsError('El envío no tiene albarán origen.', 400);
    }
    const existing: any[] = await tx
      .select()
      .from(schema.pickingTasks)
      .where(eq(schema.pickingTasks.shipmentId, shipmentId));
    const preserved = existing.filter((t) => isTaskFinished(t.status) || Number(t.pickedQty) > 0);
    const keep = new Set(preserved.map((t) => t.id));
    const deletable = existing.filter((t) => !keep.has(t.id)).map((t) => t.id);
    if (deletable.length > 0) {
      await tx.delete(schema.pickingTasks).where(inArray(schema.pickingTasks.id, deletable));
    }
    const rows = await buildTasks(
      tx,
      shipment.sourceDocType,
      shipment.sourceDocId,
      shipmentId,
      new Set(preserved.map((t) => `${t.docLineId}::${t.batchNumber || ''}`)),
    );
    if (rows.length > 0) await tx.insert(schema.pickingTasks).values(rows);
    return { deleted: deletable.length, added: rows.length, preserved: preserved.length };
  });
}
