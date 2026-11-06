/**
 * Envíos. El estado no se edita con un PATCH: cambia con las acciones de abajo,
 * que comprueban las reglas de `shipmentLifecycle` y guardan todo de una vez.
 */
import { Router } from 'express';
import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import crypto from 'crypto';
import * as schema from '../../db/schema';
import {
  cancelShipment,
  createShipment,
  deleteShipment,
  deliverShipment,
  dispatchShipment,
  markReady,
  moveToStaging,
  postponeShipment,
  receiveShipment,
  reportIncident,
  resolveIncident,
  returnShipment,
  schedulePickup,
  updateShipmentData,
} from '../../core/logistics/shipmentActions';
import {
  LIVE_STOP_STATES,
  LogisticsError,
  ROUTABLE_STATES,
  stateOf,
} from '../../core/logistics/shipmentLifecycle';
import { isNotifiableStage } from '../../core/logistics/shipmentTransitions';
import { notifyShipmentStageChange } from '../../core/logistics/shipmentNotifications';
import { enrichShipments, shipmentDetail, todaySummary } from '../../core/logistics/shipmentViews';
import {
  carrierLabel,
  dispatchWithCarrier,
  listCarrierAccounts,
  refreshCarrierTracking,
} from '../../core/logistics/carrierDispatch';
import { getAppReport, listAppReports, setAppReportStatus } from '../../core/logistics/appReports';
import { getDeliveryFlow, saveDeliveryFlow } from '../../core/logistics/deliveryFlow';
import { logisticsSummary } from '../../core/logistics/logisticsReports';
import { renderPackingList, renderShipmentLabels } from '../../core/logistics/logisticsPdf';
import { getCompanyHeader } from '../../core/reports/ReportRenderer';
import { getRequestLocale } from '../../i18n';
import { action, contextOf, optionalText, requiredText, sendPdf } from './shared';

const router = Router();

/**
 * Listado de envíos con filtros y paginación server-side.
 *
 * Query params:
 *   q                  búsqueda ILIKE en trackingNumber / destinationAddress / driverName
 *   status             CSV de status legacy (pending,in_transit,...)
 *   preparationStatus  CSV del ciclo de preparación (draft,picking,...)
 *   routeId            filtra por envíos asignados a ese routeStop
 *   fromDate / toDate  ISO date range sobre createdAt
 *   includeArchived    también los archivados (por defecto, no)
 *   page               1-based (default 1)
 *   pageSize           default 50, max 200
 *
 * Devuelve { rows, total, page, pageSize }.
 */
router.get('/shipments', async (req: any, res) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    const statusCsv = (req.query.status as string | undefined)?.trim();
    const prepCsv = (req.query.preparationStatus as string | undefined)?.trim();
    const routeId = (req.query.routeId as string | undefined)?.trim();
    const fromDate = (req.query.fromDate as string | undefined)?.trim();
    const toDate = (req.query.toDate as string | undefined)?.trim();
    // Modo "legacy": si el caller no pasa `page`/`pageSize` ni filtros,
    // devolvemos array plano (retrocompatible con PreparationTab, DriverApp,
    // etc. que cargan shipments sin paginar). Si hay cualquier query param,
    // devolvemos `{ rows, total, page, pageSize }`.
    const paginated =
      req.query.page !== undefined ||
      req.query.pageSize !== undefined ||
      req.query.q !== undefined ||
      req.query.status !== undefined ||
      req.query.preparationStatus !== undefined ||
      req.query.routeId !== undefined ||
      req.query.fromDate !== undefined ||
      req.query.toDate !== undefined ||
      req.query.direction !== undefined ||
      req.query.includeArchived !== undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));

    const conds: any[] = [];
    if (req.query.includeArchived !== 'true') conds.push(isNull(schema.shipments.archivedAt));
    if (q && q.length > 0) {
      const like = `%${q}%`;
      conds.push(
        or(
          ilike(schema.shipments.code, like),
          ilike(schema.shipments.trackingNumber, like),
          ilike(schema.shipments.destinationAddress, like),
          ilike(schema.shipments.driverName, like),
          ilike(schema.shipments.recipientName, like),
          // El cliente o proveedor del albarán de origen.
          sql`${schema.shipments.deliveryNoteId} IN (
            SELECT n.id FROM "SalesDeliveryNote" n
              JOIN "BusinessPartner" b ON b.id = n."partnerId" WHERE b.name ILIKE ${like}
            UNION ALL
            SELECT n.id FROM "PurchaseDeliveryNote" n
              JOIN "BusinessPartner" b ON b.id = n."partnerId" WHERE b.name ILIKE ${like}
          )`,
        ),
      );
    }
    if (statusCsv) {
      const arr = statusCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      // Las dos columnas: las filas sin migrar pueden tener el estado en cualquiera.
      if (arr.length > 0) {
        conds.push(
          or(
            inArray(schema.shipments.status, arr),
            inArray(schema.shipments.preparationStatus, arr),
          ),
        );
      }
    }
    if (req.query.direction === 'in') conds.push(eq(schema.shipments.sourceDocType, 'PDN'));
    if (req.query.direction === 'pickup') conds.push(eq(schema.shipments.kind, 'pickup_return'));
    if (req.query.direction === 'out') {
      conds.push(
        and(
          eq(schema.shipments.kind, 'delivery'),
          sql`${schema.shipments.sourceDocType} IS DISTINCT FROM 'PDN'`,
        ),
      );
    }
    if (prepCsv) {
      const arr = prepCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (arr.length > 0) conds.push(inArray(schema.shipments.preparationStatus, arr));
    }
    if (fromDate) conds.push(gte(schema.shipments.createdAt, new Date(fromDate)));
    if (toDate) conds.push(lte(schema.shipments.createdAt, new Date(toDate)));
    if (routeId) {
      // Subquery: IDs de shipment con una parada en esa ruta.
      const stops = await req.tenantClient
        .select({ shipmentId: schema.routeStops.shipmentId })
        .from(schema.routeStops)
        .where(eq(schema.routeStops.routeId, routeId));
      const ids = stops.map((s: any) => s.shipmentId).filter((x: any): x is string => !!x);
      if (ids.length === 0) {
        return res.json({ rows: [], total: 0, page, pageSize });
      }
      conds.push(inArray(schema.shipments.id, ids));
    }

    const where = conds.length > 0 ? and(...conds) : undefined;

    const [{ count }] = await req.tenantClient
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.shipments)
      .where(where as any);

    const rows = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(where as any)
      .orderBy(desc(schema.shipments.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    if (!paginated) {
      // Retrocompat: array plano para llamadas sin filtros/paginación.
      res.json(rows);
    } else {
      res.json({
        rows: await enrichShipments(req.tenantClient, rows),
        total: Number(count) || 0,
        page,
        pageSize,
      });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Lo que se puede poner en una ruta: los envíos sin parada viva, incluidos los
 * aplazados y con incidencia que hay que reintentar. Las paradas cerradas de otros
 * intentos no cuentan.
 */
router.get(
  '/shipments/unrouted',
  action(async (req, res) => {
    const assigned = await req.tenantClient
      .select({ shipmentId: schema.routeStops.shipmentId })
      .from(schema.routeStops)
      .where(
        and(
          isNotNull(schema.routeStops.shipmentId),
          inArray(schema.routeStops.status, LIVE_STOP_STATES as string[]),
        ),
      );
    const onRoute = new Set(assigned.map((r: any) => r.shipmentId));
    const rows = await req.tenantClient
      .select({
        id: schema.shipments.id,
        code: schema.shipments.code,
        trackingNumber: schema.shipments.trackingNumber,
        status: schema.shipments.status,
        preparationStatus: schema.shipments.preparationStatus,
        destinationAddress: schema.shipments.destinationAddress,
        destinationLat: schema.shipments.destinationLat,
        destinationLng: schema.shipments.destinationLng,
        createdAt: schema.shipments.createdAt,
      })
      .from(schema.shipments)
      .where(isNull(schema.shipments.archivedAt))
      .orderBy(desc(schema.shipments.createdAt))
      .limit(500);
    res.json(rows.filter((r: any) => !onRoute.has(r.id) && ROUTABLE_STATES.includes(stateOf(r))));
  }),
);

router.get('/shipments/by-doc/:docType/:docId', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(
        and(
          eq(schema.shipments.sourceDocType, req.params.docType),
          eq(schema.shipments.sourceDocId, req.params.docId),
        ),
      )
      .orderBy(desc(schema.shipments.createdAt));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get(
  '/today',
  action(async (req) => todaySummary(req.tenantClient)),
);

router.get(
  '/reports/summary',
  action(async (req) =>
    logisticsSummary(req.tenantClient, {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    }),
  ),
);

router.get(
  '/delivery-flow',
  action(async (req, res) => {
    res.json(await getDeliveryFlow(req.tenantClient));
  }),
);

router.put(
  '/delivery-flow',
  action(async (req, res) => {
    res.json(await saveDeliveryFlow(req.tenantClient, req.body));
  }),
);

router.get(
  '/app-reports',
  action(async (req, res) => {
    res.json(await listAppReports(req.tenantClient));
  }),
);

router.get(
  '/app-reports/:id',
  action(async (req, res) => {
    res.json(await getAppReport(req.tenantClient, req.params.id));
  }),
);

router.patch(
  '/app-reports/:id',
  action(async (req) => setAppReportStatus(req.tenantClient, req.params.id, req.body?.status)),
);

router.get(
  '/carrier-accounts',
  action(async (req, res) => {
    res.json(await listCarrierAccounts(req.tenantClient));
  }),
);

router.get(
  '/shipments/:id/detail',
  action(async (req) => shipmentDetail(req.tenantClient, req.params.id)),
);

router.get('/shipments/:id', async (req: any, res) => {
  try {
    const [row] = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(eq(schema.shipments.id, req.params.id));
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/shipments/:id/track', async (req: any, res) => {
  try {
    const [sh] = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(eq(schema.shipments.id, req.params.id));
    if (!sh) return res.status(404).json({ error: 'Shipment no encontrado.' });

    const [events, positions, pkgs, tasks] = await Promise.all([
      req.tenantClient
        .select()
        .from(schema.shipmentEvents)
        .where(eq(schema.shipmentEvents.shipmentId, sh.id))
        .orderBy(desc(schema.shipmentEvents.createdAt))
        .limit(100),
      req.tenantClient
        .select()
        .from(schema.shipmentPositions)
        .where(eq(schema.shipmentPositions.shipmentId, sh.id))
        .orderBy(desc(schema.shipmentPositions.reportedAt))
        .limit(100),
      req.tenantClient.select().from(schema.packages).where(eq(schema.packages.shipmentId, sh.id)),
      req.tenantClient
        .select()
        .from(schema.pickingTasks)
        .where(eq(schema.pickingTasks.shipmentId, sh.id)),
    ]);
    res.json({ shipment: sh, events, positions, packages: pkgs, tasks });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get(
  '/shipments/:id/labels.pdf',
  action(async (req, res) => {
    const company = await getCompanyHeader(req.tenantClient, req.tenantId);
    const pdf = await renderShipmentLabels(
      req.tenantClient,
      req.params.id,
      company,
      getRequestLocale(req),
    );
    sendPdf(res, pdf, 'etiquetas.pdf');
  }),
);

router.get(
  '/shipments/:id/packing-list.pdf',
  action(async (req, res) => {
    const company = await getCompanyHeader(req.tenantClient, req.tenantId);
    const pdf = await renderPackingList(
      req.tenantClient,
      req.params.id,
      company,
      getRequestLocale(req),
    );
    sendPdf(res, pdf, 'packing-list.pdf');
  }),
);

router.post(
  '/shipments',
  action(async (req) => createShipment(await contextOf(req), req.body || {})),
);

router.patch(
  '/shipments/:id',
  action(async (req) => updateShipmentData(await contextOf(req), req.params.id, req.body || {})),
);

router.delete(
  '/shipments/:id',
  action(async (req) => deleteShipment(await contextOf(req), req.params.id)),
);

router.post(
  '/shipments/:id/restore',
  action(async (req) => {
    await req.tenantClient
      .update(schema.shipments)
      .set({ archivedAt: null })
      .where(eq(schema.shipments.id, req.params.id));
  }),
);

/**
 * Reenvía al destinatario el aviso de la etapa en la que está el envío. No sirve
 * para avisar de otra: un cliente no puede recibir "entregado" de un envío que
 * sigue en el almacén.
 */
router.post(
  '/shipments/:id/notify',
  action(async (req) => {
    const [shipment] = await req.tenantClient
      .select({
        status: schema.shipments.status,
        preparationStatus: schema.shipments.preparationStatus,
      })
      .from(schema.shipments)
      .where(eq(schema.shipments.id, req.params.id));
    if (!shipment) throw new LogisticsError('Envío no encontrado', 404);
    const state = stateOf(shipment);
    const stage = req.body?.stage || state;
    if ((stage !== state && stage !== shipment.status) || !isNotifiableStage(stage)) {
      throw new LogisticsError('El envío no está en esa etapa.');
    }
    const ctx = await contextOf(req);
    await notifyShipmentStageChange(ctx.db, ctx.tenantId, req.params.id, stage, ctx.baseUrl);
    return { stage, hint: 'Revisa los logs del server y el cockpit de MailQueue.' };
  }),
);

router.post(
  '/shipments/:id/ready',
  action(async (req) => markReady(await contextOf(req), req.params.id)),
);

router.post(
  '/shipments/:id/dispatch',
  action(async (req) => dispatchShipment(await contextOf(req), req.params.id, req.body?.routeId)),
);

router.post(
  '/shipments/:id/carrier-dispatch',
  action(async (req) =>
    dispatchWithCarrier(await contextOf(req), req.params.id, {
      carrierAccountId: req.body?.carrierAccountId,
      trackingNumber: req.body?.trackingNumber,
    }),
  ),
);

router.post(
  '/shipments/:id/carrier-refresh',
  action(async (req) => refreshCarrierTracking(await contextOf(req), req.params.id)),
);

router.get(
  '/shipments/:id/carrier-label.pdf',
  action(async (req, res) => {
    sendPdf(res, await carrierLabel(req.tenantClient, req.params.id), 'etiqueta-transportista.pdf');
  }),
);

router.post(
  '/shipments/:id/receive',
  action(async (req) => receiveShipment(await contextOf(req), req.params.id)),
);

router.post(
  '/shipments/:id/deliver',
  action(async (req) => deliverShipment(await contextOf(req), req.params.id)),
);

router.post(
  '/shipments/:id/postpone',
  action(async (req) =>
    postponeShipment(await contextOf(req), req.params.id, optionalText(req.body?.reason)),
  ),
);

router.post(
  '/shipments/:id/incident',
  action(async (req) =>
    reportIncident(
      await contextOf(req),
      req.params.id,
      requiredText(req.body?.reason, 'Indica qué ha pasado.'),
    ),
  ),
);

router.post(
  '/shipments/:id/resolve',
  action(async (req) => resolveIncident(await contextOf(req), req.params.id)),
);

router.post(
  '/shipments/:id/cancel',
  action(async (req) => {
    const body = req.body || {};
    const { deliveryNoteCancelled, hint } = await cancelShipment(
      await contextOf(req),
      req.params.id,
      { reason: optionalText(body.reason), cancelDeliveryNote: !!body.cancelDeliveryNote },
    );
    return { deliveryNoteCancelled, deliveryNoteHint: hint };
  }),
);

router.post(
  '/shipments/:id/return',
  action(async (req) => {
    const body = req.body || {};
    const result = await returnShipment(await contextOf(req), req.params.id, {
      reason: optionalText(body.reason),
      warehouseId: body.warehouseId || null,
      cancelDeliveryNote: !!body.cancelDeliveryNote,
    });
    return {
      ...result,
      hint: result.receiptId
        ? 'Se creó una recepción en borrador. Revísala y contabilízala para que suba el stock.'
        : result.alreadyReturned
          ? 'Esta mercancía ya había vuelto con un abono: no se crea otra entrada.'
          : result.isPurchase
            ? 'Una compra devuelta no crea entrada: su mercancía entró con el albarán.'
            : 'Sin almacén de origen: crea la entrada de la devolución a mano.',
    };
  }),
);

router.post(
  '/shipments/:id/schedule-pickup',
  action(async (req) => {
    const body = req.body || {};
    const result = await schedulePickup(await contextOf(req), req.params.id, {
      reason: optionalText(body.reason),
      warehouseId: body.warehouseId || null,
    });
    return {
      ...result,
      hint: 'Añade la recogida a una ruta desde el planificador: el conductor verá "Recoger de" en su app.',
    };
  }),
);

router.post(
  '/shipments/:id/to-staging',
  action(async (req) =>
    moveToStaging(await contextOf(req), req.params.id, req.body?.stagingAreaId || null),
  ),
);

router.get('/shipments/:id/events', async (req: any, res) => {
  const rows = await req.tenantClient
    .select()
    .from(schema.shipmentEvents)
    .where(eq(schema.shipmentEvents.shipmentId, req.params.id))
    .orderBy(desc(schema.shipmentEvents.createdAt));
  res.json(rows);
});

/** Notas e incidencias en el historial. Un cambio de estado no se escribe a mano. */
router.post(
  '/shipments/:id/events',
  action(async (req) => {
    const body = req.body || {};
    if (body.kind === 'status_change') {
      throw new LogisticsError('Un cambio de estado no se apunta a mano.', 400);
    }
    const id = crypto.randomUUID();
    await req.tenantClient.insert(schema.shipmentEvents).values({
      id,
      shipmentId: req.params.id,
      kind: body.kind || 'note',
      description: body.description || null,
      location: body.location || null,
    });
    return { id };
  }),
);

/**
 * Incidencias reportadas por clientes desde el chat público de seguimiento
 * (eventos `kind='incident'`, últimos 30 días) con su envío. Alimenta la
 * sección "Reportadas por clientes" de Logística → Incidencias.
 */
router.get('/incidents/client-reported', async (req: any, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await req.tenantClient
      .select({
        eventId: schema.shipmentEvents.id,
        description: schema.shipmentEvents.description,
        createdAt: schema.shipmentEvents.createdAt,
        shipmentId: schema.shipments.id,
        shipmentStatus: schema.shipments.status,
        preparationStatus: schema.shipments.preparationStatus,
        destinationAddress: schema.shipments.destinationAddress,
        recipientName: schema.shipments.recipientName,
      })
      .from(schema.shipmentEvents)
      .innerJoin(schema.shipments, eq(schema.shipmentEvents.shipmentId, schema.shipments.id))
      .where(
        and(
          eq(schema.shipmentEvents.kind, 'incident'),
          gte(schema.shipmentEvents.createdAt, since),
          isNull(schema.shipments.archivedAt),
        ),
      )
      .orderBy(desc(schema.shipmentEvents.createdAt))
      .limit(100);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/shipments/:id/positions', async (req: any, res) => {
  const rows = await req.tenantClient
    .select()
    .from(schema.shipmentPositions)
    .where(eq(schema.shipmentPositions.shipmentId, req.params.id))
    .orderBy(desc(schema.shipmentPositions.reportedAt))
    .limit(500);
  res.json(rows);
});

export default router;
