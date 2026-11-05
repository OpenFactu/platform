/**
 * Rutas de reparto y sus paradas. El estado no se edita: cambia con las acciones
 * (iniciar, finalizar, llegar, entregar, aplazar, incidencia).
 */
import { Router } from 'express';
import { asc, desc, eq, isNull } from 'drizzle-orm';
import crypto from 'crypto';
import * as schema from '../../db/schema';
import {
  addStop,
  arriveAtStop,
  deleteRoute,
  deliverStop,
  finishRoute,
  postponeStop,
  removeStop,
  reportStopIncident,
  startRoute,
} from '../../core/logistics/routeActions';
import { LogisticsError } from '../../core/logistics/shipmentLifecycle';
import { nextLogisticsCode } from '../../core/logistics/logisticsCodes';
import { renderRouteSheet } from '../../core/logistics/logisticsPdf';
import { routesWithProgress } from '../../core/logistics/shipmentViews';
import { getCompanyHeader } from '../../core/reports/ReportRenderer';
import { getRequestLocale } from '../../i18n';
import { routeWarnings } from '../../core/logistics/routeActions';
import { action, contextOf, optionalText, requiredText, sendPdf } from './shared';

const router = Router();

/** Si viene vehicleId, captura snapshot de la matrícula en vehiclePlate. */
async function resolveVehicleSnapshot(client: any, body: any) {
  if (!body.vehicleId) return { vehicleId: null, vehiclePlate: body.vehiclePlate || null };
  const [vehicle] = await client
    .select({ plate: schema.vehicles.plate, status: schema.vehicles.status })
    .from(schema.vehicles)
    .where(eq(schema.vehicles.id, body.vehicleId));
  if (vehicle && vehicle.status !== 'active') {
    throw new LogisticsError(`El vehículo ${vehicle.plate} no está disponible.`);
  }
  return { vehicleId: body.vehicleId, vehiclePlate: vehicle?.plate || body.vehiclePlate || null };
}

router.get(
  '/routes',
  action(async (req, res) => {
    const rows = await req.tenantClient
      .select()
      .from(schema.routes)
      .where(req.query.includeArchived === 'true' ? undefined : isNull(schema.routes.archivedAt))
      .orderBy(desc(schema.routes.plannedDate));
    res.json(await routesWithProgress(req.tenantClient, rows));
  }),
);

router.post(
  '/routes',
  action(async (req) => {
    const body = req.body || {};
    const id = crypto.randomUUID();
    const code = body.code || (await nextLogisticsCode(req.tenantClient, 'RT'));
    const vehicle = await resolveVehicleSnapshot(req.tenantClient, body);
    await req.tenantClient.insert(schema.routes).values({
      id,
      code,
      name: body.name || code,
      plannedDate: body.plannedDate,
      status: 'planned',
      driverName: body.driverName || null,
      driverPhone: body.driverPhone || null,
      driverEmployeeId: body.driverEmployeeId || null,
      vehicleId: vehicle.vehicleId,
      vehiclePlate: vehicle.vehiclePlate,
      notes: body.notes || null,
    });
    return { id, code, warnings: await routeWarnings(req.tenantClient, id) };
  }),
);

router.patch(
  '/routes/:id',
  action(async (req) => {
    const body = req.body || {};
    const patch: any = {};
    for (const field of [
      'name',
      'plannedDate',
      'driverName',
      'driverPhone',
      'driverEmployeeId',
      'vehiclePlate',
      'notes',
    ]) {
      if (field in body) patch[field] = body[field];
    }
    if ('vehicleId' in body) {
      const vehicle = await resolveVehicleSnapshot(req.tenantClient, body);
      patch.vehicleId = vehicle.vehicleId;
      if (!('vehiclePlate' in body)) patch.vehiclePlate = vehicle.vehiclePlate;
    }
    if (Object.keys(patch).length > 0) {
      await req.tenantClient
        .update(schema.routes)
        .set(patch)
        .where(eq(schema.routes.id, req.params.id));
    }
    return { warnings: await routeWarnings(req.tenantClient, req.params.id) };
  }),
);

router.delete(
  '/routes/:id',
  action(async (req) => deleteRoute(await contextOf(req), req.params.id)),
);

router.post(
  '/routes/:id/restore',
  action(async (req) => {
    await req.tenantClient
      .update(schema.routes)
      .set({ archivedAt: null })
      .where(eq(schema.routes.id, req.params.id));
  }),
);

router.post(
  '/routes/:id/start',
  action(async (req) => startRoute(await contextOf(req), req.params.id)),
);

router.post(
  '/routes/:id/finish',
  action(async (req) => finishRoute(await contextOf(req), req.params.id)),
);

router.get(
  '/routes/:id/sheet.pdf',
  action(async (req, res) => {
    const company = await getCompanyHeader(req.tenantClient, req.tenantId);
    const pdf = await renderRouteSheet(req.tenantClient, req.params.id, company, getRequestLocale(req));
    sendPdf(res, pdf, 'hoja-de-ruta.pdf');
  }),
);

router.get(
  '/routes/:id/stops',
  action(async (req, res) => {
    const rows = await req.tenantClient
      .select()
      .from(schema.routeStops)
      .where(eq(schema.routeStops.routeId, req.params.id))
      .orderBy(asc(schema.routeStops.sequence));
    res.json(rows);
  }),
);

router.post(
  '/routes/:id/stops',
  action(async (req) => {
    const body = req.body || {};
    return addStop(await contextOf(req), req.params.id, {
      shipmentId: body.shipmentId || null,
      sequence: body.sequence !== undefined ? Number(body.sequence) : undefined,
      address: body.address || null,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      plannedAt: body.plannedAt ? new Date(body.plannedAt) : null,
      notes: body.notes || null,
    });
  }),
);

/** Datos de la parada, nunca su estado ni la prueba de entrega. */
router.patch(
  '/routes/:rid/stops/:sid',
  action(async (req) => {
    const body = req.body || {};
    if ('status' in body) {
      throw new LogisticsError('El estado de una parada no se edita: usa su acción.', 400);
    }
    const patch: any = {};
    for (const field of ['sequence', 'address', 'lat', 'lng', 'notes']) {
      if (field in body) patch[field] = body[field];
    }
    if ('plannedAt' in body) patch.plannedAt = body.plannedAt ? new Date(body.plannedAt) : null;
    if (Object.keys(patch).length > 0) {
      await req.tenantClient
        .update(schema.routeStops)
        .set(patch)
        .where(eq(schema.routeStops.id, req.params.sid));
    }
  }),
);

router.delete(
  '/routes/:rid/stops/:sid',
  action(async (req) => removeStop(await contextOf(req), req.params.rid, req.params.sid)),
);

router.post(
  '/routes/:rid/stops/:sid/arrive',
  action(async (req) => arriveAtStop(await contextOf(req), req.params.rid, req.params.sid)),
);

router.post(
  '/routes/:rid/stops/:sid/deliver',
  action(async (req) => {
    const body = req.body || {};
    return deliverStop(await contextOf(req), req.params.rid, req.params.sid, {
      recipientName: optionalText(body.recipientName),
      recipientDocument: optionalText(body.recipientDocument),
      signatureImage: body.signatureImage || null,
      photoImage: body.photoImage || null,
      podNotes: optionalText(body.podNotes),
    });
  }),
);

router.post(
  '/routes/:rid/stops/:sid/postpone',
  action(async (req) =>
    postponeStop(
      await contextOf(req),
      req.params.rid,
      req.params.sid,
      optionalText(req.body?.reason),
    ),
  ),
);

router.post(
  '/routes/:rid/stops/:sid/incident',
  action(async (req) =>
    reportStopIncident(
      await contextOf(req),
      req.params.rid,
      req.params.sid,
      requiredText(req.body?.reason, 'Indica qué ha pasado.'),
    ),
  ),
);

export default router;
