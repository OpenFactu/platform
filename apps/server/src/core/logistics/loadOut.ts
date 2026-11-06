/**
 * El acopio visto por el conductor: cargar los bultos antes de salir y dejarlos en un
 * acopio cuando no se han podido entregar. Un bulto cargado sigue en su acopio hasta
 * que la ruta sale (`startRoute`), para poder corregir un error sin perder de dónde era.
 */
import crypto from 'crypto';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { loadRoute, postponeStop } from './routeActions';
import { LogisticsError, isLiveStop } from './shipmentLifecycle';
import type { LogisticsContext } from './shipmentTransitions';

async function stopsOf(db: any, routeId: string): Promise<any[]> {
  return db.select().from(schema.routeStops).where(eq(schema.routeStops.routeId, routeId));
}

export async function markPackageLoaded(
  db: any,
  routeId: string,
  packageId: string,
  loaded: boolean,
) {
  const route = await loadRoute(db, routeId);
  const [pkg] = await db.select().from(schema.packages).where(eq(schema.packages.id, packageId));
  const stops = await stopsOf(db, routeId);
  if (!pkg || !stops.some((stop) => stop.shipmentId && stop.shipmentId === pkg.shipmentId)) {
    throw new LogisticsError('Este bulto no va en esta ruta.', 404);
  }
  const patch: Record<string, unknown> = { loadedAt: loaded ? new Date() : null };
  // Con la ruta ya en marcha no hay vuelta atrás: al subirlo, deja el acopio.
  if (loaded && route.status === 'active') patch.stagingAreaId = null;
  await db.update(schema.packages).set(patch).where(eq(schema.packages.id, packageId));
  return { loaded };
}

/** Los bultos de las paradas abiertas que aún no están en la furgoneta. */
export async function packagesToLoad(db: any, routeId: string): Promise<any[]> {
  const shipmentIds = (await stopsOf(db, routeId))
    .filter((stop) => stop.shipmentId && isLiveStop(stop.status))
    .map((stop) => stop.shipmentId);
  if (shipmentIds.length === 0) return [];
  return db
    .select({ id: schema.packages.id })
    .from(schema.packages)
    .where(
      and(
        inArray(schema.packages.shipmentId, shipmentIds),
        isNull(schema.packages.loadedAt),
        ne(schema.packages.status, 'delivered'),
      ),
    );
}

export async function listStagingAreas(db: any) {
  return db
    .select({
      id: schema.stagingAreas.id,
      code: schema.stagingAreas.code,
      name: schema.stagingAreas.name,
      address: schema.stagingAreas.address,
    })
    .from(schema.stagingAreas);
}

/**
 * Dejar en un acopio lo que no se ha entregado. La parada que siguiera abierta queda
 * aplazada: el pedido sigue pendiente y se puede volver a poner en ruta.
 */
export async function dropAtStaging(
  ctx: LogisticsContext,
  routeId: string,
  input: { stagingAreaId?: string | null; shipmentIds?: unknown },
) {
  const [area] = input.stagingAreaId
    ? await ctx.db
        .select()
        .from(schema.stagingAreas)
        .where(eq(schema.stagingAreas.id, input.stagingAreaId))
    : [null];
  if (!area) throw new LogisticsError('Acopio no encontrado', 404);
  const shipmentIds = Array.isArray(input.shipmentIds) ? (input.shipmentIds as string[]) : [];
  if (shipmentIds.length === 0) throw new LogisticsError('Elige qué bultos dejas.', 400);

  const stops = await stopsOf(ctx.db, routeId);
  const targets = shipmentIds.map((id) => {
    const stop = stops.find((row) => row.shipmentId === id);
    if (!stop) throw new LogisticsError('Ese envío no va en esta ruta.', 404);
    if (stop.status === 'delivered') {
      throw new LogisticsError('Un envío ya entregado no se puede dejar en un acopio.', 409);
    }
    return stop;
  });

  const note = `Dejado en el acopio ${area.name}`;
  for (const stop of targets) {
    await ctx.db
      .update(schema.packages)
      .set({ stagingAreaId: area.id, loadedAt: null })
      .where(
        and(
          eq(schema.packages.shipmentId, stop.shipmentId),
          ne(schema.packages.status, 'delivered'),
        ),
      );
    await ctx.db.insert(schema.shipmentEvents).values({
      id: crypto.randomUUID(),
      shipmentId: stop.shipmentId,
      kind: 'staging',
      description: note,
    });
    if (isLiveStop(stop.status)) await postponeStop(ctx, routeId, stop.id, note);
  }
  return { dropped: targets.length };
}
