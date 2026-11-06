/**
 * Lo que las pantallas necesitan leer de un envío además de sus columnas: quién
 * es el cliente, de qué documento sale, en qué ruta va. Y el resumen del día.
 *
 * Nada de esto cambia datos.
 */
import { and, asc, desc, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import * as schema from '../../db/schema';
import {
  LIVE_STOP_STATES,
  LogisticsError,
  isClosedState,
  isLiveStop,
  stateOf,
} from './shipmentLifecycle';

export type ShipmentDirection = 'out' | 'in' | 'pickup';

function directionOf(shipment: any): ShipmentDirection {
  if (shipment.kind === 'pickup_return') return 'pickup';
  return shipment.sourceDocType === 'PDN' ? 'in' : 'out';
}

function docCode(prefix: string | null, periodCode: string | null, docNum: number): string {
  return [prefix, periodCode, String(docNum).padStart(6, '0')].filter(Boolean).join('-');
}

/** Número y cliente de los albaranes de esos envíos. */
async function notesOf(db: any, shipments: any[]) {
  const out = new Map<string, { number: string; partnerId: string | null }>();
  for (const [code, table] of [
    ['SDN', schema.salesDeliveryNotes],
    ['PDN', schema.purchaseDeliveryNotes],
  ] as const) {
    const ids = shipments
      .filter((s) => s.deliveryNoteId && (s.sourceDocType || 'SDN') === code)
      .map((s) => s.deliveryNoteId);
    if (ids.length === 0) continue;
    const rows = await db
      .select({
        id: table.id,
        docNum: table.docNum,
        partnerId: table.partnerId,
        prefix: schema.documentSeries.prefix,
        periodCode: schema.accountingPeriods.code,
      })
      .from(table)
      .leftJoin(schema.documentSeries, eq(table.seriesId, schema.documentSeries.id))
      .leftJoin(schema.accountingPeriods, eq(table.periodId, schema.accountingPeriods.id))
      .where(inArray(table.id, ids));
    for (const row of rows) {
      out.set(row.id, {
        number: docCode(row.prefix, row.periodCode, row.docNum),
        partnerId: row.partnerId,
      });
    }
  }
  return out;
}

async function partnersOf(db: any, ids: Array<string | null>) {
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  if (unique.length === 0) return new Map<string, any>();
  const rows = await db
    .select({
      id: schema.businessPartners.id,
      name: schema.businessPartners.name,
      phone: schema.businessPartners.phone,
      email: schema.businessPartners.email,
    })
    .from(schema.businessPartners)
    .where(inArray(schema.businessPartners.id, unique));
  return new Map<string, any>(rows.map((r: any) => [r.id, r]));
}

/** La ruta en la que va cada envío: la de su parada viva o, si no, la última. */
async function routesOfShipments(db: any, shipmentIds: string[]) {
  const out = new Map<string, any>();
  if (shipmentIds.length === 0) return out;
  const rows = await db
    .select({
      shipmentId: schema.routeStops.shipmentId,
      stopStatus: schema.routeStops.status,
      routeId: schema.routes.id,
      routeCode: schema.routes.code,
      routeName: schema.routes.name,
      plannedDate: schema.routes.plannedDate,
      driverName: schema.routes.driverName,
      vehiclePlate: schema.routes.vehiclePlate,
    })
    .from(schema.routeStops)
    .innerJoin(schema.routes, eq(schema.routeStops.routeId, schema.routes.id))
    .where(inArray(schema.routeStops.shipmentId, shipmentIds))
    .orderBy(desc(schema.routes.plannedDate));
  for (const row of rows) {
    const current = out.get(row.shipmentId);
    if (!current || (!isLiveStop(current.stopStatus) && isLiveStop(row.stopStatus))) {
      out.set(row.shipmentId, row);
    }
  }
  return out;
}

/** Los envíos con lo que hace falta para leerlos en un listado. */
export async function enrichShipments(db: any, shipments: any[]): Promise<any[]> {
  if (shipments.length === 0) return [];
  const notes = await notesOf(db, shipments);
  const partners = await partnersOf(
    db,
    [...notes.values()].map((n) => n.partnerId),
  );
  const routes = await routesOfShipments(
    db,
    shipments.map((s) => s.id),
  );
  return shipments.map((shipment) => {
    const note = shipment.deliveryNoteId ? notes.get(shipment.deliveryNoteId) : undefined;
    const partner = note?.partnerId ? partners.get(note.partnerId) : undefined;
    const route = routes.get(shipment.id);
    return {
      ...shipment,
      state: stateOf(shipment),
      direction: directionOf(shipment),
      documentNumber: note?.number ?? null,
      partnerId: note?.partnerId ?? null,
      partnerName: partner?.name ?? null,
      counterparty: shipment.recipientName || partner?.name || null,
      contactPhone: shipment.recipientPhone || partner?.phone || null,
      contactEmail: shipment.recipientEmail || partner?.email || null,
      routeId: route?.routeId ?? null,
      routeCode: route?.routeCode ?? null,
      routeDriver: route?.driverName ?? null,
      routeVehicle: route?.vehiclePlate ?? null,
    };
  });
}

/** Todo lo de un envío, para su ficha. */
export async function shipmentDetail(db: any, id: string) {
  const [row] = await db.select().from(schema.shipments).where(eq(schema.shipments.id, id));
  if (!row) throw new LogisticsError('Envío no encontrado', 404);
  const [shipment] = await enrichShipments(db, [row]);

  const events = await db
    .select()
    .from(schema.shipmentEvents)
    .where(eq(schema.shipmentEvents.shipmentId, id))
    .orderBy(desc(schema.shipmentEvents.createdAt));

  const packages: any[] = await db
    .select()
    .from(schema.packages)
    .where(eq(schema.packages.shipmentId, id))
    .orderBy(asc(schema.packages.code));
  const lines: any[] = packages.length
    ? await db
        .select({
          packageId: schema.packageLines.packageId,
          quantity: schema.packageLines.quantity,
          itemCode: schema.items.code,
          itemName: schema.items.name,
        })
        .from(schema.packageLines)
        .leftJoin(schema.items, eq(schema.packageLines.itemId, schema.items.id))
        .where(
          inArray(
            schema.packageLines.packageId,
            packages.map((p) => p.id),
          ),
        )
    : [];

  const stops = await db
    .select({
      id: schema.routeStops.id,
      status: schema.routeStops.status,
      sequence: schema.routeStops.sequence,
      arrivedAt: schema.routeStops.arrivedAt,
      departedAt: schema.routeStops.departedAt,
      recipientName: schema.routeStops.recipientName,
      recipientDocument: schema.routeStops.recipientDocument,
      signatureImage: schema.routeStops.signatureImage,
      photoImage: schema.routeStops.photoImage,
      podNotes: schema.routeStops.podNotes,
      routeId: schema.routes.id,
      routeCode: schema.routes.code,
      routeName: schema.routes.name,
      plannedDate: schema.routes.plannedDate,
      driverName: schema.routes.driverName,
      vehiclePlate: schema.routes.vehiclePlate,
    })
    .from(schema.routeStops)
    .innerJoin(schema.routes, eq(schema.routeStops.routeId, schema.routes.id))
    .where(eq(schema.routeStops.shipmentId, id))
    .orderBy(desc(schema.routes.plannedDate));

  return {
    shipment,
    events,
    packages: packages.map((p) => ({
      ...p,
      lines: lines.filter((l) => l.packageId === p.id),
    })),
    stops,
  };
}

export interface TodaySummary {
  toPrepare: number;
  readyForRoute: number;
  onRoute: number;
  incidents: number;
  late: number;
  staleRoutes: number;
  deliveredToday: number;
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Sobre una fecha `YYYY-MM-DD` de ruta: ¿es de antes de hoy? */
function isBeforeToday(plannedDate: string | Date | null | undefined, now: Date): boolean {
  if (!plannedDate) return false;
  const value = plannedDate instanceof Date ? plannedDate : new Date(`${plannedDate}T00:00:00`);
  return value.getTime() < startOfDay(now).getTime();
}

/**
 * Qué hay que mirar hoy. Una ruta está abierta de más si sigue sin terminar y su
 * fecha ya pasó, y un envío va tarde si le ha pasado la fecha prevista o lleva
 * una parada viva en una de esas rutas.
 */
export function classifyToday(
  shipments: any[],
  liveStops: Array<{ shipmentId: string | null; routeId: string }>,
  openRoutes: any[],
  now: Date,
) {
  const staleRoutes = openRoutes.filter((r) => isBeforeToday(r.plannedDate, now));
  const staleRouteIds = new Set(staleRoutes.map((r) => r.id));
  const onLiveStop = new Set(liveStops.map((s) => s.shipmentId).filter(Boolean));
  const onStaleRoute = new Set(
    liveStops.filter((s) => staleRouteIds.has(s.routeId)).map((s) => s.shipmentId),
  );

  const toPrepare: any[] = [];
  const readyForRoute: any[] = [];
  const onRoute: any[] = [];
  const incidents: any[] = [];
  const late: any[] = [];
  for (const shipment of shipments) {
    const state = stateOf(shipment);
    if (isClosedState(state)) continue;
    if (state === 'picking' || state === 'receiving') toPrepare.push(shipment);
    if (
      ['pending', 'packed', 'ready', 'postponed'].includes(state) &&
      !onLiveStop.has(shipment.id)
    ) {
      readyForRoute.push(shipment);
    }
    if (['dispatched', 'in_transit', 'out_for_delivery'].includes(state)) onRoute.push(shipment);
    if (state === 'exception') incidents.push(shipment);
    const overdue =
      shipment.estimatedDelivery && new Date(shipment.estimatedDelivery).getTime() < now.getTime();
    if (overdue || onStaleRoute.has(shipment.id)) late.push(shipment);
  }
  return { toPrepare, readyForRoute, onRoute, incidents, late, staleRoutes };
}

const LIST_LIMIT = 8;

export async function todaySummary(db: any, now: Date = new Date()) {
  const shipments: any[] = await db
    .select()
    .from(schema.shipments)
    .where(
      and(
        isNull(schema.shipments.archivedAt),
        notInArray(schema.shipments.status, ['delivered', 'received', 'returned', 'cancelled']),
      ),
    )
    .orderBy(desc(schema.shipments.createdAt))
    .limit(1000);
  const liveStops = await db
    .select({ shipmentId: schema.routeStops.shipmentId, routeId: schema.routeStops.routeId })
    .from(schema.routeStops)
    .where(inArray(schema.routeStops.status, LIVE_STOP_STATES as string[]));
  const openRoutes: any[] = await db
    .select()
    .from(schema.routes)
    .where(
      and(isNull(schema.routes.archivedAt), inArray(schema.routes.status, ['planned', 'active'])),
    );
  const closedToday: any[] = await db
    .select({ id: schema.shipments.id, deliveredAt: schema.shipments.deliveredAt })
    .from(schema.shipments)
    .where(eq(schema.shipments.status, 'delivered'))
    .orderBy(desc(schema.shipments.deliveredAt))
    .limit(1000);

  const groups = classifyToday(shipments, liveStops, openRoutes, now);
  const dayStart = startOfDay(now).getTime();
  const counts: TodaySummary = {
    toPrepare: groups.toPrepare.length,
    readyForRoute: groups.readyForRoute.length,
    onRoute: groups.onRoute.length,
    incidents: groups.incidents.length,
    late: groups.late.length,
    staleRoutes: groups.staleRoutes.length,
    deliveredToday: closedToday.filter(
      (s) => s.deliveredAt && new Date(s.deliveredAt).getTime() >= dayStart,
    ).length,
  };

  const shown = [
    ...groups.late.slice(0, LIST_LIMIT),
    ...groups.incidents.slice(0, LIST_LIMIT),
    ...groups.readyForRoute.slice(0, LIST_LIMIT),
  ];
  const enriched = new Map(
    (await enrichShipments(db, [...new Map(shown.map((s) => [s.id, s])).values()])).map((s) => [
      s.id,
      s,
    ]),
  );
  const list = (rows: any[]) => rows.slice(0, LIST_LIMIT).map((s) => enriched.get(s.id));
  return {
    counts,
    late: list(groups.late),
    incidents: list(groups.incidents),
    readyForRoute: list(groups.readyForRoute),
    staleRoutes: groups.staleRoutes.slice(0, LIST_LIMIT).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      plannedDate: r.plannedDate,
      status: r.status,
      driverName: r.driverName,
    })),
  };
}

/** Cuánto lleva hecho cada ruta. */
export async function routesWithProgress(db: any, routes: any[]): Promise<any[]> {
  if (routes.length === 0) return [];
  const stops: any[] = await db
    .select({
      routeId: schema.routeStops.routeId,
      status: schema.routeStops.status,
      shipmentId: schema.routeStops.shipmentId,
    })
    .from(schema.routeStops)
    .where(
      inArray(
        schema.routeStops.routeId,
        routes.map((r) => r.id),
      ),
    );
  const liveShipments = stops.filter((s) => isLiveStop(s.status) && s.shipmentId);
  const packages: any[] = liveShipments.length
    ? await db
        .select({ shipmentId: schema.packages.shipmentId, weightKg: schema.packages.weightKg })
        .from(schema.packages)
        .where(
          inArray(
            schema.packages.shipmentId,
            liveShipments.map((s) => s.shipmentId),
          ),
        )
    : [];
  const vehicleIds = routes.map((r) => r.vehicleId).filter(Boolean);
  const vehicles: any[] = vehicleIds.length
    ? await db
        .select({ id: schema.vehicles.id, capacityKg: schema.vehicles.capacityKg })
        .from(schema.vehicles)
        .where(inArray(schema.vehicles.id, vehicleIds))
    : [];
  return routes.map((route) => {
    const own = stops.filter((s) => s.routeId === route.id);
    const onBoard = new Set(own.filter((s) => isLiveStop(s.status)).map((s) => s.shipmentId));
    return {
      ...route,
      stopsTotal: own.length,
      stopsOpen: own.filter((s) => isLiveStop(s.status)).length,
      stopsDelivered: own.filter((s) => s.status === 'delivered').length,
      loadKg: packages
        .filter((p) => onBoard.has(p.shipmentId))
        .reduce((sum, p) => sum + Number(p.weightKg || 0), 0),
      capacityKg: vehicles.find((v) => v.id === route.vehicleId)?.capacityKg ?? null,
    };
  });
}

/** Los paquetes con su envío y su cliente. */
export async function packagesWithShipment(db: any, packages: any[]): Promise<any[]> {
  const shipmentIds = [...new Set(packages.map((p) => p.shipmentId).filter(Boolean))] as string[];
  const shipments: any[] = shipmentIds.length
    ? await db.select().from(schema.shipments).where(inArray(schema.shipments.id, shipmentIds))
    : [];
  const enriched = new Map((await enrichShipments(db, shipments)).map((s) => [s.id, s]));
  return packages.map((pkg) => {
    const shipment = pkg.shipmentId ? enriched.get(pkg.shipmentId) : undefined;
    return {
      ...pkg,
      shipmentCode: shipment?.code ?? shipment?.trackingNumber ?? null,
      counterparty: shipment?.counterparty ?? null,
      destinationAddress: shipment?.destinationAddress ?? null,
    };
  });
}
