/**
 * Mis rutas: lo que ve quien es empleado y conductor asignado. Devuelve las rutas
 * con `driverEmployeeId = employee(userId = usuario actual)`.
 */
import { Router } from 'express';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { routesWithProgress } from '../../core/logistics/shipmentViews';
import { createAppReport } from '../../core/logistics/appReports';
import { appMap, getDeliveryFlow, proofProblem } from '../../core/logistics/deliveryFlow';
import {
  dropAtStaging,
  listStagingAreas,
  markPackageLoaded,
  packagesToLoad,
} from '../../core/logistics/loadOut';
import {
  arriveAtStop,
  deliverStop,
  finishRoute,
  loadRoute,
  postponeStop,
  reportStopIncident,
  startRoute,
} from '../../core/logistics/routeActions';
import { LogisticsError } from '../../core/logistics/shipmentLifecycle';
import { permissionsForRequest } from '../middleware/requirePermission';
import { action, contextOf, optionalText, requiredText, requireLogisticsScope } from './shared';
import { buildStagingPayload } from './staging';

const router = Router();

router.use(requireLogisticsScope);

/** El empleado del usuario: es lo que une a una persona con sus rutas. */
async function employeeIdOf(req: any): Promise<string | null> {
  if (!req.user?.id) return null;
  const [employee] = await req.tenantClient
    .select({ id: schema.employees.id })
    .from(schema.employees)
    .where(eq(schema.employees.userId, req.user.id));
  return employee?.id ?? null;
}

/** Solo el conductor asignado, un administrador o un token de API con su scope. */
async function assertOwnRoute(req: any, routeId: string) {
  const route = await loadRoute(req.tenantClient, routeId);
  if (req.apiToken || (await permissionsForRequest(req)) === null) return route;
  const employeeId = await employeeIdOf(req);
  if (!employeeId || route.driverEmployeeId !== employeeId) {
    throw new LogisticsError('No puedes operar esta ruta', 403);
  }
  return route;
}

router.post(
  '/routes/:id/start',
  action(async (req) => {
    await assertOwnRoute(req, req.params.id);
    const flow = await getDeliveryFlow(req.tenantClient);
    if (flow.loadOut !== 'off' && flow.loadOutRequired) {
      const missing = await packagesToLoad(req.tenantClient, req.params.id);
      if (missing.length > 0) {
        throw new LogisticsError(`Bultos por cargar: ${missing.length}.`, 409);
      }
    }
    return startRoute(await contextOf(req), req.params.id);
  }),
);

router.post(
  '/routes/:id/finish',
  action(async (req) => {
    await assertOwnRoute(req, req.params.id);
    return finishRoute(await contextOf(req), req.params.id);
  }),
);

router.post(
  '/routes/:rid/stops/:sid/arrive',
  action(async (req) => {
    await assertOwnRoute(req, req.params.rid);
    return arriveAtStop(await contextOf(req), req.params.rid, req.params.sid);
  }),
);

router.post(
  '/routes/:rid/stops/:sid/deliver',
  action(async (req) => {
    await assertOwnRoute(req, req.params.rid);
    const body = req.body || {};
    const proof = {
      recipientName: optionalText(body.recipientName),
      recipientDocument: optionalText(body.recipientDocument),
      signatureImage: body.signatureImage || null,
      photoImage: body.photoImage || null,
      podNotes: optionalText(body.podNotes),
      handover: optionalText(body.handover),
    };
    const problem = proofProblem(await getDeliveryFlow(req.tenantClient), proof);
    if (problem) throw new LogisticsError(problem, 400);
    return deliverStop(await contextOf(req), req.params.rid, req.params.sid, proof);
  }),
);

router.post(
  '/routes/:rid/stops/:sid/postpone',
  action(async (req) => {
    await assertOwnRoute(req, req.params.rid);
    return postponeStop(
      await contextOf(req),
      req.params.rid,
      req.params.sid,
      optionalText(req.body?.reason),
    );
  }),
);

router.post(
  '/routes/:rid/stops/:sid/incident',
  action(async (req) => {
    await assertOwnRoute(req, req.params.rid);
    return reportStopIncident(
      await contextOf(req),
      req.params.rid,
      req.params.sid,
      requiredText(req.body?.reason, 'Indica qué ha pasado.'),
    );
  }),
);

router.post(
  '/routes/:id/packages/:packageId/load',
  action(async (req) => {
    await assertOwnRoute(req, req.params.id);
    return markPackageLoaded(
      req.tenantClient,
      req.params.id,
      req.params.packageId,
      req.body?.loaded !== false,
    );
  }),
);

router.post(
  '/routes/:id/drop',
  action(async (req) => {
    await assertOwnRoute(req, req.params.id);
    const flow = await getDeliveryFlow(req.tenantClient);
    if (!flow.stagingDrop) {
      throw new LogisticsError('Tu empresa no permite dejar bultos en un acopio.', 403);
    }
    return dropAtStaging(await contextOf(req), req.params.id, req.body || {});
  }),
);

router.get(
  '/staging-areas',
  action(async (req, res) => {
    res.json(await listStagingAreas(req.tenantClient));
  }),
);

router.get(
  '/map-config',
  action(async (req, res) => {
    res.json(appMap(await getDeliveryFlow(req.tenantClient)));
  }),
);

router.post(
  '/app-reports',
  action(async (req) => createAppReport(req.tenantClient, req.tenantId, req.user, req.body)),
);

/** Lo que el conductor necesita saber al escanear un bulto. */
router.get(
  '/packages/:id',
  action(async (req) => {
    const [pkg] = await req.tenantClient
      .select()
      .from(schema.packages)
      .where(eq(schema.packages.id, req.params.id));
    if (!pkg) throw new LogisticsError('Paquete no encontrado', 404);
    const [shipment] = pkg.shipmentId
      ? await req.tenantClient
          .select()
          .from(schema.shipments)
          .where(eq(schema.shipments.id, pkg.shipmentId))
      : [null];
    return {
      code: pkg.code,
      status: pkg.status,
      weightKg: pkg.weightKg,
      shipmentCode: shipment?.code ?? null,
      trackingNumber: shipment?.trackingNumber ?? null,
      destinationAddress: shipment?.destinationAddress ?? null,
      shipmentStatus: shipment?.status ?? null,
    };
  }),
);

router.get(
  '/staging-areas/:id',
  action(async (req) => buildStagingPayload(req.tenantClient, req.tenantId, req.params.id)),
);

router.get('/routes', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'no auth' });
    const [emp] = await req.tenantClient
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.userId, userId));
    if (!emp) return res.json([]);
    const rows = await req.tenantClient
      .select()
      .from(schema.routes)
      .where(and(eq(schema.routes.driverEmployeeId, emp.id), isNull(schema.routes.archivedAt)))
      .orderBy(desc(schema.routes.plannedDate));
    res.json(await routesWithProgress(req.tenantClient, rows));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/routes/:id', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'no auth' });
    const [emp] = await req.tenantClient
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.userId, userId));
    if (!emp) return res.status(403).json({ error: 'no employee' });
    const [route] = await req.tenantClient
      .select()
      .from(schema.routes)
      .where(and(eq(schema.routes.id, req.params.id), eq(schema.routes.driverEmployeeId, emp.id)));
    if (!route) return res.status(404).json({ error: 'no encontrado' });
    const stops = await req.tenantClient
      .select()
      .from(schema.routeStops)
      .where(eq(schema.routeStops.routeId, route.id))
      .orderBy(asc(schema.routeStops.sequence));
    const shipmentIds = stops
      .map((s: any) => s.shipmentId)
      .filter((x: string | null): x is string => !!x);
    const shipments = shipmentIds.length
      ? await req.tenantClient
          .select()
          .from(schema.shipments)
          .where(inArray(schema.shipments.id, shipmentIds))
      : [];

    // Fallback: si algún shipment no tiene recipientPhone/Name/Email pero
    // viene de un SDN/PDN con partnerId, resolvemos desde el partner. Así
    // los botones de llamar/WhatsApp funcionan aunque el shipment no tenga
    // los campos standalone rellenados.
    const dnIds = shipments
      .filter(
        (s: any) =>
          s.deliveryNoteId && (!s.recipientPhone || !s.recipientName || !s.recipientEmail),
      )
      .map((s: any) => s.deliveryNoteId);
    if (dnIds.length > 0) {
      const [sdns, pdns] = await Promise.all([
        req.tenantClient
          .select({
            id: schema.salesDeliveryNotes.id,
            partnerId: schema.salesDeliveryNotes.partnerId,
          })
          .from(schema.salesDeliveryNotes)
          .where(inArray(schema.salesDeliveryNotes.id, dnIds)),
        req.tenantClient
          .select({
            id: schema.purchaseDeliveryNotes.id,
            partnerId: schema.purchaseDeliveryNotes.partnerId,
          })
          .from(schema.purchaseDeliveryNotes)
          .where(inArray(schema.purchaseDeliveryNotes.id, dnIds)),
      ]);
      const dnToPartner = new Map<string, string>();
      for (const s of [...sdns, ...pdns] as any[]) {
        if (s.partnerId) dnToPartner.set(s.id, s.partnerId);
      }
      const partnerIds = [...new Set(dnToPartner.values())];
      if (partnerIds.length > 0) {
        const partners = await req.tenantClient
          .select({
            id: schema.businessPartners.id,
            name: schema.businessPartners.name,
            phone: schema.businessPartners.phone,
            email: schema.businessPartners.email,
          })
          .from(schema.businessPartners)
          .where(inArray(schema.businessPartners.id, partnerIds));
        const partnerMap = new Map<string, any>(partners.map((p: any) => [p.id, p]));
        for (const s of shipments as any[]) {
          if (!s.deliveryNoteId) continue;
          const pid = dnToPartner.get(s.deliveryNoteId);
          if (!pid) continue;
          const p = partnerMap.get(pid);
          if (!p) continue;
          if (!s.recipientName) s.recipientName = p.name || null;
          if (!s.recipientPhone) s.recipientPhone = p.phone || null;
          if (!s.recipientEmail) s.recipientEmail = p.email || null;
        }
      }
    }

    // Vehículo detallado — matrícula, marca, modelo, capacidad, etc.
    let vehicle: any = null;
    if (route.vehicleId) {
      const [v] = await req.tenantClient
        .select()
        .from(schema.vehicles)
        .where(eq(schema.vehicles.id, route.vehicleId));
      if (v) vehicle = v;
    }

    // Puntos de recogida (pickup): acopios que contienen paquetes de los
    // shipments de esta ruta. Útiles para que el repartidor sepa dónde
    // cargar antes de empezar. Incluimos la plataforma externa si el acopio
    // está vinculado a una.
    let pickups: any[] = [];
    let packages: any[] = [];
    if (shipmentIds.length > 0) {
      packages = await req.tenantClient
        .select({
          id: schema.packages.id,
          code: schema.packages.code,
          shipmentId: schema.packages.shipmentId,
          stagingAreaId: schema.packages.stagingAreaId,
          weightKg: schema.packages.weightKg,
          status: schema.packages.status,
          loadedAt: schema.packages.loadedAt,
        })
        .from(schema.packages)
        .where(inArray(schema.packages.shipmentId, shipmentIds));
      const stagingIds = [
        ...new Set(packages.map((p: any) => p.stagingAreaId).filter(Boolean)),
      ] as string[];
      if (stagingIds.length > 0) {
        const areas = await req.tenantClient
          .select()
          .from(schema.stagingAreas)
          .where(inArray(schema.stagingAreas.id, stagingIds));
        const platformIds = [
          ...new Set(areas.map((a: any) => a.platformId).filter(Boolean)),
        ] as string[];
        let platformMap = new Map<string, any>();
        if (platformIds.length > 0) {
          const plats = await req.tenantClient
            .select()
            .from(schema.externalPlatforms)
            .where(inArray(schema.externalPlatforms.id, platformIds));
          platformMap = new Map(plats.map((p: any) => [p.id, p] as const));
        }
        const packageCountByStaging = new Map<string, number>();
        for (const p of packages) {
          if (!p.stagingAreaId) continue;
          packageCountByStaging.set(
            p.stagingAreaId,
            (packageCountByStaging.get(p.stagingAreaId) || 0) + 1,
          );
        }
        pickups = areas.map((a: any) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          address: a.address,
          lat: a.lat,
          lng: a.lng,
          packageCount: packageCountByStaging.get(a.id) || 0,
          platform: a.platformId ? platformMap.get(a.platformId) || null : null,
        }));
      }
    }

    const flow = await getDeliveryFlow(req.tenantClient);
    res.json({
      route,
      stops,
      shipments,
      vehicle,
      pickups,
      packages,
      flow: { ...flow, map: appMap(flow) },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
