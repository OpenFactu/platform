/**
 * Lo que se puede hacer con un envío. Cada acción es una transacción: o queda
 * todo hecho (estado, paradas, paquetes, documentos) o no queda nada.
 *
 * El estado solo cambia por aquí. Editar un envío (`updateShipmentData`) toca sus
 * datos, nunca su estado.
 */
import crypto from 'crypto';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { broadcastEvent } from '../realtime/EventSocket';
import { dispatchEvent } from '../webhooks/WebhookQueue';
import { invoiceOfNote } from '../documents/deliveryReturns';
import { applyBaseOrderFulfillment } from '../documents/baseOrderFulfillment';
import { DocumentEngine } from '../documents/DocumentEngine';
import {
  LIVE_STOP_STATES,
  LogisticsError,
  isClosedState,
  resumeStateAfterIncident,
  stateOf,
} from './shipmentLifecycle';
import {
  transitionShipment,
  withEffects,
  type Effect,
  type LogisticsContext,
} from './shipmentTransitions';
import {
  closeLiveStops,
  loadRoute,
  loadShipment,
  placeShipmentOnRoute,
  routeWarnings,
} from './routeActions';
import { issueShipmentTokens, removeShipmentTokens } from './shipmentTokens';
import { createReturnReceipt, returnWarehouseOf } from './returnReceipts';
import { nextLogisticsCode, shipmentLabel } from './logisticsCodes';
import { documentDefinition } from './pickingShortage';
import { isValidTime } from './fleetPlanning';

const EDITABLE_FIELDS = [
  'carrier',
  'trackingNumber',
  'driverName',
  'driverPhone',
  'vehiclePlate',
  'destinationAddress',
  'destinationLat',
  'destinationLng',
  'recipientName',
  'recipientEmail',
  'recipientPhone',
  'kind',
  'returnWarehouseId',
  'estimatedDelivery',
  'timeWindowFrom',
  'timeWindowTo',
  'notes',
];

function assertTimeWindow(body: any) {
  for (const field of ['timeWindowFrom', 'timeWindowTo']) {
    if (body[field] && !isValidTime(body[field])) {
      throw new LogisticsError('La franja horaria tiene que ser HH:mm.', 400);
    }
  }
}

export async function createShipment(ctx: LogisticsContext, body: any) {
  assertTimeWindow(body);
  const id = crypto.randomUUID();
  const tokens = await issueShipmentTokens(ctx.tenantId, id);
  await ctx.db.insert(schema.shipments).values({
    id,
    ...tokens,
    code: await nextLogisticsCode(ctx.db, 'ENV'),
    deliveryNoteId: body.deliveryNoteId || null,
    carrier: body.carrier || 'propio',
    trackingNumber: body.trackingNumber || null,
    status: 'pending',
    preparationStatus: 'pending',
    driverName: body.driverName || null,
    driverPhone: body.driverPhone || null,
    vehiclePlate: body.vehiclePlate || null,
    destinationAddress: body.destinationAddress || null,
    destinationLat: body.destinationLat ?? null,
    destinationLng: body.destinationLng ?? null,
    recipientName: body.recipientName || null,
    recipientEmail: body.recipientEmail || null,
    recipientPhone: body.recipientPhone || null,
    kind: body.kind === 'pickup_return' ? 'pickup_return' : 'delivery',
    returnWarehouseId: body.returnWarehouseId || null,
    estimatedDelivery: body.estimatedDelivery ? new Date(body.estimatedDelivery) : null,
    timeWindowFrom: body.timeWindowFrom || null,
    timeWindowTo: body.timeWindowTo || null,
    notes: body.notes || null,
  });
  return { id, ...tokens };
}

export async function updateShipmentData(ctx: LogisticsContext, id: string, body: any) {
  assertTimeWindow(body);
  const shipment = await loadShipment(ctx.db, id);
  // Un formulario puede mandar el estado tal cual lo leyó: eso no es cambiarlo.
  if ('status' in body && body.status !== shipment.status && body.status !== stateOf(shipment)) {
    throw new LogisticsError(
      'El estado de un envío no se edita: usa la acción que corresponda (despachar, entregar, aplazar…).',
      400,
    );
  }
  const patch: any = { updatedAt: new Date() };
  for (const field of EDITABLE_FIELDS) {
    if (field in body) patch[field] = body[field];
  }
  if (patch.estimatedDelivery) patch.estimatedDelivery = new Date(patch.estimatedDelivery);
  await ctx.db.update(schema.shipments).set(patch).where(eq(schema.shipments.id, id));
  broadcastEvent(ctx.tenantId, {
    type: 'shipment.updated',
    payload: { id, status: shipment.status },
  } as any);
}

export function markReady(ctx: LogisticsContext, id: string) {
  return withEffects(ctx, async (tx, effects) => {
    const shipment = await loadShipment(tx, id, true);
    await transitionShipment(ctx, tx, effects, shipment, 'ready', {
      description: 'Listo para despachar',
    });
  });
}

/** Despachar: a una ruta (primer intento o reintento) o sin ella, si lo lleva un transportista. */
export function dispatchShipment(ctx: LogisticsContext, id: string, routeId?: string | null) {
  return withEffects(ctx, async (tx, effects) => {
    const shipment = await loadShipment(tx, id, true);
    if (routeId) {
      const route = await loadRoute(tx, routeId, true);
      await placeShipmentOnRoute(ctx, tx, effects, shipment, route);
      return { warnings: await routeWarnings(tx, routeId) };
    }
    await transitionShipment(ctx, tx, effects, shipment, 'dispatched', {
      description: shipment.kind === 'pickup_return' ? 'Recogida asignada' : 'Despachado',
    });
    return { warnings: [] };
  });
}

export function receiveShipment(ctx: LogisticsContext, id: string) {
  return withEffects(ctx, async (tx, effects) => {
    const shipment = await loadShipment(tx, id, true);
    await transitionShipment(ctx, tx, effects, shipment, 'received', {
      description: 'Recepción confirmada',
    });
  });
}

/** Entregar desde la oficina: el mismo final que en la parada, sin prueba de entrega. */
export function deliverShipment(ctx: LogisticsContext, id: string) {
  return withEffects(ctx, async (tx, effects) => {
    const shipment = await loadShipment(tx, id, true);
    await transitionShipment(ctx, tx, effects, shipment, 'delivered', {
      description: shipment.kind === 'pickup_return' ? 'Recogido' : 'Entregado',
    });
    await closeLiveStops(ctx, tx, effects, id, 'delivered', 'Marcado como entregado en la oficina');
  });
}

export function postponeShipment(ctx: LogisticsContext, id: string, reason: string | null) {
  return withEffects(ctx, async (tx, effects) => {
    const shipment = await loadShipment(tx, id, true);
    await transitionShipment(ctx, tx, effects, shipment, 'postponed', { description: reason });
    await closeLiveStops(ctx, tx, effects, id, 'postponed', reason);
  });
}

/** Una incidencia desde la oficina no cierra la parada: el conductor puede seguir yendo. */
export function reportIncident(ctx: LogisticsContext, id: string, reason: string) {
  return withEffects(ctx, async (tx, effects) => {
    const shipment = await loadShipment(tx, id, true);
    await transitionShipment(ctx, tx, effects, shipment, 'exception', { description: reason });
  });
}

/** Resuelta la incidencia, el envío vuelve a donde le toca según su parada. */
export function resolveIncident(ctx: LogisticsContext, id: string) {
  return withEffects(ctx, async (tx, effects) => {
    const shipment = await loadShipment(tx, id, true);
    if (stateOf(shipment) !== 'exception') {
      throw new LogisticsError('Este envío no tiene ninguna incidencia abierta.');
    }
    const [stop] = await tx
      .select({ status: schema.routeStops.status, routeId: schema.routeStops.routeId })
      .from(schema.routeStops)
      .where(
        and(
          eq(schema.routeStops.shipmentId, id),
          inArray(schema.routeStops.status, LIVE_STOP_STATES as string[]),
        ),
      );
    const route = stop ? await loadRoute(tx, stop.routeId) : null;
    await transitionShipment(
      ctx,
      tx,
      effects,
      shipment,
      resumeStateAfterIncident(stop?.status ?? null, route?.status ?? null),
      { description: 'Incidencia resuelta' },
    );
  });
}

async function cancelOpenTasks(tx: any, shipmentId: string) {
  await tx
    .update(schema.pickingTasks)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(schema.pickingTasks.shipmentId, shipmentId),
        inArray(schema.pickingTasks.status, ['pending', 'partial']),
      ),
    );
}

/** Cancelar el envío de un albarán que se está anulando, dentro de su misma transacción. */
export async function cancelLinkedShipment(
  ctx: LogisticsContext,
  tx: any,
  effects: Effect[],
  shipment: any,
  description: string,
  payload?: Record<string, unknown>,
) {
  if (isClosedState(stateOf(shipment))) return;
  await transitionShipment(ctx, tx, effects, shipment, 'cancelled', { description, payload });
  await cancelOpenTasks(tx, shipment.id);
  await closeLiveStops(ctx, tx, effects, shipment.id, 'cancelled', description);
}

/**
 * Anular el albarán de un envío que no llegó a salir: la mercancía sigue en el
 * almacén, así que el motor de documentos devuelve el stock. Uno ya facturado no
 * se anula: eso se arregla con una factura rectificativa.
 */
async function cancelDeliveryNote(ctx: LogisticsContext, tx: any, shipment: any) {
  const def = documentDefinition(shipment.sourceDocType === 'PDN' ? 'PDN' : 'SDN');
  const [note] = await tx
    .select({ status: def.schemaTable.status })
    .from(def.schemaTable)
    .where(eq(def.schemaTable.id, shipment.deliveryNoteId));
  if (!note) return { cancelled: false, hint: 'El albarán origen ya no existe.' };
  if (note.status === 'X') return { cancelled: false, hint: 'El albarán ya estaba cancelado.' };
  if (note.status === 'C') {
    return {
      cancelled: false,
      hint: 'El albarán ya está facturado — no se anula. Emite una factura rectificativa para revertir la operación.',
    };
  }
  await DocumentEngine.cancel(tx, ctx.tenantId, { id: ctx.userId }, def, shipment.deliveryNoteId);
  return { cancelled: true, hint: null };
}

export function cancelShipment(
  ctx: LogisticsContext,
  id: string,
  input: { reason?: string | null; cancelDeliveryNote?: boolean },
) {
  return withEffects(ctx, async (tx, effects) => {
    const shipment = await loadShipment(tx, id, true);
    const state = stateOf(shipment);
    if (state === 'delivered') throw new LogisticsError('Envío ya entregado — usa devolución');
    if (state === 'cancelled') return { deliveryNoteCancelled: false, hint: null };
    if (isClosedState(state)) throw new LogisticsError('Este envío ya está cerrado.');

    const reason = input.reason || null;
    const payload: Record<string, unknown> = { deliveryNoteCancelled: false };
    await cancelLinkedShipment(
      ctx,
      tx,
      effects,
      shipment,
      reason ? `Envío cancelado — ${reason}` : 'Envío cancelado',
      payload,
    );
    if (!input.cancelDeliveryNote || !shipment.deliveryNoteId) {
      return { deliveryNoteCancelled: false, hint: null };
    }
    const result = await cancelDeliveryNote(ctx, tx, shipment);
    payload.deliveryNoteCancelled = result.cancelled;
    return { deliveryNoteCancelled: result.cancelled, hint: result.hint };
  });
}

/**
 * Anular el albarán de una devolución definitiva. Aquí no se revierte stock: la
 * mercancía salió de verdad y vuelve con la recepción de devolución. Lo que sí se
 * revierte es lo servido del pedido, que queda abierto para decidir qué hacer.
 */
async function voidNoteOnReturn(
  ctx: LogisticsContext,
  tx: any,
  shipment: any,
  reason: string | null,
) {
  const table: any = schema.salesDeliveryNotes;
  const lineTable: any = schema.salesDeliveryNoteLines;
  const [note] = await tx.select().from(table).where(eq(table.id, shipment.deliveryNoteId));
  if (!note) return { cancelled: false, hint: 'El albarán origen ya no existe.' };
  if (note.status === 'X') return { cancelled: false, hint: 'El albarán ya estaba cancelado.' };
  if (note.status === 'C') {
    return {
      cancelled: false,
      hint: 'El albarán ya está facturado — no se anula. Emite una factura rectificativa para revertir la operación.',
    };
  }
  const lines = await tx
    .select()
    .from(lineTable)
    .where(eq(lineTable.deliveryId, shipment.deliveryNoteId));
  await tx
    .update(table)
    .set({
      status: 'X',
      cancelledAt: new Date(),
      cancelledBy: ctx.userId,
      cancelReason: reason,
    })
    .where(eq(table.id, shipment.deliveryNoteId));
  await applyBaseOrderFulfillment(tx, {
    orderLineTable: schema.salesOrderLines,
    orderHeaderTable: schema.salesOrders,
    qtyField: 'deliveredQty',
    orderId: note.orderId,
    lines,
    sign: -1,
  });
  return { cancelled: true, hint: null };
}

/**
 * Devolución de lo que ya salió: el envío queda devuelto y su mercancía vuelve en
 * una recepción en borrador, con las líneas del albarán, que el operario revisa.
 */
export function returnShipment(
  ctx: LogisticsContext,
  id: string,
  input: { reason?: string | null; warehouseId?: string | null; cancelDeliveryNote?: boolean },
) {
  return withEffects(ctx, async (tx, effects) => {
    const shipment = await loadShipment(tx, id, true);
    const reason = input.reason || null;
    const payload: Record<string, unknown> = {};
    await transitionShipment(ctx, tx, effects, shipment, 'returned', {
      description: reason,
      payload,
    });
    await cancelOpenTasks(tx, id);
    await closeLiveStops(
      ctx,
      tx,
      effects,
      id,
      'cancelled',
      reason ? `Envío devuelto — ${reason}` : 'Envío devuelto',
    );

    const warehouseId = await returnWarehouseOf(tx, shipment, input.warehouseId);
    const code = shipmentLabel(shipment);
    const receiptId = warehouseId
      ? await createReturnReceipt(tx, {
          warehouseId,
          notes: `Devolución del envío ${code}${reason ? ` — ${reason}` : ''}`,
          userId: ctx.userId,
          shipment,
        })
      : null;

    let deliveryNoteCancelled = false;
    let deliveryNoteHint: string | null = null;
    const isSale = shipment.sourceDocType !== 'PDN';
    if (input.cancelDeliveryNote && shipment.deliveryNoteId) {
      // La venta vuelve con la entrada; la compra entró con el albarán, y anularlo la saca.
      const result = isSale
        ? await voidNoteOnReturn(ctx, tx, shipment, reason)
        : await cancelDeliveryNote(ctx, tx, shipment);
      deliveryNoteCancelled = result.cancelled;
      deliveryNoteHint = result.hint;
    }
    Object.assign(payload, { receiptId, deliveryNoteCancelled });
    const fromNote = isSale && !!shipment.deliveryNoteId;
    return {
      receiptId,
      deliveryNoteCancelled,
      deliveryNoteHint,
      isPurchase: !isSale,
      // Sin entrada, con almacén y con albarán: ya había vuelto todo por otro camino.
      alreadyReturned: fromNote && !!warehouseId && !receiptId,
      invoice: fromNote ? await invoiceOfNote(tx, shipment.deliveryNoteId) : null,
    };
  });
}

/**
 * Programar una recogida en casa del cliente (producto dañado, contenido
 * incorrecto): un envío nuevo al mismo destino, que se planifica en rutas como
 * cualquier otro. Al hacerla, la mercancía vuelve con su recepción en borrador.
 */
export async function schedulePickup(
  ctx: LogisticsContext,
  id: string,
  input: { reason?: string | null; warehouseId?: string | null },
) {
  const shipment = await loadShipment(ctx.db, id);
  if (shipment.kind === 'pickup_return') {
    throw new LogisticsError('Este envío ya es una recogida', 400);
  }
  if (shipment.deliveryNoteId) {
    const [existing] = await ctx.db
      .select({ id: schema.shipments.id, code: schema.shipments.code })
      .from(schema.shipments)
      .where(
        and(
          eq(schema.shipments.deliveryNoteId, shipment.deliveryNoteId),
          eq(schema.shipments.kind, 'pickup_return'),
          notInArray(schema.shipments.status, ['delivered', 'returned', 'cancelled']),
        ),
      );
    if (existing) {
      throw new LogisticsError(
        `Ya existe una recogida en curso para este albarán (${existing.code || existing.id.slice(0, 8)}).`,
        409,
        { pickupId: existing.id },
      );
    }
  }
  const warehouseId = await returnWarehouseOf(ctx.db, shipment, input.warehouseId);
  if (!warehouseId) {
    throw new LogisticsError('Indica el almacén de retorno: no se pudo deducir del albarán.', 400);
  }

  const pickupId = crypto.randomUUID();
  const tokens = await issueShipmentTokens(ctx.tenantId, pickupId);
  const reason = input.reason ? ` — ${input.reason}` : '';
  const originCode = shipmentLabel(shipment);
  const code = await ctx.db.transaction(async (tx: any) => {
    const pickupCode = await nextLogisticsCode(tx, 'REC');
    await tx.insert(schema.shipments).values({
      id: pickupId,
      ...tokens,
      code: pickupCode,
      deliveryNoteId: shipment.deliveryNoteId || null,
      sourceDocType: shipment.sourceDocType || null,
      carrier: 'propio',
      status: 'pending',
      preparationStatus: 'pending',
      destinationAddress: shipment.destinationAddress,
      destinationLat: shipment.destinationLat,
      destinationLng: shipment.destinationLng,
      recipientName: shipment.recipientName,
      recipientEmail: shipment.recipientEmail,
      recipientPhone: shipment.recipientPhone,
      kind: 'pickup_return',
      returnWarehouseId: warehouseId,
      notes: `Recogida del envío ${originCode}${reason}`,
    });
    await tx.insert(schema.shipmentEvents).values([
      {
        id: crypto.randomUUID(),
        shipmentId: shipment.id,
        kind: 'note',
        description: `Recogida programada (${pickupCode})${reason}`,
      },
      {
        id: crypto.randomUUID(),
        shipmentId: pickupId,
        kind: 'note',
        description: `Creada desde el envío ${originCode}`,
      },
    ]);
    return pickupCode;
  });

  broadcastEvent(ctx.tenantId, {
    type: 'shipment.updated',
    payload: { id: shipment.id },
  } as any);
  dispatchEvent(ctx.tenantId, 'shipment.pickup_scheduled', {
    id: pickupId,
    code,
    fromShipmentId: shipment.id,
    reason: input.reason || null,
  }).catch(() => {});
  return { id: pickupId, code, reportToken: tokens.reportToken };
}

/**
 * Lo que tiene historia no se borra, se archiva: un envío terminado deja de salir
 * en los listados y conserva sus eventos, sus paradas y su enlace de seguimiento.
 * Uno en marcha hay que cancelarlo antes. Solo se borra de verdad un envío recién
 * creado con el que aún no ha pasado nada.
 */
export async function deleteShipment(ctx: LogisticsContext, id: string) {
  const shipment = await loadShipment(ctx.db, id);
  if (isClosedState(stateOf(shipment))) {
    await ctx.db
      .update(schema.shipments)
      .set({ archivedAt: shipment.archivedAt || new Date() })
      .where(eq(schema.shipments.id, id));
    return { archived: true };
  }
  const used = async (table: any) =>
    (await ctx.db.select({ id: table.id }).from(table).where(eq(table.shipmentId, id)).limit(1))
      .length > 0;
  const inUse =
    (await used(schema.shipmentEvents)) ||
    (await used(schema.routeStops)) ||
    (await used(schema.pickingTasks)) ||
    (await used(schema.packages));
  if (inUse) throw new LogisticsError('Este envío está en marcha. Cancélalo antes.');

  await ctx.db.delete(schema.shipments).where(eq(schema.shipments.id, id));
  await removeShipmentTokens(ctx.tenantId, id);
  return { archived: false };
}

/**
 * Mover un envío a un acopio. Si aún no tiene paquetes, crea uno con lo preparado:
 * es el momento en que el picking se convierte en una caja física.
 */
export function moveToStaging(ctx: LogisticsContext, id: string, stagingAreaId: string | null) {
  return withEffects(ctx, async (tx, effects) => {
    const shipment = await loadShipment(tx, id, true);
    const existing = await tx
      .select({ id: schema.packages.id })
      .from(schema.packages)
      .where(eq(schema.packages.shipmentId, id));

    let packagesCreated = 0;
    let packagesAffected = existing.length;
    if (existing.length > 0) {
      await tx
        .update(schema.packages)
        .set({ stagingAreaId })
        .where(eq(schema.packages.shipmentId, id));
    } else {
      const tasks = await tx
        .select()
        .from(schema.pickingTasks)
        .where(eq(schema.pickingTasks.shipmentId, id));
      // Lo que se ha encontrado, aunque la tarea acabara en falta.
      const done = tasks.filter((t: any) => Number(t.pickedQty) > 0);
      if (done.length === 0) {
        throw new LogisticsError(
          'El envío no tiene paquetes ni tareas completadas para materializar.',
          400,
        );
      }
      const packageId = crypto.randomUUID();
      const now = new Date();
      await tx.insert(schema.packages).values({
        id: packageId,
        code: await nextLogisticsCode(tx, 'PK'),
        deliveryNoteId: shipment.deliveryNoteId || null,
        shipmentId: id,
        stagingAreaId,
        status: 'sealed',
        pickedAt: now,
        pickedByUserId: ctx.userId,
        sealedAt: now,
      });
      await tx.insert(schema.packageLines).values(
        done.map((t: any) => ({
          id: crypto.randomUUID(),
          packageId,
          itemId: t.itemId,
          quantity: Number(t.pickedQty),
          sourceLineId: t.docLineId || null,
        })),
      );
      packagesCreated = 1;
      packagesAffected = 1;
    }

    if (stateOf(shipment) === 'packed') {
      await transitionShipment(ctx, tx, effects, shipment, 'ready', {
        description: `Movido a acopio (${packagesAffected} paquete${packagesAffected === 1 ? '' : 's'})`,
      });
    }
    return { packagesAffected, packagesCreated };
  });
}
