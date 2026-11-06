/**
 * Lo que le pasa a una ruta y a sus paradas: planificar, salir, llegar,
 * entregar, aplazar, reportar una incidencia y cerrar.
 *
 * Una parada cerrada nunca se reabre ni se mueve: es la historia del reparto.
 * Reintentar un envío crea una parada nueva.
 */
import crypto from 'crypto';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { broadcastEvent } from '../realtime/EventSocket';
import { HookManager } from '../plugins/HookManager';
import {
  LIVE_STOP_STATES,
  LogisticsError,
  isClosedState,
  isLiveStop,
  stateOf,
} from './shipmentLifecycle';
import {
  transitionShipment,
  withEffects,
  type Effect,
  type LogisticsContext,
} from './shipmentTransitions';
import { estimateStopTimes, fleetWarnings, type FleetWarning, type Point } from './fleetPlanning';

const isPickup = (shipment: any) => shipment.kind === 'pickup_return';

/** Peso que lleva la ruta en sus paradas vivas. */
async function routeLoadKg(db: any, routeId: string): Promise<number> {
  const stops = await db
    .select({ shipmentId: schema.routeStops.shipmentId })
    .from(schema.routeStops)
    .where(
      and(
        eq(schema.routeStops.routeId, routeId),
        inArray(schema.routeStops.status, LIVE_STOP_STATES as string[]),
      ),
    );
  const ids = stops.map((s: any) => s.shipmentId).filter(Boolean);
  if (ids.length === 0) return 0;
  const packages = await db
    .select({ weightKg: schema.packages.weightKg })
    .from(schema.packages)
    .where(inArray(schema.packages.shipmentId, ids));
  return packages.reduce((sum: number, p: any) => sum + Number(p.weightKg || 0), 0);
}

/** Lo que conviene avisar de una ruta: se pasa de peso o su conductor ya tiene otra. */
export async function routeWarnings(db: any, routeId: string): Promise<FleetWarning[]> {
  const route = await loadRoute(db, routeId);
  const [vehicle] = route.vehicleId
    ? await db
        .select({ capacityKg: schema.vehicles.capacityKg })
        .from(schema.vehicles)
        .where(eq(schema.vehicles.id, route.vehicleId))
    : [null];
  const sameDay: any[] = route.driverEmployeeId
    ? await db
        .select({ id: schema.routes.id, code: schema.routes.code, status: schema.routes.status })
        .from(schema.routes)
        .where(
          and(
            eq(schema.routes.driverEmployeeId, route.driverEmployeeId),
            eq(schema.routes.plannedDate, route.plannedDate),
          ),
        )
    : [];
  return fleetWarnings({
    loadKg: await routeLoadKg(db, routeId),
    capacityKg: vehicle?.capacityKg ?? null,
    otherRoutes: sameDay
      .filter((r) => r.id !== routeId && r.status !== 'completed')
      .map((r) => r.code),
  });
}

/**
 * Pone hora a las paradas al salir. La del envío solo se rellena si nadie la había
 * prometido antes: es lo que ve el cliente.
 */
async function scheduleStops(tx: any, stops: any[], now: Date) {
  const live = stops.filter((s) => isLiveStop(s.status));
  const shipmentIds = live.map((s) => s.shipmentId).filter(Boolean);
  const shipments: any[] = shipmentIds.length
    ? await tx.select().from(schema.shipments).where(inArray(schema.shipments.id, shipmentIds))
    : [];
  const byId = new Map(shipments.map((s) => [s.id, s]));
  const points = live.map((stop): Point | null => {
    const shipment = stop.shipmentId ? byId.get(stop.shipmentId) : null;
    const lat = stop.lat ?? shipment?.destinationLat;
    const lng = stop.lng ?? shipment?.destinationLng;
    return lat != null && lng != null ? { lat, lng } : null;
  });
  const times = estimateStopTimes(now, points);
  for (let i = 0; i < live.length; i++) {
    const at = times[i];
    if (!at) continue;
    const stop = live[i];
    if (!stop.plannedAt) {
      await tx
        .update(schema.routeStops)
        .set({ plannedAt: at })
        .where(eq(schema.routeStops.id, stop.id));
    }
    const shipment = stop.shipmentId ? byId.get(stop.shipmentId) : null;
    if (shipment && !shipment.estimatedDelivery) {
      await tx
        .update(schema.shipments)
        .set({ estimatedDelivery: at })
        .where(eq(schema.shipments.id, shipment.id));
    }
  }
}

export async function loadShipment(tx: any, id: string, lock = false): Promise<any> {
  const query = tx.select().from(schema.shipments).where(eq(schema.shipments.id, id));
  const [row] = await (lock ? query.for('update') : query);
  if (!row) throw new LogisticsError('Envío no encontrado', 404);
  return row;
}

export async function loadRoute(tx: any, id: string, lock = false): Promise<any> {
  const query = tx.select().from(schema.routes).where(eq(schema.routes.id, id));
  const [row] = await (lock ? query.for('update') : query);
  if (!row) throw new LogisticsError('Ruta no encontrada', 404);
  return row;
}

async function loadStops(tx: any, routeId: string): Promise<any[]> {
  return tx
    .select()
    .from(schema.routeStops)
    .where(eq(schema.routeStops.routeId, routeId))
    .orderBy(asc(schema.routeStops.sequence));
}

async function lockStop(tx: any, routeId: string, stopId: string): Promise<any> {
  const [stop] = await tx
    .select()
    .from(schema.routeStops)
    .where(and(eq(schema.routeStops.id, stopId), eq(schema.routeStops.routeId, routeId)))
    .for('update');
  if (!stop) throw new LogisticsError('Parada no encontrada en esta ruta', 404);
  return stop;
}

function announceRouteChange(
  ctx: LogisticsContext,
  effects: Effect[],
  routeId: string,
  from: string,
  to: string,
) {
  effects.push(() => {
    broadcastEvent(ctx.tenantId, {
      type: 'route.changed',
      payload: { routeId, from, to },
    } as any);
    const hook = to === 'active' ? 'route.started' : 'route.completed';
    HookManager.trigger(hook, { tenantId: ctx.tenantId, routeId }).catch(() => {});
  });
}

async function setRouteActive(ctx: LogisticsContext, tx: any, effects: Effect[], route: any) {
  await tx
    .update(schema.routes)
    .set({ status: 'active', startedAt: route.startedAt || new Date() })
    .where(eq(schema.routes.id, route.id));
  announceRouteChange(ctx, effects, route.id, route.status, 'active');
}

async function setRouteCompleted(ctx: LogisticsContext, tx: any, effects: Effect[], route: any) {
  await tx
    .update(schema.routes)
    .set({ status: 'completed', completedAt: new Date() })
    .where(eq(schema.routes.id, route.id));
  announceRouteChange(ctx, effects, route.id, route.status, 'completed');
}

/** La parada sale hacia el cliente, y su envío a "en reparto". */
async function advanceStop(ctx: LogisticsContext, tx: any, effects: Effect[], stop: any) {
  await tx
    .update(schema.routeStops)
    .set({ status: 'en_route' })
    .where(eq(schema.routeStops.id, stop.id));
  if (!stop.shipmentId) return;
  const shipment = await loadShipment(tx, stop.shipmentId);
  if (!['dispatched', 'in_transit'].includes(stateOf(shipment))) return;
  await transitionShipment(ctx, tx, effects, shipment, 'out_for_delivery', {
    description: isPickup(shipment) ? 'Hoy pasamos a recogerlo' : 'Sale hoy en reparto',
    payload: { routeId: stop.routeId, stopId: stop.id },
  });
}

/**
 * Tras cerrar una parada: si no queda ninguna viva la ruta termina; si la ruta
 * está en marcha y nadie va de camino a otra, sale la siguiente.
 */
export async function afterStopClosed(
  ctx: LogisticsContext,
  tx: any,
  effects: Effect[],
  routeId: string,
) {
  const route = await loadRoute(tx, routeId);
  if (route.status === 'completed') return;
  const stops = await loadStops(tx, routeId);
  if (stops.length > 0 && !stops.some((s) => isLiveStop(s.status))) {
    await setRouteCompleted(ctx, tx, effects, route);
    return;
  }
  if (route.status !== 'active') return;
  if (stops.some((s) => s.status === 'en_route' || s.status === 'arrived')) return;
  const next = stops.find((s) => s.status === 'pending');
  if (next) await advanceStop(ctx, tx, effects, next);
}

/**
 * Cierra las paradas vivas de un envío y reevalúa sus rutas. Lo usan cancelar,
 * devolver y entregar desde la oficina, para que no quede una parada colgada.
 */
export async function closeLiveStops(
  ctx: LogisticsContext,
  tx: any,
  effects: Effect[],
  shipmentId: string,
  status: 'cancelled' | 'delivered' | 'postponed',
  reason: string | null,
) {
  const live = await tx
    .select()
    .from(schema.routeStops)
    .where(
      and(
        eq(schema.routeStops.shipmentId, shipmentId),
        inArray(schema.routeStops.status, LIVE_STOP_STATES as string[]),
      ),
    );
  for (const stop of live) {
    await tx
      .update(schema.routeStops)
      .set({
        status,
        podNotes: reason,
        ...(status === 'delivered' ? { departedAt: new Date() } : {}),
      })
      .where(eq(schema.routeStops.id, stop.id));
  }
  for (const routeId of new Set<string>(live.map((s: any) => s.routeId))) {
    await afterStopClosed(ctx, tx, effects, routeId);
  }
}

interface StopData {
  sequence?: number;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  plannedAt?: Date | null;
  notes?: string | null;
}

async function nextSequence(tx: any, routeId: string) {
  const rows = await tx
    .select({ sequence: schema.routeStops.sequence })
    .from(schema.routeStops)
    .where(eq(schema.routeStops.routeId, routeId));
  return rows.reduce((max: number, s: any) => Math.max(max, s.sequence || 0), 0) + 1;
}

function assertRouteOpen(route: any) {
  if (route.archivedAt || !['planned', 'active'].includes(route.status)) {
    throw new LogisticsError('Esa ruta ya ha terminado: elige otra.', 409);
  }
}

/**
 * Pone un envío en una ruta. Sirve para el primer intento y para reintentar: si
 * ya tiene una parada viva en esta ruta no hace nada, si la tiene en otra y aún
 * no ha salido la mueve, y si no la tiene crea una nueva. Las paradas cerradas de
 * intentos anteriores no se tocan.
 */
export async function placeShipmentOnRoute(
  ctx: LogisticsContext,
  tx: any,
  effects: Effect[],
  shipment: any,
  route: any,
  data: StopData = {},
) {
  const state = stateOf(shipment);
  if (isClosedState(state)) {
    throw new LogisticsError(
      `Este envío está en estado "${state}" y no se puede volver a despachar. Crea un envío nuevo desde el albarán para reintentar.`,
      409,
      { terminalStatus: state },
    );
  }
  assertRouteOpen(route);

  const [existing] = await tx
    .select()
    .from(schema.routeStops)
    .where(
      and(
        eq(schema.routeStops.shipmentId, shipment.id),
        inArray(schema.routeStops.status, LIVE_STOP_STATES as string[]),
      ),
    );

  const alreadyOut = ['in_transit', 'out_for_delivery'].includes(state);
  if (existing && existing.routeId !== route.id) {
    if (alreadyOut || existing.status !== 'pending') {
      throw new LogisticsError('Este envío ya ha salido. Aplázalo antes de pasarlo a otra ruta.');
    }
    await tx
      .update(schema.routeStops)
      .set({ routeId: route.id, sequence: data.sequence ?? (await nextSequence(tx, route.id)) })
      .where(eq(schema.routeStops.id, existing.id));
  } else if (!existing) {
    await tx.insert(schema.routeStops).values({
      id: crypto.randomUUID(),
      routeId: route.id,
      sequence: data.sequence ?? (await nextSequence(tx, route.id)),
      shipmentId: shipment.id,
      address: data.address ?? shipment.destinationAddress ?? null,
      lat: data.lat ?? shipment.destinationLat ?? null,
      lng: data.lng ?? shipment.destinationLng ?? null,
      plannedAt: data.plannedAt ?? null,
      notes: data.notes ?? null,
    });
  }

  if (alreadyOut) return shipment;
  let current = await transitionShipment(ctx, tx, effects, shipment, 'dispatched', {
    description: isPickup(shipment) ? 'Recogida asignada a ruta' : 'Despachado',
    payload: { routeId: route.id },
  });
  if (route.status === 'active') {
    current = await transitionShipment(ctx, tx, effects, current, 'in_transit', {
      description: isPickup(shipment) ? 'De camino a recoger' : 'En camino',
      payload: { routeId: route.id },
    });
    await afterStopClosed(ctx, tx, effects, route.id);
  }
  return current;
}

/** Añadir una parada a mano: con envío se planifica, sin envío es solo una dirección. */
export function addStop(
  ctx: LogisticsContext,
  routeId: string,
  input: StopData & { shipmentId?: string | null },
) {
  return withEffects(ctx, async (tx, effects) => {
    const route = await loadRoute(tx, routeId, true);
    if (input.shipmentId) {
      const shipment = await loadShipment(tx, input.shipmentId, true);
      await placeShipmentOnRoute(ctx, tx, effects, shipment, route, input);
      const [stop] = await tx
        .select({ id: schema.routeStops.id })
        .from(schema.routeStops)
        .where(
          and(
            eq(schema.routeStops.routeId, routeId),
            eq(schema.routeStops.shipmentId, input.shipmentId),
          ),
        );
      return { id: stop.id as string };
    }
    assertRouteOpen(route);
    const id = crypto.randomUUID();
    await tx.insert(schema.routeStops).values({
      id,
      routeId,
      sequence: input.sequence ?? (await nextSequence(tx, routeId)),
      address: input.address ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      plannedAt: input.plannedAt ?? null,
      notes: input.notes ?? null,
    });
    return { id };
  });
}

/** Un envío que se queda sin parada antes de salir vuelve a estar listo. */
async function backToReady(ctx: LogisticsContext, tx: any, effects: Effect[], stop: any) {
  if (!stop.shipmentId) return;
  const shipment = await loadShipment(tx, stop.shipmentId);
  if (stateOf(shipment) !== 'dispatched') return;
  await transitionShipment(ctx, tx, effects, shipment, 'ready', {
    description: 'Sacado de la ruta',
  });
}

/** Solo se quita una parada a la que aún no se ha ido: las demás son historia. */
export function removeStop(ctx: LogisticsContext, routeId: string, stopId: string) {
  return withEffects(ctx, async (tx, effects) => {
    const stop = await lockStop(tx, routeId, stopId);
    if (stop.status !== 'pending') {
      throw new LogisticsError('Esta parada ya se ha visitado y no se puede quitar.');
    }
    await tx.delete(schema.routeStops).where(eq(schema.routeStops.id, stop.id));
    await backToReady(ctx, tx, effects, stop);
  });
}

/** Algo ha pasado ya en esta ruta: una salida, una parada visitada o una firma. */
export function routeHasActivity(route: any, stops: any[]): boolean {
  return (
    route.status !== 'planned' ||
    stops.some((s) => s.status !== 'pending' || s.arrivedAt || s.signatureImage || s.photoImage)
  );
}

/**
 * Una ruta con actividad se archiva: al borrarla se perderían sus paradas, y con
 * ellas las firmas y las fotos de entrega. Una en marcha hay que finalizarla
 * antes. Si se borra de verdad, sus envíos vuelven a estar listos.
 */
export function deleteRoute(ctx: LogisticsContext, routeId: string) {
  return withEffects(ctx, async (tx, effects) => {
    const route = await loadRoute(tx, routeId, true);
    if (route.status === 'active') {
      throw new LogisticsError('La ruta está en marcha. Finalízala antes.');
    }
    const stops = await loadStops(tx, routeId);
    if (routeHasActivity(route, stops)) {
      await tx
        .update(schema.routes)
        .set({ archivedAt: route.archivedAt || new Date() })
        .where(eq(schema.routes.id, routeId));
      return { archived: true };
    }
    for (const stop of stops) await backToReady(ctx, tx, effects, stop);
    await tx.delete(schema.routes).where(eq(schema.routes.id, routeId));
    return { archived: false };
  });
}

/**
 * "Iniciar ruta": la ruta en marcha, sus envíos en camino y la primera parada
 * hacia el cliente. Repetirla no hace nada, por si se reabre la app a mitad.
 */
export function startRoute(ctx: LogisticsContext, routeId: string) {
  return withEffects(ctx, async (tx, effects) => {
    const route = await loadRoute(tx, routeId, true);
    if (route.status === 'completed') throw new LogisticsError('La ruta ya está completada');
    if (route.status === 'active') return { already: true };

    await setRouteActive(ctx, tx, effects, route);
    const stops = await loadStops(tx, routeId);
    await scheduleStops(tx, stops, new Date());
    // Lo que ya está en la furgoneta deja de estar en su acopio.
    const shipmentIds = stops.map((stop: any) => stop.shipmentId).filter(Boolean);
    if (shipmentIds.length > 0) {
      await tx
        .update(schema.packages)
        .set({ stagingAreaId: null })
        .where(
          and(
            inArray(schema.packages.shipmentId, shipmentIds),
            isNotNull(schema.packages.loadedAt),
          ),
        );
    }
    for (const stop of stops) {
      if (!stop.shipmentId || !isLiveStop(stop.status)) continue;
      let shipment = await loadShipment(tx, stop.shipmentId);
      const state = stateOf(shipment);
      if (['pending', 'packed', 'ready', 'postponed'].includes(state)) {
        shipment = await transitionShipment(ctx, tx, effects, shipment, 'dispatched', {
          description: 'Despachado',
          payload: { routeId },
        });
      } else if (state !== 'dispatched') {
        continue;
      }
      await transitionShipment(ctx, tx, effects, shipment, 'in_transit', {
        description: isPickup(shipment) ? 'De camino a recoger' : 'En camino',
        payload: { routeId },
      });
    }
    const first = stops.find((s) => s.status === 'pending');
    if (first) await advanceStop(ctx, tx, effects, first);
    return { already: false };
  });
}

/**
 * "Finalizar ruta": se cierra aunque queden paradas. Las que quedan pasan a
 * aplazadas y sus envíos también: vuelven al almacén para reintentarse.
 */
export function finishRoute(ctx: LogisticsContext, routeId: string) {
  return withEffects(ctx, async (tx, effects) => {
    const route = await loadRoute(tx, routeId, true);
    if (route.status === 'completed') return { already: true, postponedStops: 0 };

    const open = (await loadStops(tx, routeId)).filter((s) => isLiveStop(s.status));
    for (const stop of open) {
      await tx
        .update(schema.routeStops)
        .set({ status: 'postponed' })
        .where(eq(schema.routeStops.id, stop.id));
      if (!stop.shipmentId) continue;
      const shipment = await loadShipment(tx, stop.shipmentId);
      if (!['dispatched', 'in_transit', 'out_for_delivery'].includes(stateOf(shipment))) continue;
      await transitionShipment(ctx, tx, effects, shipment, 'postponed', {
        description: isPickup(shipment)
          ? 'Recogida aplazada — se reintentará'
          : 'Reparto finalizado sin entrega — se reintentará',
        payload: { routeId, stopId: stop.id },
      });
    }
    await setRouteCompleted(ctx, tx, effects, route);
    return { already: false, postponedStops: open.length };
  });
}

/** Marcar una parada es señal de que la ruta ya ha salido, aunque no se pulsara "Iniciar". */
async function ensureRouteRunning(ctx: LogisticsContext, tx: any, effects: Effect[], route: any) {
  if (route.status === 'completed') throw new LogisticsError('La ruta ya está completada');
  if (route.status === 'planned') await setRouteActive(ctx, tx, effects, route);
}

function stopVisited(ctx: LogisticsContext, effects: Effect[], stop: any, status: string) {
  effects.push(() =>
    HookManager.trigger('route.stopVisited', {
      tenantId: ctx.tenantId,
      routeId: stop.routeId,
      stopId: stop.id,
      status,
    }).catch(() => {}),
  );
}

export function arriveAtStop(ctx: LogisticsContext, routeId: string, stopId: string) {
  return withEffects(ctx, async (tx, effects) => {
    const route = await loadRoute(tx, routeId, true);
    const stop = await lockStop(tx, routeId, stopId);
    if (stop.status === 'arrived') return { already: true };
    if (!isLiveStop(stop.status)) {
      throw new LogisticsError('Esta parada ya está cerrada.');
    }
    await ensureRouteRunning(ctx, tx, effects, route);
    await tx
      .update(schema.routeStops)
      .set({ status: 'arrived', arrivedAt: new Date() })
      .where(eq(schema.routeStops.id, stop.id));
    if (stop.shipmentId) {
      const shipment = await loadShipment(tx, stop.shipmentId);
      if (['dispatched', 'in_transit'].includes(stateOf(shipment))) {
        await transitionShipment(ctx, tx, effects, shipment, 'out_for_delivery', {
          description: isPickup(shipment) ? 'Hoy pasamos a recogerlo' : 'Sale hoy en reparto',
          payload: { routeId, stopId },
        });
      }
    }
    stopVisited(ctx, effects, stop, 'arrived');
    return { already: false };
  });
}

export interface DeliveryProof {
  recipientName?: string | null;
  recipientDocument?: string | null;
  signatureImage?: string | null;
  photoImage?: string | null;
  podNotes?: string | null;
  handover?: string | null;
}

/**
 * Entregar en una sola transacción: parada, prueba de entrega, envío, paquetes y
 * ruta. Repetirla (el móvil sin cobertura reintenta) devuelve `already` sin tocar
 * nada, y si el envío no se puede entregar la parada se queda como estaba.
 */
export function deliverStop(
  ctx: LogisticsContext,
  routeId: string,
  stopId: string,
  proof: DeliveryProof,
) {
  return withEffects(ctx, async (tx, effects) => {
    const route = await loadRoute(tx, routeId, true);
    const stop = await lockStop(tx, routeId, stopId);
    if (stop.status === 'delivered') return { already: true };
    if (!isLiveStop(stop.status)) {
      throw new LogisticsError('Esta parada ya está cerrada.');
    }
    await ensureRouteRunning(ctx, tx, effects, route);
    const now = new Date();
    await tx
      .update(schema.routeStops)
      .set({
        status: 'delivered',
        arrivedAt: stop.arrivedAt || now,
        departedAt: now,
        recipientName: proof.recipientName ?? null,
        recipientDocument: proof.recipientDocument ?? null,
        signatureImage: proof.signatureImage ?? null,
        photoImage: proof.photoImage ?? null,
        podNotes: proof.podNotes ?? null,
        handover: proof.handover ?? null,
      })
      .where(eq(schema.routeStops.id, stop.id));
    if (stop.shipmentId) {
      const shipment = await loadShipment(tx, stop.shipmentId, true);
      await transitionShipment(ctx, tx, effects, shipment, 'delivered', {
        description: isPickup(shipment) ? 'Recogido' : 'Entregado',
        payload: { routeId, stopId },
      });
    }
    await afterStopClosed(ctx, tx, effects, routeId);
    stopVisited(ctx, effects, stop, 'delivered');
    return { already: false };
  });
}

function closeStopWith(
  ctx: LogisticsContext,
  routeId: string,
  stopId: string,
  status: 'postponed' | 'exception',
  reason: string | null,
) {
  return withEffects(ctx, async (tx, effects) => {
    const route = await loadRoute(tx, routeId, true);
    const stop = await lockStop(tx, routeId, stopId);
    if (stop.status === status) return { already: true };
    if (!isLiveStop(stop.status)) {
      throw new LogisticsError('Esta parada ya está cerrada.');
    }
    await ensureRouteRunning(ctx, tx, effects, route);
    await tx
      .update(schema.routeStops)
      .set({ status, arrivedAt: stop.arrivedAt || new Date(), podNotes: reason })
      .where(eq(schema.routeStops.id, stop.id));
    if (stop.shipmentId) {
      const shipment = await loadShipment(tx, stop.shipmentId, true);
      await transitionShipment(ctx, tx, effects, shipment, status, {
        description: reason,
        payload: { routeId, stopId },
      });
    }
    await afterStopClosed(ctx, tx, effects, routeId);
    return { already: false };
  });
}

/** No había nadie, por ejemplo. El envío queda para volver a planificarlo. */
export function postponeStop(
  ctx: LogisticsContext,
  routeId: string,
  stopId: string,
  reason: string | null,
) {
  return closeStopWith(ctx, routeId, stopId, 'postponed', reason);
}

export function reportStopIncident(
  ctx: LogisticsContext,
  routeId: string,
  stopId: string,
  reason: string,
) {
  return closeStopWith(ctx, routeId, stopId, 'exception', reason);
}
