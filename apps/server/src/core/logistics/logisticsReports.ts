/**
 * Cómo va el reparto: entregas a tiempo, incidencias por causa y trabajo por
 * conductor. Solo lee. Una entrega sin fecha prevista no cuenta como tarde ni a tiempo.
 */
import { and, eq, gte, isNotNull, lte } from 'drizzle-orm';
import * as schema from '../../db/schema';

export interface ReportRange {
  from?: string;
  to?: string;
}

const startOf = (date: string) => new Date(`${date}T00:00:00`);
const endOf = (date: string) => new Date(`${date}T23:59:59.999`);

export async function logisticsSummary(db: any, range: ReportRange) {
  const from = range.from ? startOf(range.from) : null;
  const to = range.to ? endOf(range.to) : null;

  const delivered: any[] = await db
    .select({
      deliveredAt: schema.shipments.deliveredAt,
      estimatedDelivery: schema.shipments.estimatedDelivery,
    })
    .from(schema.shipments)
    .where(
      and(
        isNotNull(schema.shipments.deliveredAt),
        from ? gte(schema.shipments.deliveredAt, from) : undefined,
        to ? lte(schema.shipments.deliveredAt, to) : undefined,
      ),
    );
  let onTime = 0;
  let late = 0;
  for (const row of delivered) {
    if (!row.estimatedDelivery) continue;
    if (new Date(row.deliveredAt) <= new Date(row.estimatedDelivery)) onTime++;
    else late++;
  }

  const incidentEvents: any[] = await db
    .select({ description: schema.shipmentEvents.description })
    .from(schema.shipmentEvents)
    .where(
      and(
        eq(schema.shipmentEvents.status, 'exception'),
        from ? gte(schema.shipmentEvents.createdAt, from) : undefined,
        to ? lte(schema.shipmentEvents.createdAt, to) : undefined,
      ),
    );
  const causes = new Map<string, number>();
  for (const { description } of incidentEvents) {
    const reason = description?.trim() || '';
    causes.set(reason, (causes.get(reason) || 0) + 1);
  }

  const stops: any[] = await db
    .select({
      status: schema.routeStops.status,
      driverName: schema.routes.driverName,
      plannedDate: schema.routes.plannedDate,
    })
    .from(schema.routeStops)
    .innerJoin(schema.routes, eq(schema.routeStops.routeId, schema.routes.id))
    .where(
      and(
        range.from ? gte(schema.routes.plannedDate, range.from) : undefined,
        range.to ? lte(schema.routes.plannedDate, range.to) : undefined,
      ),
    );
  const drivers = new Map<string, any>();
  for (const stop of stops) {
    const driver = stop.driverName || '';
    const row = drivers.get(driver) || {
      driver,
      stops: 0,
      delivered: 0,
      postponed: 0,
      incidents: 0,
    };
    row.stops++;
    if (stop.status === 'delivered') row.delivered++;
    if (stop.status === 'postponed') row.postponed++;
    if (stop.status === 'exception') row.incidents++;
    drivers.set(driver, row);
  }

  return {
    delivery: { total: delivered.length, onTime, late, unknown: delivered.length - onTime - late },
    incidents: [...causes.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    drivers: [...drivers.values()].sort((a, b) => b.stops - a.stops),
  };
}
