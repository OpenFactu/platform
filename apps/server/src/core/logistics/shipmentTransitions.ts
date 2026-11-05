/**
 * Cómo cambia de estado un envío. Todas las acciones pasan por aquí.
 *
 * El cambio va dentro de la transacción de quien lo pide: estado, evento y
 * paquetes se confirman o se deshacen juntos. Lo que sale hacia fuera (avisos en
 * pantalla, correo, webhooks, plugins) se apunta como efecto y corre después de
 * confirmar: un cliente no puede recibir "entregado" de algo que se ha deshecho.
 */
import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { broadcastEvent } from '../realtime/EventSocket';
import { HookManager } from '../plugins/HookManager';
import { dispatchEvent } from '../webhooks/WebhookQueue';
import { notifyShipmentStageChange, type ShipmentStage } from './shipmentNotifications';
import {
  assertTransition,
  packageStatusAfter,
  stateOf,
  type ShipmentState,
} from './shipmentLifecycle';
import { createReturnReceipt } from './returnReceipts';

export interface LogisticsContext {
  /** Cliente de la empresa. */
  db: any;
  tenantId: string;
  userId: string | null;
  /** Base de los enlaces de los correos. */
  baseUrl: string;
}

export type Effect = () => unknown;

const NOTIFY_STAGES: readonly string[] = [
  'pending',
  'picking',
  'packed',
  'ready',
  'dispatched',
  'in_transit',
  'out_for_delivery',
  'postponed',
  'delivered',
  'exception',
  'returned',
  'cancelled',
];

export function isNotifiableStage(stage: string): stage is ShipmentStage {
  return NOTIFY_STAGES.includes(stage);
}

/** Corre `work` en una transacción y, ya confirmada, sus efectos. */
export async function withEffects<T>(
  ctx: LogisticsContext,
  work: (tx: any, effects: Effect[]) => Promise<T>,
): Promise<T> {
  const effects: Effect[] = [];
  const result = await ctx.db.transaction((tx: any) => work(tx, effects));
  await runEffects(effects);
  return result;
}

export async function runEffects(effects: Effect[]): Promise<void> {
  for (const run of effects) {
    try {
      await run();
    } catch (e: any) {
      console.warn('[logistics] efecto tras confirmar:', e?.message);
    }
  }
}

export interface TransitionOptions {
  /** Texto del evento: lo ve el cliente en su seguimiento. */
  description?: string | null;
  /** Hook de plugins, si no es `shipment.<estado>`. */
  hook?: string;
  /** Datos extra para el hook y el webhook. */
  payload?: Record<string, unknown>;
  /** Columnas que se guardan junto al cambio. */
  set?: Record<string, unknown>;
}

function timestampsFor(to: ShipmentState, now: Date): Record<string, Date> {
  if (to === 'dispatched') return { dispatchedAt: now };
  if (to === 'delivered') return { deliveredAt: now };
  if (to === 'received') return { receivedAt: now };
  return {};
}

async function syncPackages(tx: any, shipmentId: string, to: ShipmentState) {
  const rows = await tx
    .select({ id: schema.packages.id, status: schema.packages.status })
    .from(schema.packages)
    .where(eq(schema.packages.shipmentId, shipmentId));
  for (const row of rows) {
    const next = packageStatusAfter(to, row.status);
    if (next !== row.status) {
      await tx.update(schema.packages).set({ status: next }).where(eq(schema.packages.id, row.id));
    }
  }
}

/**
 * Lleva el envío a `to`. Si ya está ahí no hace nada, para que repetir una
 * llamada no duplique eventos ni correos. Si la transición no está permitida,
 * lanza un `LogisticsError` y la transacción entera se deshace.
 */
export async function transitionShipment(
  ctx: LogisticsContext,
  tx: any,
  effects: Effect[],
  shipment: any,
  to: ShipmentState,
  options: TransitionOptions = {},
): Promise<any> {
  const from = stateOf(shipment);
  if (from === to) return shipment;
  assertTransition(from, to);

  const now = new Date();
  const patch = {
    status: to,
    preparationStatus: to,
    updatedAt: now,
    ...timestampsFor(to, now),
    ...options.set,
  };
  await tx.update(schema.shipments).set(patch).where(eq(schema.shipments.id, shipment.id));
  await tx.insert(schema.shipmentEvents).values({
    id: crypto.randomUUID(),
    shipmentId: shipment.id,
    kind: 'status_change',
    status: to,
    description: options.description ?? null,
    // now() es la hora de la transacción: dos cambios seguidos saldrían empatados y
    // el historial podría contarlos al revés.
    createdAt: sql`clock_timestamp()`,
  });
  await syncPackages(tx, shipment.id, to);

  // Una recogida hecha trae la mercancía de vuelta: queda la recepción en borrador.
  if (to === 'delivered' && shipment.kind === 'pickup_return' && shipment.returnWarehouseId) {
    await createReturnReceipt(tx, {
      warehouseId: shipment.returnWarehouseId,
      notes: `Recogida de devolución · ${shipment.recipientName || shipment.destinationAddress || shipment.id.slice(0, 8)}`,
      userId: ctx.userId,
      shipment,
    });
  }

  effects.push(() => announceTransition(ctx, shipment.id, from, to, options));
  return { ...shipment, ...patch };
}

/** Un envío recién creado: la misma salida hacia fuera que un cambio de estado. */
export function announceTransition(
  ctx: LogisticsContext,
  shipmentId: string,
  from: string | null,
  to: ShipmentState,
  options: TransitionOptions = {},
) {
  const { tenantId, db, baseUrl } = ctx;
  broadcastEvent(tenantId, {
    type: 'shipment.preparation_changed',
    payload: { shipmentId, from, to, at: Date.now() },
  } as any);
  broadcastEvent(tenantId, {
    type: 'shipment.updated',
    payload: { id: shipmentId, status: to },
  } as any);
  HookManager.trigger(options.hook || `shipment.${to}`, {
    tenantId,
    shipmentId,
    from,
    to,
    ...(options.payload || {}),
  }).catch((e: any) => console.warn(`[logistics] hook shipment.${to}:`, e?.message));
  if (isNotifiableStage(to)) {
    notifyShipmentStageChange(db, tenantId, shipmentId, to, baseUrl).catch(() => {});
    dispatchEvent(tenantId, `shipment.${to}`, {
      id: shipmentId,
      from,
      to,
      status: to,
      reason: options.description ?? null,
      ...(options.payload || {}),
    }).catch(() => {});
  }
}
