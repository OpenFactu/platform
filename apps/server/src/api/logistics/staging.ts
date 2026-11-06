/**
 * Acopios: dónde espera la mercancía a salir, con su QR para el repartidor.
 */
import { Router } from 'express';
import { and, asc, eq, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import QRCode from 'qrcode';
import * as schema from '../../db/schema';
import { geocodeAddress } from '../../core/logistics/geocode';
import { nextLogisticsCode } from '../../core/logistics/logisticsCodes';
import { renderStagingLabels, renderStagingPackingList } from '../../core/logistics/logisticsPdf';
import { getCompanyHeader } from '../../core/reports/ReportRenderer';
import { getRequestLocale } from '../../i18n';
import { action, sendPdf } from './shared';

const router = Router();

router.get('/staging-areas', async (req: any, res) => {
  const rows = await req.tenantClient
    .select()
    .from(schema.stagingAreas)
    .orderBy(asc(schema.stagingAreas.name));
  res.json(rows);
});

// ─────────────────────────────────────────────────────────────────
// PLATAFORMAS AJENAS (cross-docks, naves alquiladas, hubs)
// ─────────────────────────────────────────────────────────────────

router.post('/staging-areas', async (req: any, res) => {
  try {
    const body = req.body || {};
    const id = crypto.randomUUID();
    const code = body.code || (await nextLogisticsCode(req.tenantClient, 'AC'));

    // Si viene platformId, heredamos address/lat/lng de la plataforma si el
    // caller no los impone a mano.
    let address: string | null = body.address || null;
    let lat: number | null = body.lat ?? null;
    let lng: number | null = body.lng ?? null;
    let platformName: string | null = null;
    if (body.platformId) {
      try {
        const [pl] = await req.tenantClient
          .select()
          .from(schema.externalPlatforms)
          .where(eq(schema.externalPlatforms.id, body.platformId));
        if (pl) {
          platformName = pl.name;
          if (!address) address = pl.address || null;
          if (lat == null) lat = pl.lat ?? null;
          if (lng == null) lng = pl.lng ?? null;
        }
      } catch {
        /* ignore */
      }
    }

    // Autogenerar nombre a partir del cliente / plataforma si el usuario lo deja vacío.
    let name = body.name;
    if (!name && body.partnerId) {
      try {
        const [p] = await req.tenantClient
          .select({ name: schema.businessPartners.name })
          .from(schema.businessPartners)
          .where(eq(schema.businessPartners.id, body.partnerId));
        if (p?.name) name = `Acopio ${p.name}`;
      } catch {
        /* ignore */
      }
    }
    if (!name && platformName) name = `Acopio ${platformName}`;
    if (!name) name = code;

    // Geocodificar si hay dirección y no vienen coords.
    if (lat == null && lng == null && address) {
      const coords = await geocodeAddress(address).catch(() => null);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      }
    }

    await req.tenantClient.insert(schema.stagingAreas).values({
      id,
      code,
      name,
      warehouseId: body.warehouseId || null,
      partnerId: body.partnerId || null,
      platformId: body.platformId || null,
      address,
      lat,
      lng,
      notes: body.notes || null,
    });
    res.json({ id, code, name });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/staging-areas/:id', async (req: any, res) => {
  try {
    const body = req.body || {};
    const patch: any = {};
    for (const k of [
      'name',
      'warehouseId',
      'partnerId',
      'platformId',
      'address',
      'lat',
      'lng',
      'notes',
    ]) {
      if (k in body) patch[k] = body[k];
    }
    // Si cambia la dirección y el caller no manda coords, re-geocodificar.
    if ('address' in body && !('lat' in body) && !('lng' in body) && body.address) {
      const coords = await geocodeAddress(body.address).catch(() => null);
      if (coords) {
        patch.lat = coords.lat;
        patch.lng = coords.lng;
      }
    }
    await req.tenantClient
      .update(schema.stagingAreas)
      .set(patch)
      .where(eq(schema.stagingAreas.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/staging-areas/:id', async (req: any, res) => {
  await req.tenantClient
    .delete(schema.stagingAreas)
    .where(eq(schema.stagingAreas.id, req.params.id));
  res.json({ ok: true });
});

// ── Artículos del acopio ─────────────────────────────────────────
router.get('/staging-areas/:id/items', async (req: any, res) => {
  const rows = await req.tenantClient
    .select()
    .from(schema.stagingAreaItems)
    .where(eq(schema.stagingAreaItems.stagingAreaId, req.params.id))
    .orderBy(asc(schema.stagingAreaItems.createdAt));
  res.json(rows);
});

router.post('/staging-areas/:id/items', async (req: any, res) => {
  try {
    const body = req.body || {};
    if (!body.itemId) return res.status(400).json({ error: 'itemId es obligatorio.' });
    const id = crypto.randomUUID();
    await req.tenantClient.insert(schema.stagingAreaItems).values({
      id,
      stagingAreaId: req.params.id,
      itemId: body.itemId,
      expectedQty: body.expectedQty ?? null,
      notes: body.notes || null,
    });
    res.json({ id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/staging-areas/:id/items/:itemRowId', async (req: any, res) => {
  const body = req.body || {};
  const patch: any = {};
  for (const k of ['expectedQty', 'notes']) if (k in body) patch[k] = body[k];
  await req.tenantClient
    .update(schema.stagingAreaItems)
    .set(patch)
    .where(eq(schema.stagingAreaItems.id, req.params.itemRowId));
  res.json({ ok: true });
});

router.delete('/staging-areas/:id/items/:itemRowId', async (req: any, res) => {
  await req.tenantClient
    .delete(schema.stagingAreaItems)
    .where(eq(schema.stagingAreaItems.id, req.params.itemRowId));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────
// DRIVER · Mis rutas
//
// Para los usuarios que son a la vez empleados asignados como conductor.
// Devuelve las rutas donde `driverEmployeeId = employee(userId=currentUser)`.
// ─────────────────────────────────────────────────────────────────

// Devuelve un PNG con un payload JSON estable que el repartidor escanea. El
// payload identifica el acopio, la ruta activa (si hay) y los paquetes asignados.

export async function buildStagingPayload(tenantClient: any, tenantId: string, stagingAreaId: string) {
  const [area] = await tenantClient
    .select()
    .from(schema.stagingAreas)
    .where(eq(schema.stagingAreas.id, stagingAreaId));
  if (!area) throw new Error('Acopio no encontrado');

  // Paquetes actualmente en este acopio.
  const allPkgs = await tenantClient
    .select()
    .from(schema.packages)
    .where(eq(schema.packages.stagingAreaId, stagingAreaId));

  // Envíos vinculados a esos paquetes (si los tienen). Los terminales
  // (entregado/devuelto/cancelado) ya no cuentan como mercancía pendiente:
  // se filtran del payload junto con sus paquetes, para que el QR y el
  // packing list reflejen solo lo que queda por salir.
  const TERMINAL_SHIP = ['delivered', 'returned', 'cancelled'];
  const allShipmentIds = [
    ...new Set(allPkgs.map((p: any) => p.shipmentId).filter(Boolean)),
  ] as string[];
  let shipments: any[] = [];
  if (allShipmentIds.length > 0) {
    shipments = await tenantClient
      .select()
      .from(schema.shipments)
      .where(inArray(schema.shipments.id, allShipmentIds));
  }
  const terminalShipIds = new Set(
    shipments
      .filter(
        (s: any) =>
          TERMINAL_SHIP.includes(s.status || '') ||
          TERMINAL_SHIP.includes(s.preparationStatus || ''),
      )
      .map((s: any) => s.id),
  );
  shipments = shipments.filter((s: any) => !terminalShipIds.has(s.id));
  const pkgs = allPkgs.filter((p: any) => !p.shipmentId || !terminalShipIds.has(p.shipmentId));
  const shipmentIds = shipments.map((s: any) => s.id);

  // Rutas VIVAS (planificadas/activas) con paradas aún abiertas para esos
  // envíos — una ruta completada o una parada ya cerrada no pinta nada en
  // el acopio.
  let routesWithDriver: any[] = [];
  if (shipmentIds.length > 0) {
    const stops = await tenantClient
      .select()
      .from(schema.routeStops)
      .where(
        and(
          inArray(schema.routeStops.shipmentId, shipmentIds),
          inArray(schema.routeStops.status, ['pending', 'en_route', 'arrived']),
        ),
      );
    const routeIds = [...new Set(stops.map((s: any) => s.routeId).filter(Boolean))] as string[];
    if (routeIds.length > 0) {
      routesWithDriver = await tenantClient
        .select()
        .from(schema.routes)
        .where(
          and(
            inArray(schema.routes.id, routeIds),
            inArray(schema.routes.status, ['planned', 'active']),
          ),
        );
    }
  }

  return {
    v: 1,
    tenantId,
    staging: { id: area.id, code: area.code, name: area.name },
    packages: pkgs.map((p: any) => ({
      id: p.id,
      code: p.code,
      status: p.status,
      shipmentId: p.shipmentId,
    })),
    shipments: shipments.map((s: any) => ({
      id: s.id,
      code: s.code || s.trackingNumber || s.id.slice(0, 8),
      status: s.status,
      destinationAddress: s.destinationAddress,
      destinationLat: s.destinationLat,
      destinationLng: s.destinationLng,
    })),
    routes: routesWithDriver.map((r: any) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      driverEmployeeId: r.driverEmployeeId,
      driverName: r.driverName,
      vehiclePlate: r.vehiclePlate,
    })),
    issuedAt: Date.now(),
  };
}

// JSON: útil para debug y para la app móvil que prefiere parsear directo.
router.get('/staging-areas/:id/payload', async (req: any, res) => {
  try {
    const payload = await buildStagingPayload(req.tenantClient, req.tenantId, req.params.id);
    res.json(payload);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PNG: para imprimir y pegar en el acopio físicamente.
router.get('/staging-areas/:id/qr.png', async (req: any, res) => {
  try {
    const payload = await buildStagingPayload(req.tenantClient, req.tenantId, req.params.id);
    // Como los payloads grandes pueden exceder la capacidad del QR, metemos
    // solo un "shortcut": id del acopio + tenant. El repartidor, al escanear,
    // carga el payload completo desde la API.
    const shortcut = {
      v: 1,
      t: payload.tenantId,
      s: payload.staging.id,
    };
    const png = await QRCode.toBuffer(JSON.stringify(shortcut), {
      type: 'png',
      errorCorrectionLevel: 'M',
      width: 600,
      margin: 2,
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(png);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint del repartidor: dado el shortcut escaneado, devuelve el payload
// completo SI el usuario está asignado a una de las rutas del acopio.
router.post('/staging-areas/:id/scan', async (req: any, res) => {
  try {
    const payload = await buildStagingPayload(req.tenantClient, req.tenantId, req.params.id);
    const currentUserId = req.user?.id;
    // Resolvemos si el usuario actual es driver de alguna de las rutas.
    const employee = currentUserId
      ? await req.tenantClient
          .select({ id: schema.employees.id })
          .from(schema.employees)
          .where(eq(schema.employees.userId, currentUserId))
          .then((r: any[]) => r[0])
      : null;
    const employeeId = employee?.id;
    const myRoutes = payload.routes.filter(
      (r: any) => r.driverEmployeeId && r.driverEmployeeId === employeeId,
    );
    res.json({
      ...payload,
      isAssignedDriver: myRoutes.length > 0,
      myRoutes,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


router.get(
  '/staging-areas/:id/labels.pdf',
  action(async (req, res) => {
    const company = await getCompanyHeader(req.tenantClient, req.tenantId);
    const pdf = await renderStagingLabels(req.tenantClient, req.params.id, company, getRequestLocale(req));
    sendPdf(res, pdf, 'etiquetas.pdf');
  }),
);

router.get(
  '/staging-areas/:id/packing-list.pdf',
  action(async (req, res) => {
    const company = await getCompanyHeader(req.tenantClient, req.tenantId);
    const pdf = await renderStagingPackingList(req.tenantClient, req.params.id, company, getRequestLocale(req));
    sendPdf(res, pdf, 'packing-list.pdf');
  }),
);

export default router;
