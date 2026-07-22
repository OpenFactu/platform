/**
 * Módulo de logística propio.
 *
 * Recursos:
 *   - Shipment          /api/logistics/shipments
 *   - ShipmentPosition  /api/logistics/shipments/:id/positions (GET)
 *   - Reporte público   /api/logistics/track/:reportToken/position  (POST SIN AUTH)
 *   - Package           /api/logistics/packages
 *   - Route             /api/logistics/routes
 *   - RouteStop         /api/logistics/routes/:id/stops
 *   - StagingArea       /api/logistics/staging-areas
 *
 * El endpoint público de tracking acepta lat/lng/speed/heading via POST con
 * un token opaco (`reportToken`) que se genera al crear el Shipment y se
 * entrega al conductor (aplicación móvil, tracker GPS, script).
 */
import { Router } from 'express';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  notInArray,
  isNotNull,
  ilike,
  or,
  gte,
  lte,
  sql,
} from 'drizzle-orm';
import crypto from 'crypto';
import QRCode from 'qrcode';
import * as schema from '../db/schema';
import { broadcastEvent } from '../core/realtime/EventSocket';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { HookManager } from '../core/plugins/HookManager';
import { hasScope } from './middleware/apiToken';
import { geocodeAddress } from '../core/logistics/geocode';
import {
  notifyShipmentStageChange,
  type ShipmentStage,
} from '../core/logistics/shipmentNotifications';
import { dispatchEvent } from '../core/webhooks/WebhookQueue';
import { getConfigSection } from '../core/config/systemConfigSection';
import { FLAGS_DEFAULTS } from '../core/config/appConfig';
import { applyBaseOrderFulfillment } from '../core/documents/baseOrderFulfillment';
import { getAiConfig } from '../core/ai';
import { streamTrackingChat, checkTrackingChatRateLimit } from '../core/ai/trackingChatEngine';

const NOTIFY_STAGES: ShipmentStage[] = [
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

/**
 * URL base pública para los enlaces de los emails al destinatario.
 *
 * Prioridad:
 *   1. SystemConfig del tenant `app_public_base_url` (se fija en el SetupWizard
 *      y se puede editar desde Ajustes). Es lo normal en producción.
 *   2. `PUBLIC_BASE_URL` del entorno.
 *   3. Header `Origin` del request — útil en dev (Vite HTTPS en LAN).
 *   4. Header `Referer`.
 *   5. `X-Forwarded-Proto/Host` (detrás de proxy).
 *   6. `req.protocol + host` (último recurso).
 */
async function publicBaseUrl(req: any): Promise<string> {
  // 1. SystemConfig del tenant.
  try {
    if (req.tenantClient) {
      const [row] = await req.tenantClient
        .select({ value: schema.systemConfigs.value })
        .from(schema.systemConfigs)
        .where(eq(schema.systemConfigs.key, 'app_public_base_url'));
      const v = row?.value?.toString().trim();
      if (v && /^https?:\/\//.test(v)) return v.replace(/\/$/, '');
    }
  } catch {
    /* ignore, cae al siguiente */
  }

  const envUrl = process.env.PUBLIC_BASE_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, '');

  const origin = (req.headers?.origin as string | undefined)?.trim();
  if (origin && /^https?:\/\//.test(origin)) return origin.replace(/\/$/, '');

  const referer = (req.headers?.referer as string | undefined)?.trim();
  if (referer) {
    try {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* ignore */
    }
  }

  const xfProto = (req.headers?.['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
  const xfHost = (req.headers?.['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim();
  if (xfProto && xfHost) return `${xfProto}://${xfHost}`;

  return `${req.protocol}://${req.get('host')}`;
}

const router = Router();

function nowIso() {
  return new Date();
}

function genCode(prefix: string) {
  const n = Math.floor(Math.random() * 999999)
    .toString()
    .padStart(6, '0');
  return `${prefix}-${n}`;
}

// ─────────────────────────────────────────────────────────────────
// SHIPMENTS
// ─────────────────────────────────────────────────────────────────

/**
 * Listado de envíos con filtros y paginación server-side.
 *
 * Query params:
 *   q                  búsqueda ILIKE en trackingNumber / destinationAddress / driverName
 *   status             CSV de status legacy (pending,in_transit,...)
 *   preparationStatus  CSV del ciclo de preparación (draft,picking,...)
 *   routeId            filtra por envíos asignados a ese routeStop
 *   fromDate / toDate  ISO date range sobre createdAt
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
      req.query.toDate !== undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));

    const conds: any[] = [];
    if (q && q.length > 0) {
      const like = `%${q}%`;
      conds.push(
        or(
          ilike(schema.shipments.trackingNumber, like),
          ilike(schema.shipments.destinationAddress, like),
          ilike(schema.shipments.driverName, like),
        ),
      );
    }
    if (statusCsv) {
      const arr = statusCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (arr.length > 0) conds.push(inArray(schema.shipments.status, arr));
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
      res.json({ rows, total: Number(count) || 0, page, pageSize });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Envíos con coordenadas de destino que aún no están asignados a ninguna
 * parada de ruta — útil para el planner visual al crear una ruta nueva.
 */
router.get('/shipments/unrouted', async (req: any, res) => {
  try {
    // Shipment IDs ya usados en RouteStop (si están referenciados aunque
    // la parada esté cancelada: el operario puede querer reciclarlos, pero
    // para el MVP filtramos todos los asignados).
    const assigned = await req.tenantClient
      .select({ shipmentId: schema.routeStops.shipmentId })
      .from(schema.routeStops)
      .where(isNotNull(schema.routeStops.shipmentId));
    const assignedIds = assigned.map((r: any) => r.shipmentId).filter((x: any): x is string => !!x);

    // Sólo interesa los envíos "activos" — ya entregados, cancelados o
    // devueltos no pintamos.
    const ACTIVE_STATUSES = ['pending', 'ready', 'dispatched', 'in_transit'];

    const where =
      assignedIds.length > 0
        ? and(
            inArray(schema.shipments.status, ACTIVE_STATUSES),
            notInArray(schema.shipments.id, assignedIds),
          )
        : inArray(schema.shipments.status, ACTIVE_STATUSES);

    const rows = await req.tenantClient
      .select({
        id: schema.shipments.id,
        trackingNumber: schema.shipments.trackingNumber,
        status: schema.shipments.status,
        destinationAddress: schema.shipments.destinationAddress,
        destinationLat: schema.shipments.destinationLat,
        destinationLng: schema.shipments.destinationLng,
        createdAt: schema.shipments.createdAt,
      })
      .from(schema.shipments)
      .where(where)
      .orderBy(desc(schema.shipments.createdAt))
      .limit(500);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

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

router.post('/shipments', async (req: any, res) => {
  try {
    const id = crypto.randomUUID();
    const reportToken = crypto.randomBytes(24).toString('hex');
    const body = req.body || {};
    await req.tenantClient.insert(schema.shipments).values({
      id,
      reportToken,
      deliveryNoteId: body.deliveryNoteId || null,
      carrier: body.carrier || 'propio',
      trackingNumber: body.trackingNumber || null,
      status: body.status || 'pending',
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
      notes: body.notes || null,
    });
    res.json({ id, reportToken });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/shipments/:id', async (req: any, res) => {
  try {
    const body = req.body || {};
    const patch: any = {};
    for (const k of [
      'carrier',
      'trackingNumber',
      'status',
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
      'notes',
    ]) {
      if (k in body) patch[k] = body[k];
    }
    if (patch.estimatedDelivery) patch.estimatedDelivery = new Date(patch.estimatedDelivery);
    patch.updatedAt = nowIso();
    if (patch.status === 'delivered') patch.deliveredAt = nowIso();
    // Propaga el status legacy al ciclo de vida canónico (`preparationStatus`)
    // para mantenerlos sincronizados — si no, la página pública de tracking
    // muestra el último `preparationStatus` (p. ej. "ready") mientras que
    // `status` ya es `delivered`, y el progreso se queda atascado.
    if (
      'status' in patch &&
      typeof patch.status === 'string' &&
      [
        'pending',
        'in_transit',
        'out_for_delivery',
        'postponed',
        'delivered',
        'exception',
        'returned',
        'cancelled',
      ].includes(patch.status)
    ) {
      patch.preparationStatus = patch.status;
    }
    await req.tenantClient
      .update(schema.shipments)
      .set(patch)
      .where(eq(schema.shipments.id, req.params.id));

    // Si es un pickup_return completado, crear GoodsReceipt draft con la
    // mercancía recogida en el almacén destino. El operario de almacén lo
    // revisará al llegar el camión y hará el `post` manual para subir stock.
    if (patch.status === 'delivered') {
      try {
        const [ship] = await req.tenantClient
          .select()
          .from(schema.shipments)
          .where(eq(schema.shipments.id, req.params.id));
        if (ship?.kind === 'pickup_return' && ship.returnWarehouseId) {
          await req.tenantClient.insert(schema.goodsReceipts).values({
            id: crypto.randomUUID(),
            code: `REC-${Math.floor(Math.random() * 999999)
              .toString()
              .padStart(6, '0')}`,
            warehouseId: ship.returnWarehouseId,
            date: nowIso(),
            type: 'return',
            status: 'draft',
            notes: `Recogida de devolución · ${ship.recipientName || ship.destinationAddress || ship.id.slice(0, 8)}`,
            createdByUserId: req.user?.id || null,
          });
        }
      } catch (e: any) {
        console.warn('[shipments] pickup_return → receipt falló:', e?.message);
      }
    }

    // Evento realtime para refrescar mapas y listados.
    broadcastEvent(req.tenantId, {
      type: 'shipment.updated',
      payload: { id: req.params.id, status: patch.status },
    } as any);

    if ('status' in patch) {
      await req.tenantClient.insert(schema.shipmentEvents).values({
        id: crypto.randomUUID(),
        shipmentId: req.params.id,
        kind: 'status_change',
        status: patch.status,
        description: body.reason || null,
      });
      // Cancelado/devuelto por PATCH directo → cerrar también sus paradas
      // para que el envío no se quede colgado en la ruta.
      if (patch.status === 'cancelled' || patch.status === 'returned') {
        await closeStopsForShipment(
          req,
          req.params.id,
          body.reason
            ? `Envío ${patch.status === 'returned' ? 'devuelto' : 'cancelado'} — ${body.reason}`
            : `Envío ${patch.status === 'returned' ? 'devuelto' : 'cancelado'}`,
        );
      }
      // Notificación al destinatario: se enfila, no bloquea la response.
      if (NOTIFY_STAGES.includes(patch.status as ShipmentStage)) {
        const baseUrl = await publicBaseUrl(req);
        notifyShipmentStageChange(
          req.tenantClient,
          req.tenantId,
          req.params.id,
          patch.status as ShipmentStage,
          baseUrl,
        ).catch(() => {});
      }
      // Webhook genérico: `shipment.<status>` (p. ej. shipment.delivered).
      dispatchEvent(req.tenantId, `shipment.${patch.status}`, {
        id: req.params.id,
        status: patch.status,
        reason: body.reason || null,
      }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Endpoint de prueba: fuerza el envío del email de notificación para un
 * shipment con el stage indicado (por defecto el actual). Útil para
 * diagnosticar el flujo sin tener que mover el envío por todo el ciclo.
 */
router.post('/shipments/:id/notify', async (req: any, res) => {
  try {
    const stage = (req.body?.stage || 'in_transit') as ShipmentStage;
    const baseUrl = await publicBaseUrl(req);
    await notifyShipmentStageChange(req.tenantClient, req.tenantId, req.params.id, stage, baseUrl);
    res.json({ ok: true, stage, hint: 'Revisa los logs del server y el cockpit de MailQueue.' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Cancelación de un envío. Opcionalmente anula también el albarán asociado.
 * Body: { reason?: string; cancelDeliveryNote?: boolean }
 */
router.post('/shipments/:id/cancel', async (req: any, res) => {
  try {
    const body = req.body || {};
    const [ship] = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(eq(schema.shipments.id, req.params.id));
    if (!ship) return res.status(404).json({ error: 'Envío no encontrado' });
    if (ship.status === 'delivered') {
      return res.status(400).json({ error: 'Envío ya entregado — usa devolución' });
    }

    await req.tenantClient
      .update(schema.shipments)
      .set({
        status: 'cancelled',
        preparationStatus: 'cancelled',
        updatedAt: nowIso(),
      })
      .where(eq(schema.shipments.id, req.params.id));

    await req.tenantClient.insert(schema.shipmentEvents).values({
      id: crypto.randomUUID(),
      shipmentId: req.params.id,
      kind: 'status_change',
      status: 'cancelled',
      description: body.reason || null,
    });

    // Sacar el envío de su ruta — si no, la parada queda viva para siempre.
    await closeStopsForShipment(
      req,
      req.params.id,
      body.reason ? `Envío cancelado — ${body.reason}` : 'Envío cancelado',
    );

    // Anular el albarán si el caller lo pide.
    let dnCancelled = false;
    if (body.cancelDeliveryNote && ship.deliveryNoteId) {
      const table =
        ship.sourceDocType === 'PDN' ? schema.purchaseDeliveryNotes : schema.salesDeliveryNotes;
      try {
        await req.tenantClient
          .update(table)
          .set({ status: 'cancelled' })
          .where(eq(table.id, ship.deliveryNoteId));
        dnCancelled = true;
      } catch (e: any) {
        console.warn('[cancel] no se pudo anular el albarán:', e?.message);
      }
    }

    const baseUrl = await publicBaseUrl(req);
    notifyShipmentStageChange(
      req.tenantClient,
      req.tenantId,
      req.params.id,
      'cancelled' as any,
      baseUrl,
    ).catch(() => {});
    dispatchEvent(req.tenantId, 'shipment.cancelled', {
      id: req.params.id,
      reason: body.reason || null,
      deliveryNoteCancelled: dnCancelled,
    }).catch(() => {});

    res.json({ ok: true, deliveryNoteCancelled: dnCancelled });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Devolución de un envío ya entregado (o en ruta que el cliente rechaza).
 * Crea una GoodsReceipt con type='return' que suma stock al almacén origen
 * y marca el envío como `returned`.
 *
 * Body: {
 *   reason?: string;
 *   warehouseId?: string;
 *   cancelDeliveryNote?: boolean;  // si true, el albarán origen pasa a 'X' y se
 *                                  // revierte el fulfillment del pedido origen
 *                                  // (se rechaza si ya está facturado — 'C')
 * }
 */
router.post('/shipments/:id/return', async (req: any, res) => {
  try {
    const body = req.body || {};
    const [ship] = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(eq(schema.shipments.id, req.params.id));
    if (!ship) return res.status(404).json({ error: 'Envío no encontrado' });

    // Almacén de retorno: si el caller no lo especifica, intentamos inferirlo
    // del albarán origen; si no hay, dejamos en blanco y el usuario tendrá
    // que corregir el GoodsReceipt a mano.
    let warehouseId = body.warehouseId as string | undefined;
    if (!warehouseId && ship.deliveryNoteId) {
      const table =
        ship.sourceDocType === 'PDN' ? schema.purchaseDeliveryNotes : schema.salesDeliveryNotes;
      const [dn] = await req.tenantClient
        .select({ warehouseId: table.warehouseId })
        .from(table)
        .where(eq(table.id, ship.deliveryNoteId));
      warehouseId = dn?.warehouseId || undefined;
    }

    // Crear GoodsReceipt con las líneas del albarán original (si hay) en
    // estado draft para que el usuario lo revise y postee.
    let receiptId: string | null = null;
    if (warehouseId) {
      receiptId = crypto.randomUUID();
      await req.tenantClient.insert(schema.goodsReceipts).values({
        id: receiptId,
        code: `DEV-${Math.floor(Math.random() * 999999)
          .toString()
          .padStart(6, '0')}`,
        warehouseId,
        date: nowIso(),
        type: 'return',
        status: 'draft',
        notes: `Devolución del envío ${ship.trackingNumber || req.params.id.slice(0, 8)}${body.reason ? ` — ${body.reason}` : ''}`,
        createdByUserId: req.user?.id || null,
      });
      // Copiar líneas del SDN/PDN si hay.
      if (ship.deliveryNoteId) {
        const lineTable =
          ship.sourceDocType === 'PDN'
            ? schema.purchaseDeliveryNoteLines
            : schema.salesDeliveryNoteLines;
        const batchTable =
          ship.sourceDocType === 'PDN'
            ? schema.purchaseDeliveryNoteLineBatches
            : schema.salesDeliveryNoteLineBatches;
        // Ambas tablas (Sales/Purchase DeliveryNoteLine) usan `deliveryId`.
        const lines = await req.tenantClient
          .select()
          .from(lineTable)
          .where(eq((lineTable as any).deliveryId, ship.deliveryNoteId));
        let lineNum = 0;
        for (const l of lines as any[]) {
          if (!l.itemId || !l.quantity) continue;
          // Si la línea tenía lotes/series asignados, generamos una fila de
          // recepción POR LOTE — si no, `StockPoster.postReceipt` nunca sabe
          // a qué lote reponer y la devolución solo sube el stock global/por
          // almacén, dejando itemBatches/itemBatchStocks sin el lote devuelto.
          const batches = await req.tenantClient
            .select()
            .from(batchTable)
            .where(eq((batchTable as any).deliveryLineId, l.id));
          if (batches.length > 0) {
            for (const b of batches as any[]) {
              lineNum += 1;
              await req.tenantClient.insert(schema.goodsReceiptLines).values({
                id: crypto.randomUUID(),
                receiptId,
                lineNum,
                itemId: l.itemId,
                quantity: Number(b.quantity),
                zoneId: l.zoneId || null,
                batchNum: b.batchNum,
                uomId: l.uomId || null,
              });
            }
          } else {
            lineNum += 1;
            await req.tenantClient.insert(schema.goodsReceiptLines).values({
              id: crypto.randomUUID(),
              receiptId,
              lineNum,
              itemId: l.itemId,
              // En UoM base — igual que el resto del ledger de stock.
              quantity: Number(l.quantity) * Number(l.uomFactor || 1),
              zoneId: l.zoneId || null,
              uomId: l.uomId || null,
            });
          }
        }
      }
    }

    await req.tenantClient
      .update(schema.shipments)
      .set({ status: 'returned', preparationStatus: 'returned', updatedAt: nowIso() })
      .where(eq(schema.shipments.id, req.params.id));

    await req.tenantClient.insert(schema.shipmentEvents).values({
      id: crypto.randomUUID(),
      shipmentId: req.params.id,
      kind: 'status_change',
      status: 'returned',
      description: body.reason || null,
    });

    // Sacar el envío de su ruta — si no, la parada queda viva para siempre.
    await closeStopsForShipment(
      req,
      req.params.id,
      body.reason ? `Envío devuelto — ${body.reason}` : 'Envío devuelto',
    );

    // Opcional: anular el albarán origen si el caller lo pide (devolución
    // definitiva). Si no, el albarán queda abierto para permitir reintentar
    // el reparto creando un shipment nuevo (ver `/prep/from-sdn`).
    //
    // Aquí NO se revierte stock: la mercancía salió físicamente y vuelve vía
    // el GoodsReceipt de devolución creado arriba (por eso no se usa
    // DocumentEngine.cancel, que siempre revierte). Lo que SÍ se revierte es
    // el fulfillment del pedido origen — 'X' significa en todo el sistema que
    // el documento deja de contar, y el pedido queda P/O para que el usuario
    // decida si re-servirlo o cancelarlo.
    let dnCancelled = false;
    let dnHint: string | null = null;
    if (body.cancelDeliveryNote && ship.deliveryNoteId) {
      const isPdn = ship.sourceDocType === 'PDN';
      const table = isPdn ? schema.purchaseDeliveryNotes : schema.salesDeliveryNotes;
      const lineTable = isPdn ? schema.purchaseDeliveryNoteLines : schema.salesDeliveryNoteLines;
      try {
        await req.tenantClient.transaction(async (tx: any) => {
          const [dn] = await tx.select().from(table).where(eq(table.id, ship.deliveryNoteId));
          if (!dn) {
            dnHint = 'El albarán origen ya no existe.';
            return;
          }
          if (dn.status === 'X') {
            dnHint = 'El albarán ya estaba cancelado.';
            return;
          }
          if (dn.status === 'C') {
            dnHint =
              'El albarán ya está facturado — no se anula. Emite una factura rectificativa para revertir la operación.';
            return;
          }

          const dnLines = await tx
            .select()
            .from(lineTable)
            .where(eq((lineTable as any).deliveryId, ship.deliveryNoteId));

          await tx.update(table).set({ status: 'X' }).where(eq(table.id, ship.deliveryNoteId));

          await applyBaseOrderFulfillment(tx, {
            orderLineTable: isPdn ? schema.purchaseOrderLines : schema.salesOrderLines,
            orderHeaderTable: isPdn ? schema.purchaseOrders : schema.salesOrders,
            qtyField: isPdn ? 'receivedQty' : 'deliveredQty',
            orderId: dn.orderId,
            lines: dnLines,
            sign: -1,
          });
          dnCancelled = true;
        });
      } catch (e: any) {
        console.warn('[return] no se pudo anular el albarán:', e?.message);
        dnHint = `No se pudo anular el albarán: ${e?.message}`;
      }
    }

    const baseUrl = await publicBaseUrl(req);
    notifyShipmentStageChange(
      req.tenantClient,
      req.tenantId,
      req.params.id,
      'returned',
      baseUrl,
    ).catch(() => {});
    dispatchEvent(req.tenantId, 'shipment.returned', {
      id: req.params.id,
      reason: body.reason || null,
      receiptId,
      deliveryNoteCancelled: dnCancelled,
    }).catch(() => {});

    res.json({
      ok: true,
      receiptId,
      deliveryNoteCancelled: dnCancelled,
      deliveryNoteHint: dnHint,
      hint: receiptId
        ? 'Se creó un GoodsReceipt draft. Revísalo y posteálo para que suba stock.'
        : 'Sin almacén origen detectado — crea la entrada de devolución a mano.',
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Programa una RECOGIDA del paquete en casa del cliente (p. ej. tras una
 * incidencia: contenido incorrecto, producto dañado). Crea un envío nuevo
 * `kind='pickup_return'` con el mismo destino y destinatario que el original:
 * el conductor va ALLÍ a recoger, y al marcarlo entregado ("Recogí") se crea
 * automáticamente el GoodsReceipt draft sobre `returnWarehouseId` (ver el
 * PATCH de shipments). La recogida se planifica en rutas como cualquier envío.
 *
 * Body: { reason?: string; warehouseId?: string }  — si no llega warehouseId
 * se infiere del albarán origen; sin ninguno de los dos → 400.
 */
router.post('/shipments/:id/schedule-pickup', async (req: any, res) => {
  try {
    const body = req.body || {};
    const [ship] = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(eq(schema.shipments.id, req.params.id));
    if (!ship) return res.status(404).json({ error: 'Envío no encontrado' });
    if (ship.kind === 'pickup_return') {
      return res.status(400).json({ error: 'Este envío ya es una recogida' });
    }

    // Evitar duplicados: si ya hay una recogida viva para el mismo albarán,
    // no creamos otra.
    if (ship.deliveryNoteId) {
      const [existing] = await req.tenantClient
        .select({ id: schema.shipments.id, trackingNumber: schema.shipments.trackingNumber })
        .from(schema.shipments)
        .where(
          and(
            eq(schema.shipments.deliveryNoteId, ship.deliveryNoteId),
            eq(schema.shipments.kind, 'pickup_return'),
            notInArray(schema.shipments.status, ['delivered', 'returned', 'cancelled']),
          ),
        );
      if (existing) {
        return res.status(409).json({
          error: `Ya existe una recogida en curso para este albarán (${existing.trackingNumber || existing.id.slice(0, 8)}).`,
          pickupId: existing.id,
        });
      }
    }

    // Almacén de retorno: explícito > inferido del albarán origen.
    let warehouseId = body.warehouseId as string | undefined;
    if (!warehouseId && ship.deliveryNoteId) {
      const table =
        ship.sourceDocType === 'PDN' ? schema.purchaseDeliveryNotes : schema.salesDeliveryNotes;
      const [dn] = await req.tenantClient
        .select({ warehouseId: table.warehouseId })
        .from(table)
        .where(eq(table.id, ship.deliveryNoteId));
      warehouseId = dn?.warehouseId || undefined;
    }
    if (!warehouseId) {
      return res
        .status(400)
        .json({ error: 'Indica el almacén de retorno (warehouseId) — no se pudo inferir.' });
    }

    const id = crypto.randomUUID();
    const reportToken = crypto.randomBytes(24).toString('hex');
    const code = genCode('REC');
    const origCode = ship.trackingNumber || ship.id.slice(0, 8);
    await req.tenantClient.insert(schema.shipments).values({
      id,
      reportToken,
      deliveryNoteId: ship.deliveryNoteId || null,
      sourceDocType: ship.sourceDocType || null,
      carrier: 'propio',
      trackingNumber: code,
      status: 'pending',
      destinationAddress: ship.destinationAddress,
      destinationLat: ship.destinationLat,
      destinationLng: ship.destinationLng,
      recipientName: ship.recipientName,
      recipientEmail: ship.recipientEmail,
      recipientPhone: ship.recipientPhone,
      kind: 'pickup_return',
      returnWarehouseId: warehouseId,
      notes: `Recogida del envío ${origCode}${body.reason ? ` — ${body.reason}` : ''}`,
    });

    // Trazabilidad en ambos timelines.
    await req.tenantClient.insert(schema.shipmentEvents).values([
      {
        id: crypto.randomUUID(),
        shipmentId: ship.id,
        kind: 'note',
        description: `Recogida programada (${code})${body.reason ? ` — ${body.reason}` : ''}`,
      },
      {
        id: crypto.randomUUID(),
        shipmentId: id,
        kind: 'note',
        description: `Creada desde el envío ${origCode}`,
      },
    ]);

    broadcastEvent(req.tenantId, {
      type: 'shipment.updated',
      payload: { id: ship.id },
    } as any);
    dispatchEvent(req.tenantId, 'shipment.pickup_scheduled', {
      id,
      code,
      fromShipmentId: ship.id,
      reason: body.reason || null,
    }).catch(() => {});

    res.json({
      id,
      code,
      reportToken,
      hint: 'Añade la recogida a una ruta desde el planificador — el conductor verá "Recoger de" en su app.',
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/shipments/:id', async (req: any, res) => {
  try {
    await req.tenantClient.delete(schema.shipments).where(eq(schema.shipments.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/shipments/:id/events', async (req: any, res) => {
  const rows = await req.tenantClient
    .select()
    .from(schema.shipmentEvents)
    .where(eq(schema.shipmentEvents.shipmentId, req.params.id))
    .orderBy(desc(schema.shipmentEvents.createdAt));
  res.json(rows);
});

router.post('/shipments/:id/events', async (req: any, res) => {
  const body = req.body || {};
  const id = crypto.randomUUID();
  await req.tenantClient.insert(schema.shipmentEvents).values({
    id,
    shipmentId: req.params.id,
    kind: body.kind || 'note',
    status: body.status || null,
    description: body.description || null,
    location: body.location || null,
  });
  res.json({ id });
});

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

// ─────────────────────────────────────────────────────────────────
// PACKAGES
// ─────────────────────────────────────────────────────────────────

router.get('/packages', async (req: any, res) => {
  const rows = await req.tenantClient
    .select()
    .from(schema.packages)
    .orderBy(desc(schema.packages.createdAt))
    .limit(500);
  res.json(rows);
});

router.post('/packages', async (req: any, res) => {
  const body = req.body || {};
  const id = crypto.randomUUID();
  const code = body.code || genCode('PKG');
  await req.tenantClient.insert(schema.packages).values({
    id,
    code,
    deliveryNoteId: body.deliveryNoteId || null,
    shipmentId: body.shipmentId || null,
    boxItemId: body.boxItemId || null,
    stagingAreaId: body.stagingAreaId || null,
    status: body.status || 'open',
    weightKg: body.weightKg ?? null,
    notes: body.notes || null,
  });
  // Crear líneas si vienen
  if (Array.isArray(body.lines)) {
    for (const l of body.lines) {
      await req.tenantClient.insert(schema.packageLines).values({
        id: crypto.randomUUID(),
        packageId: id,
        itemId: l.itemId,
        quantity: Number(l.quantity) || 0,
        sourceLineId: l.sourceLineId || null,
      });
    }
  }
  res.json({ id, code });
});

router.patch('/packages/:id', async (req: any, res) => {
  const body = req.body || {};
  const patch: any = {};
  for (const k of ['shipmentId', 'boxItemId', 'stagingAreaId', 'status', 'weightKg', 'notes']) {
    if (k in body) patch[k] = body[k];
  }
  if (patch.status === 'sealed') patch.sealedAt = nowIso();
  await req.tenantClient
    .update(schema.packages)
    .set(patch)
    .where(eq(schema.packages.id, req.params.id));
  res.json({ ok: true });
});

router.delete('/packages/:id', async (req: any, res) => {
  await req.tenantClient.delete(schema.packages).where(eq(schema.packages.id, req.params.id));
  res.json({ ok: true });
});

router.get('/packages/:id/lines', async (req: any, res) => {
  const rows = await req.tenantClient
    .select()
    .from(schema.packageLines)
    .where(eq(schema.packageLines.packageId, req.params.id));
  res.json(rows);
});

router.post('/packages/:id/lines', async (req: any, res) => {
  const body = req.body || {};
  const id = crypto.randomUUID();
  await req.tenantClient.insert(schema.packageLines).values({
    id,
    packageId: req.params.id,
    itemId: body.itemId,
    quantity: Number(body.quantity) || 0,
    sourceLineId: body.sourceLineId || null,
  });
  res.json({ id });
});

router.delete('/packages/:pid/lines/:lid', async (req: any, res) => {
  await req.tenantClient
    .delete(schema.packageLines)
    .where(
      and(
        eq(schema.packageLines.id, req.params.lid),
        eq(schema.packageLines.packageId, req.params.pid),
      ),
    );
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────
// VEHICLES (flota propia — soft-delete para histórico)
// ─────────────────────────────────────────────────────────────────

router.get('/vehicles', async (req: any, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  const rows = await req.tenantClient
    .select()
    .from(schema.vehicles)
    .orderBy(asc(schema.vehicles.code));
  res.json(includeArchived ? rows : rows.filter((r: any) => !r.archivedAt));
});

router.post('/vehicles', async (req: any, res) => {
  try {
    const body = req.body || {};
    if (!body.plate) return res.status(400).json({ error: 'La matrícula es obligatoria.' });
    const id = crypto.randomUUID();
    const code = body.code || genCode('VH');
    await req.tenantClient.insert(schema.vehicles).values({
      id,
      code,
      plate: String(body.plate).trim().toUpperCase(),
      brand: body.brand || null,
      model: body.model || null,
      capacityKg: body.capacityKg ?? null,
      capacityM3: body.capacityM3 ?? null,
      status: body.status || 'active',
      defaultDriverEmployeeId: body.defaultDriverEmployeeId || null,
      notes: body.notes || null,
    });
    res.json({ id, code });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/vehicles/:id', async (req: any, res) => {
  try {
    const body = req.body || {};
    const patch: any = {};
    for (const k of [
      'plate',
      'brand',
      'model',
      'capacityKg',
      'capacityM3',
      'status',
      'defaultDriverEmployeeId',
      'notes',
    ]) {
      if (k in body) patch[k] = body[k];
    }
    if (patch.plate) patch.plate = String(patch.plate).trim().toUpperCase();
    await req.tenantClient
      .update(schema.vehicles)
      .set(patch)
      .where(eq(schema.vehicles.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Soft-delete: preserva histórico de rutas pasadas. */
router.delete('/vehicles/:id', async (req: any, res) => {
  await req.tenantClient
    .update(schema.vehicles)
    .set({ archivedAt: nowIso(), status: 'retired' })
    .where(eq(schema.vehicles.id, req.params.id));
  res.json({ ok: true });
});

/** Restaurar un vehículo archivado. */
router.post('/vehicles/:id/restore', async (req: any, res) => {
  await req.tenantClient
    .update(schema.vehicles)
    .set({ archivedAt: null, status: 'active' })
    .where(eq(schema.vehicles.id, req.params.id));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────

router.get('/routes', async (req: any, res) => {
  const rows = await req.tenantClient
    .select()
    .from(schema.routes)
    .orderBy(desc(schema.routes.plannedDate));
  res.json(rows);
});

/** Si viene vehicleId, captura snapshot de la matrícula en vehiclePlate. */
async function resolveVehicleSnapshot(client: any, body: any) {
  if (!body.vehicleId) return { vehicleId: null, vehiclePlate: body.vehiclePlate || null };
  const [v] = await client
    .select({ plate: schema.vehicles.plate })
    .from(schema.vehicles)
    .where(eq(schema.vehicles.id, body.vehicleId));
  return { vehicleId: body.vehicleId, vehiclePlate: v?.plate || body.vehiclePlate || null };
}

router.post('/routes', async (req: any, res) => {
  const body = req.body || {};
  const id = crypto.randomUUID();
  const code = body.code || genCode('RT');
  const veh = await resolveVehicleSnapshot(req.tenantClient, body);
  await req.tenantClient.insert(schema.routes).values({
    id,
    code,
    name: body.name || code,
    plannedDate: body.plannedDate,
    status: body.status || 'planned',
    driverName: body.driverName || null,
    driverPhone: body.driverPhone || null,
    driverEmployeeId: body.driverEmployeeId || null,
    vehicleId: veh.vehicleId,
    vehiclePlate: veh.vehiclePlate,
    notes: body.notes || null,
  });
  res.json({ id, code });
});

router.patch('/routes/:id', async (req: any, res) => {
  const body = req.body || {};
  const patch: any = {};
  for (const k of [
    'name',
    'plannedDate',
    'status',
    'driverName',
    'driverPhone',
    'driverEmployeeId',
    'vehiclePlate',
    'notes',
  ]) {
    if (k in body) patch[k] = body[k];
  }
  if ('vehicleId' in body) {
    const veh = await resolveVehicleSnapshot(req.tenantClient, body);
    patch.vehicleId = veh.vehicleId;
    // Actualizamos snapshot solo si el caller no impuso otro valor.
    if (!('vehiclePlate' in body)) patch.vehiclePlate = veh.vehiclePlate;
  }
  if (patch.status === 'active' && !body.startedAt) patch.startedAt = nowIso();
  if (patch.status === 'completed' && !body.completedAt) patch.completedAt = nowIso();
  await req.tenantClient
    .update(schema.routes)
    .set(patch)
    .where(eq(schema.routes.id, req.params.id));
  res.json({ ok: true });
});

router.delete('/routes/:id', async (req: any, res) => {
  await req.tenantClient.delete(schema.routes).where(eq(schema.routes.id, req.params.id));
  res.json({ ok: true });
});

router.get('/routes/:id/stops', async (req: any, res) => {
  const rows = await req.tenantClient
    .select()
    .from(schema.routeStops)
    .where(eq(schema.routeStops.routeId, req.params.id))
    .orderBy(asc(schema.routeStops.sequence));
  res.json(rows);
});

router.post('/routes/:id/stops', async (req: any, res) => {
  const body = req.body || {};
  const id = crypto.randomUUID();
  await req.tenantClient.insert(schema.routeStops).values({
    id,
    routeId: req.params.id,
    sequence: Number(body.sequence || 0),
    shipmentId: body.shipmentId || null,
    address: body.address || null,
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    plannedAt: body.plannedAt ? new Date(body.plannedAt) : null,
    notes: body.notes || null,
  });
  // Si el stop vincula un shipment, lo sacamos de la zona de preparación
  // marcándolo como dispatched (mismo efecto que el endpoint /dispatch).
  // Guard por rango: el planner inserta stops de uno en uno y puede re-añadir
  // el mismo shipment — sin el guard duplicaríamos evento y email.
  if (body.shipmentId) {
    const [sh] = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(eq(schema.shipments.id, body.shipmentId));
    const terminal = ['cancelled', 'delivered', 'returned'];
    const rank = (s: string | null | undefined) => SHIPMENT_STAGE_RANK[s || ''] ?? -1;
    if (
      sh &&
      !terminal.includes(sh.preparationStatus || '') &&
      rank(sh.preparationStatus) < SHIPMENT_STAGE_RANK.dispatched &&
      rank(sh.status) < SHIPMENT_STAGE_RANK.dispatched
    ) {
      await req.tenantClient
        .update(schema.shipments)
        .set({
          status: 'dispatched',
          preparationStatus: 'dispatched',
          dispatchedAt: nowIso(),
          updatedAt: nowIso(),
        })
        .where(eq(schema.shipments.id, body.shipmentId));
      await emitTransition(
        req.tenantClient,
        req.tenantId,
        body.shipmentId,
        sh.preparationStatus,
        'dispatched',
        sh.kind === 'pickup_return' ? 'Recogida asignada a ruta' : 'Despachado',
        'shipment.dispatched',
        { routeId: req.params.id },
      );
      dispatchEvent(req.tenantId, 'shipment.dispatched', {
        id: body.shipmentId,
        routeId: req.params.id,
      }).catch(() => {});
    }
  }
  res.json({ id });
});

router.patch('/routes/:rid/stops/:sid', async (req: any, res) => {
  const body = req.body || {};
  const patch: any = {};
  for (const k of [
    'sequence',
    'shipmentId',
    'address',
    'lat',
    'lng',
    'plannedAt',
    'arrivedAt',
    'departedAt',
    'status',
    'notes',
    'recipientName',
    'recipientDocument',
    'signatureImage',
    'photoImage',
    'podNotes',
  ]) {
    if (k in body) patch[k] = body[k];
  }
  if (patch.plannedAt) patch.plannedAt = new Date(patch.plannedAt);
  if (patch.arrivedAt) patch.arrivedAt = new Date(patch.arrivedAt);
  if (patch.departedAt) patch.departedAt = new Date(patch.departedAt);

  // Recuperamos el stop anterior para saber si el status está cambiando
  // (y poder disparar la notificación 'out_for_delivery' la primera vez).
  const [prevStop] = await req.tenantClient
    .select()
    .from(schema.routeStops)
    .where(eq(schema.routeStops.id, req.params.sid));

  await req.tenantClient
    .update(schema.routeStops)
    .set(patch)
    .where(
      and(eq(schema.routeStops.id, req.params.sid), eq(schema.routeStops.routeId, req.params.rid)),
    );

  // Al arrancar el stop (status: pending → en_route/arrived) marcamos el
  // envío como 'out_for_delivery' para avisar al destinatario por email.
  // Si el stop pasa directo a 'delivered', el PATCH del shipment a 'delivered'
  // ya dispara el email de entrega — no hay que duplicar.
  const prevStatus = prevStop?.status || 'pending';
  const newStatus = patch.status as string | undefined;
  const startedNow =
    prevStatus === 'pending' && (newStatus === 'en_route' || newStatus === 'arrived');
  if (startedNow && prevStop?.shipmentId) {
    try {
      const [ship] = await req.tenantClient
        .select({
          status: schema.shipments.status,
          preparationStatus: schema.shipments.preparationStatus,
          kind: schema.shipments.kind,
        })
        .from(schema.shipments)
        .where(eq(schema.shipments.id, prevStop.shipmentId));
      const already = ['out_for_delivery', 'delivered'];
      if (
        ship &&
        !already.includes(ship.status || '') &&
        !already.includes(ship.preparationStatus || '')
      ) {
        // Ambos campos — si solo tocamos `status`, el tracking público (que
        // elige el más avanzado de los dos) puede quedarse desincronizado.
        await req.tenantClient
          .update(schema.shipments)
          .set({
            status: 'out_for_delivery',
            preparationStatus: 'out_for_delivery',
            updatedAt: nowIso(),
          })
          .where(eq(schema.shipments.id, prevStop.shipmentId));
        await req.tenantClient.insert(schema.shipmentEvents).values({
          id: crypto.randomUUID(),
          shipmentId: prevStop.shipmentId,
          kind: 'status_change',
          status: 'out_for_delivery',
          description:
            ship.kind === 'pickup_return' ? 'Hoy pasamos a recogerlo' : 'Sale hoy en reparto',
        });
        const baseUrl = await publicBaseUrl(req);
        notifyShipmentStageChange(
          req.tenantClient,
          req.tenantId,
          prevStop.shipmentId,
          'out_for_delivery',
          baseUrl,
        ).catch(() => {});
      }
    } catch (e: any) {
      console.warn('[logistics] no se pudo propagar out_for_delivery:', e?.message);
    }
  }

  // Automatizaciones de la ruta:
  //   planeada → activa   al primer stop con progreso (fallback — el camino
  //                       normal es POST /routes/:id/start desde la DriverApp)
  //   activa  → completa  cuando TODAS las paradas están en estado terminal
  //                       (delivered/postponed/exception/cancelled — una
  //                       aplazada ya no deja la ruta abierta para siempre)
  //   auto-avance         al terminar una parada, la siguiente pendiente pasa
  //                       a en_route y su envío a "en reparto"
  try {
    const [route] = await req.tenantClient
      .select()
      .from(schema.routes)
      .where(eq(schema.routes.id, req.params.rid));
    if (route) {
      const stops = await req.tenantClient
        .select()
        .from(schema.routeStops)
        .where(eq(schema.routeStops.routeId, route.id));
      if (stops.length > 0) {
        const TERMINAL_STOP = ['delivered', 'postponed', 'exception', 'cancelled'];
        const anyInProgress = stops.some(
          (s: any) => s.status && s.status !== 'pending' && s.status !== 'cancelled',
        );
        const allTerminal = stops.every((s: any) => TERMINAL_STOP.includes(s.status || ''));
        // Auto-avance: si esta parada acaba de quedar terminal y la ruta sigue
        // viva, la siguiente pendiente (por secuencia) sale hacia el cliente.
        if (TERMINAL_STOP.includes(patch.status || '') && !allTerminal) {
          const next = stops
            .filter((s: any) => s.status === 'pending')
            .sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0))[0];
          if (next) await advanceStopEnRoute(req, next);
        }
        if (route.status === 'planned' && anyInProgress) {
          await req.tenantClient
            .update(schema.routes)
            .set({ status: 'active', startedAt: route.startedAt || nowIso() })
            .where(eq(schema.routes.id, route.id));
          broadcastEvent(req.tenantId, {
            type: 'route.changed',
            payload: { routeId: route.id, from: 'planned', to: 'active' },
          } as any);
          HookManager.trigger('route.started', {
            tenantId: req.tenantId,
            routeId: route.id,
          }).catch(() => {});
        }
        if (allTerminal && route.status !== 'completed') {
          await req.tenantClient
            .update(schema.routes)
            .set({ status: 'completed', completedAt: nowIso() })
            .where(eq(schema.routes.id, route.id));
          broadcastEvent(req.tenantId, {
            type: 'route.changed',
            payload: { routeId: route.id, from: route.status, to: 'completed' },
          } as any);
          HookManager.trigger('route.completed', {
            tenantId: req.tenantId,
            routeId: route.id,
          }).catch(() => {});
        }
        // Hook a nivel de parada visitada — útil para plugins de trazabilidad.
        if (patch.status === 'arrived' || patch.status === 'delivered') {
          HookManager.trigger('route.stopVisited', {
            tenantId: req.tenantId,
            routeId: route.id,
            stopId: req.params.sid,
            status: patch.status,
          }).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.warn('[routes] automatización transición:', (e as any)?.message);
  }

  res.json({ ok: true });
});

router.delete('/routes/:rid/stops/:sid', async (req: any, res) => {
  await req.tenantClient
    .delete(schema.routeStops)
    .where(
      and(eq(schema.routeStops.id, req.params.sid), eq(schema.routeStops.routeId, req.params.rid)),
    );
  res.json({ ok: true });
});

/**
 * ¿Puede este usuario operar la ruta (iniciarla/finalizarla)? Admin/API con
 * scope de logística, o el conductor asignado (vía su Employee — mismo vínculo
 * que /my/routes). El conductor NO tiene write:logistics, por eso no basta
 * con requireScope.
 */
async function canOperateRoute(req: any, route: any): Promise<boolean> {
  if (hasScope(req, 'write:logistics')) return true; // sesión JWT normal pasa siempre
  const userId = req.user?.id;
  if (!userId || !route?.driverEmployeeId) return false;
  const [emp] = await req.tenantClient
    .select()
    .from(schema.employees)
    .where(eq(schema.employees.userId, userId));
  return !!emp && emp.id === route.driverEmployeeId;
}

/**
 * Marca una parada `pending` como `en_route` y propaga su envío a
 * `out_for_delivery` (evento + email "sale hoy hacia ti"). Idempotente: si la
 * parada ya avanzó o el envío ya está en reparto/terminal, no hace nada — así
 * los reintentos y el auto-avance no duplican emails.
 */
async function advanceStopEnRoute(req: any, stop: any) {
  if (!stop || (stop.status && stop.status !== 'pending')) return;
  await req.tenantClient
    .update(schema.routeStops)
    .set({ status: 'en_route' })
    .where(eq(schema.routeStops.id, stop.id));
  if (!stop.shipmentId) return;
  const [ship] = await req.tenantClient
    .select()
    .from(schema.shipments)
    .where(eq(schema.shipments.id, stop.shipmentId));
  if (!ship) return;
  const skip = ['out_for_delivery', 'delivered', 'returned', 'cancelled', 'exception'];
  if (skip.includes(ship.status || '') || skip.includes(ship.preparationStatus || '')) return;
  await req.tenantClient
    .update(schema.shipments)
    .set({
      status: 'out_for_delivery',
      preparationStatus: 'out_for_delivery',
      updatedAt: nowIso(),
    })
    .where(eq(schema.shipments.id, ship.id));
  await emitTransition(
    req.tenantClient,
    req.tenantId,
    ship.id,
    ship.preparationStatus,
    'out_for_delivery',
    ship.kind === 'pickup_return' ? 'Hoy pasamos a recogerlo' : 'Sale hoy en reparto',
    'shipment.out_for_delivery',
    { routeId: stop.routeId, stopId: stop.id },
  );
}

/**
 * Cierra las paradas vivas de un shipment cancelado/devuelto para que no se
 * quede colgado en la ruta: la parada pasa a `cancelled`, se avanza la
 * siguiente pendiente si la ruta está activa, y se completa la ruta si ya no
 * queda ninguna parada abierta.
 */
async function closeStopsForShipment(req: any, shipmentId: string, reason: string) {
  const TERMINAL_STOP = ['delivered', 'postponed', 'exception', 'cancelled'];
  const alive = await req.tenantClient
    .select()
    .from(schema.routeStops)
    .where(
      and(
        eq(schema.routeStops.shipmentId, shipmentId),
        inArray(schema.routeStops.status, ['pending', 'en_route', 'arrived']),
      ),
    );
  for (const stop of alive as any[]) {
    await req.tenantClient
      .update(schema.routeStops)
      .set({ status: 'cancelled', podNotes: reason })
      .where(eq(schema.routeStops.id, stop.id));
    try {
      const [route] = await req.tenantClient
        .select()
        .from(schema.routes)
        .where(eq(schema.routes.id, stop.routeId));
      if (!route || route.status === 'completed') continue;
      const stops = await req.tenantClient
        .select()
        .from(schema.routeStops)
        .where(eq(schema.routeStops.routeId, stop.routeId));
      if (route.status === 'active') {
        const next = stops
          .filter((s: any) => s.status === 'pending')
          .sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0))[0];
        if (next) await advanceStopEnRoute(req, next);
      }
      // Si tras el cierre no queda nada abierto, la ruta se completa sola —
      // mismo criterio que la automatización del PATCH de stops. (Si se ha
      // avanzado una parada arriba, en el snapshot sigue 'pending' y por
      // tanto la ruta se mantiene abierta, que es lo correcto.)
      const allTerminal =
        stops.length > 0 && stops.every((s: any) => TERMINAL_STOP.includes(s.status || ''));
      if (allTerminal) {
        await req.tenantClient
          .update(schema.routes)
          .set({ status: 'completed', completedAt: nowIso() })
          .where(eq(schema.routes.id, route.id));
        broadcastEvent(req.tenantId, {
          type: 'route.changed',
          payload: { routeId: route.id, from: route.status, to: 'completed' },
        } as any);
        HookManager.trigger('route.completed', {
          tenantId: req.tenantId,
          routeId: route.id,
        }).catch(() => {});
      }
    } catch (e: any) {
      console.warn('[routes] no se pudo reevaluar la ruta tras cerrar parada:', e?.message);
    }
  }
}

/**
 * Inicio de ruta explícito — el conductor pulsa "Iniciar ruta" al salir a
 * repartir. La ruta pasa a `active`, todos sus envíos no terminales a
 * `in_transit` (evento + email "en camino"), y la primera parada pendiente
 * arranca en `en_route` → su envío a "en reparto". Idempotente si ya está
 * activa (p. ej. reabrir la app a mitad de reparto).
 */
router.post('/routes/:id/start', async (req: any, res) => {
  try {
    const [route] = await req.tenantClient
      .select()
      .from(schema.routes)
      .where(eq(schema.routes.id, req.params.id));
    if (!route) return res.status(404).json({ error: 'Ruta no encontrada' });
    if (!(await canOperateRoute(req, route))) {
      return res.status(403).json({ error: 'No puedes operar esta ruta' });
    }
    if (route.status === 'completed') {
      return res.status(409).json({ error: 'La ruta ya está completada' });
    }
    if (route.status === 'active') return res.json({ ok: true, already: true });

    await req.tenantClient
      .update(schema.routes)
      .set({ status: 'active', startedAt: route.startedAt || nowIso() })
      .where(eq(schema.routes.id, route.id));
    broadcastEvent(req.tenantId, {
      type: 'route.changed',
      payload: { routeId: route.id, from: route.status, to: 'active' },
    } as any);
    HookManager.trigger('route.started', {
      tenantId: req.tenantId,
      routeId: route.id,
    }).catch(() => {});

    const stops = await req.tenantClient
      .select()
      .from(schema.routeStops)
      .where(eq(schema.routeStops.routeId, route.id))
      .orderBy(asc(schema.routeStops.sequence));

    // Envíos de la ruta → in_transit, salvo terminales o ya más avanzados.
    const shipmentIds = stops
      .map((s: any) => s.shipmentId)
      .filter((x: string | null): x is string => !!x);
    if (shipmentIds.length) {
      const ships = await req.tenantClient
        .select()
        .from(schema.shipments)
        .where(inArray(schema.shipments.id, shipmentIds));
      const terminal = ['delivered', 'returned', 'cancelled', 'exception'];
      const rank = (s: string | null | undefined) => SHIPMENT_STAGE_RANK[s || ''] ?? -1;
      for (const ship of ships) {
        if (terminal.includes(ship.status || '') || terminal.includes(ship.preparationStatus || ''))
          continue;
        if (
          rank(ship.status) >= SHIPMENT_STAGE_RANK.in_transit ||
          rank(ship.preparationStatus) >= SHIPMENT_STAGE_RANK.in_transit
        )
          continue;
        await req.tenantClient
          .update(schema.shipments)
          .set({ status: 'in_transit', preparationStatus: 'in_transit', updatedAt: nowIso() })
          .where(eq(schema.shipments.id, ship.id));
        await emitTransition(
          req.tenantClient,
          req.tenantId,
          ship.id,
          ship.preparationStatus,
          'in_transit',
          ship.kind === 'pickup_return' ? 'De camino a recoger' : 'En camino',
          'shipment.in_transit',
          { routeId: route.id },
        );
      }
    }

    // La primera parada pendiente sale ya hacia el cliente.
    const firstPending = stops.find((s: any) => s.status === 'pending');
    if (firstPending) await advanceStopEnRoute(req, firstPending);

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Fin de ruta explícito — cierra la ruta aunque queden paradas sin entregar:
 * las no terminales pasan a `postponed` y sus envíos también (vuelven al
 * almacén para reintentarse). Complementa el auto-complete del PATCH de stops,
 * que solo cierra cuando todas las paradas quedaron en estado terminal.
 */
router.post('/routes/:id/finish', async (req: any, res) => {
  try {
    const [route] = await req.tenantClient
      .select()
      .from(schema.routes)
      .where(eq(schema.routes.id, req.params.id));
    if (!route) return res.status(404).json({ error: 'Ruta no encontrada' });
    if (!(await canOperateRoute(req, route))) {
      return res.status(403).json({ error: 'No puedes operar esta ruta' });
    }
    if (route.status === 'completed') return res.json({ ok: true, already: true });

    const stops = await req.tenantClient
      .select()
      .from(schema.routeStops)
      .where(eq(schema.routeStops.routeId, route.id));
    const open = stops.filter((s: any) =>
      ['pending', 'en_route', 'arrived'].includes(s.status || 'pending'),
    );
    for (const stop of open) {
      await req.tenantClient
        .update(schema.routeStops)
        .set({ status: 'postponed' })
        .where(eq(schema.routeStops.id, stop.id));
      if (!stop.shipmentId) continue;
      const [ship] = await req.tenantClient
        .select()
        .from(schema.shipments)
        .where(eq(schema.shipments.id, stop.shipmentId));
      if (!ship) continue;
      const skip = ['delivered', 'returned', 'cancelled', 'exception', 'postponed'];
      if (skip.includes(ship.status || '') || skip.includes(ship.preparationStatus || '')) continue;
      await req.tenantClient
        .update(schema.shipments)
        .set({ status: 'postponed', preparationStatus: 'postponed', updatedAt: nowIso() })
        .where(eq(schema.shipments.id, ship.id));
      await emitTransition(
        req.tenantClient,
        req.tenantId,
        ship.id,
        ship.preparationStatus,
        'postponed',
        ship.kind === 'pickup_return'
          ? 'Recogida aplazada — se reintentará'
          : 'Reparto finalizado sin entrega — se reintentará',
        'shipment.postponed',
        { routeId: route.id, stopId: stop.id },
      );
    }

    await req.tenantClient
      .update(schema.routes)
      .set({ status: 'completed', completedAt: nowIso() })
      .where(eq(schema.routes.id, route.id));
    broadcastEvent(req.tenantId, {
      type: 'route.changed',
      payload: { routeId: route.id, from: route.status, to: 'completed' },
    } as any);
    HookManager.trigger('route.completed', {
      tenantId: req.tenantId,
      routeId: route.id,
    }).catch(() => {});

    res.json({ ok: true, postponedStops: open.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// STAGING AREAS (acopios)
// ─────────────────────────────────────────────────────────────────

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

router.get('/platforms', async (req: any, res) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const rows = await req.tenantClient
      .select()
      .from(schema.externalPlatforms)
      .orderBy(asc(schema.externalPlatforms.code));
    res.json(includeArchived ? rows : rows.filter((r: any) => !r.archivedAt));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/platforms', async (req: any, res) => {
  try {
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ error: 'El nombre es obligatorio.' });
    const id = crypto.randomUUID();
    const code = body.code || genCode('PL');

    // Geocodificar si hay dirección y no vienen coords.
    let lat: number | null = body.lat ?? null;
    let lng: number | null = body.lng ?? null;
    if (lat == null && lng == null && body.address) {
      const coords = await geocodeAddress(body.address).catch(() => null);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      }
    }

    await req.tenantClient.insert(schema.externalPlatforms).values({
      id,
      code,
      name: body.name,
      address: body.address || null,
      lat,
      lng,
      openingHours: body.openingHours || null,
      contactName: body.contactName || null,
      contactPhone: body.contactPhone || null,
      contactEmail: body.contactEmail || null,
      notes: body.notes || null,
    });
    res.json({ id, code });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/platforms/:id', async (req: any, res) => {
  try {
    const body = req.body || {};
    const patch: any = {};
    for (const k of [
      'name',
      'address',
      'lat',
      'lng',
      'openingHours',
      'contactName',
      'contactPhone',
      'contactEmail',
      'notes',
    ]) {
      if (k in body) patch[k] = body[k];
    }
    // Re-geocodifica si cambió solo la dirección.
    if ('address' in body && !('lat' in body) && !('lng' in body) && body.address) {
      const coords = await geocodeAddress(body.address).catch(() => null);
      if (coords) {
        patch.lat = coords.lat;
        patch.lng = coords.lng;
      }
    }
    await req.tenantClient
      .update(schema.externalPlatforms)
      .set(patch)
      .where(eq(schema.externalPlatforms.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Soft-delete — conservamos histórico de acopios pasados. */
router.delete('/platforms/:id', async (req: any, res) => {
  await req.tenantClient
    .update(schema.externalPlatforms)
    .set({ archivedAt: nowIso() })
    .where(eq(schema.externalPlatforms.id, req.params.id));
  res.json({ ok: true });
});

router.post('/platforms/:id/restore', async (req: any, res) => {
  await req.tenantClient
    .update(schema.externalPlatforms)
    .set({ archivedAt: null })
    .where(eq(schema.externalPlatforms.id, req.params.id));
  res.json({ ok: true });
});

router.post('/staging-areas', async (req: any, res) => {
  try {
    const body = req.body || {};
    const id = crypto.randomUUID();
    const code = body.code || genCode('AC');

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

router.get('/my/routes', async (req: any, res) => {
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
      .where(eq(schema.routes.driverEmployeeId, emp.id))
      .orderBy(desc(schema.routes.plannedDate));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/my/routes/:id', async (req: any, res) => {
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
    if (shipmentIds.length > 0) {
      const pkgs = await req.tenantClient
        .select({
          shipmentId: schema.packages.shipmentId,
          stagingAreaId: schema.packages.stagingAreaId,
        })
        .from(schema.packages)
        .where(inArray(schema.packages.shipmentId, shipmentIds));
      const stagingIds = [
        ...new Set(pkgs.map((p: any) => p.stagingAreaId).filter(Boolean)),
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
        for (const p of pkgs as any[]) {
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

    res.json({ route, stops, shipments, vehicle, pickups });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// QR del acopio
//
// Devuelve un PNG con un payload JSON estable que el repartidor escanea.
// El payload identifica el acopio + la ruta activa (si hay) + el listado
// de paquetes asignados. El repartidor usa este QR como "inicio de ruta"
// desde su app web móvil.
// ─────────────────────────────────────────────────────────────────

async function buildStagingPayload(tenantClient: any, tenantId: string, stagingAreaId: string) {
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
      code: s.trackingNumber || s.id.slice(0, 8),
      status: s.status,
      reportToken: s.reportToken,
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

// ─────────────────────────────────────────────────────────────────
// PREPARACIÓN DE PEDIDOS (picking)
//
// Ciclo: SDN/PDN → `Shipment` (preparationStatus=picking) + N `PickingTask`
//        → tareas done/missing → packed → ready → dispatched → in_transit
//        (inbound: receiving → received)
//
// Cada transición emite un `ShipmentEvent`, un `broadcastEvent` realtime y
// un `HookManager.trigger()` para plugins.
// ─────────────────────────────────────────────────────────────────

/** Scope guard para API tokens — JWTs normales pasan siempre. */
function requireScope(scope: string) {
  return (req: any, res: any, next: any) => {
    if (!hasScope(req, scope)) {
      return res.status(403).json({ error: `Falta el scope ${scope}` });
    }
    next();
  };
}

async function emitTransition(
  tenantClient: any,
  tenantId: string | undefined,
  shipmentId: string,
  from: string | null,
  to: string,
  description: string,
  hookEvent?: string,
  extraPayload?: any,
) {
  try {
    await tenantClient.insert(schema.shipmentEvents).values({
      id: crypto.randomUUID(),
      shipmentId,
      kind: 'status_change',
      status: to,
      description,
      location: null,
    });
  } catch {
    /* ignore */
  }
  if (tenantId) {
    broadcastEvent(tenantId, {
      type: 'shipment.preparation_changed',
      payload: { shipmentId, from, to, at: Date.now() },
    } as any);
  }
  if (hookEvent) {
    try {
      await HookManager.trigger(hookEvent, {
        tenantId,
        shipmentId,
        from,
        to,
        ...(extraPayload || {}),
      });
    } catch (e) {
      console.warn(`[prep] hook ${hookEvent} error`, (e as any)?.message);
    }
  }
  // Email al destinatario + webhook, si el destino es una etapa notificable.
  if (tenantId && NOTIFY_STAGES.includes(to as ShipmentStage)) {
    // Resolvemos publicBaseUrl leyendo el tenant config — no hay `req` aquí
    // así que consultamos directamente `systemConfigs.app_public_base_url`.
    let baseUrl = process.env.PUBLIC_BASE_URL?.trim() || '';
    if (!baseUrl) {
      try {
        const [row] = await tenantClient
          .select({ value: schema.systemConfigs.value })
          .from(schema.systemConfigs)
          .where(eq(schema.systemConfigs.key, 'app_public_base_url'));
        const v = row?.value?.toString().trim();
        if (v && /^https?:\/\//.test(v)) baseUrl = v.replace(/\/$/, '');
      } catch {
        /* ignore */
      }
    }
    notifyShipmentStageChange(
      tenantClient,
      tenantId,
      shipmentId,
      to as ShipmentStage,
      baseUrl,
    ).catch(() => {});
    dispatchEvent(tenantId, `shipment.${to}`, { id: shipmentId, from, to }).catch(() => {});
  }
}

/**
 * Crea (o recupera) un Shipment en estado `picking` para un SDN + N PickingTask,
 * una por línea del albarán. Idempotente: si el SDN ya tiene shipment vivo
 * (preparationStatus != cancelled/delivered) lo devuelve.
 */
router.post('/prep/from-sdn/:id', requireScope('write:logistics'), async (req: any, res) => {
  try {
    const dnId = req.params.id;
    const [dn] = await req.tenantClient
      .select()
      .from(schema.salesDeliveryNotes)
      .where(eq(schema.salesDeliveryNotes.id, dnId));
    if (!dn) return res.status(404).json({ error: 'Albarán no encontrado.' });

    // ¿Existe shipment vivo ya para este albarán? Un shipment 'delivered' sigue
    // contando como vivo/bloqueante — ya se entregó, no debe poder volver a
    // prepararse desde cero (antes se creaba un shipment nuevo silenciosamente).
    const existing = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(
        and(eq(schema.shipments.sourceDocType, 'SDN'), eq(schema.shipments.sourceDocId, dnId)),
      );
    const alive = existing.find(
      (s: any) => s.preparationStatus !== 'cancelled' && s.preparationStatus !== 'returned',
    );
    if (alive) {
      const tasks = await req.tenantClient
        .select()
        .from(schema.pickingTasks)
        .where(eq(schema.pickingTasks.shipmentId, alive.id));
      return res.json({ shipmentId: alive.id, reused: true, tasks });
    }

    const lines = await req.tenantClient
      .select()
      .from(schema.salesDeliveryNoteLines)
      .where(eq(schema.salesDeliveryNoteLines.deliveryId, dnId));

    // Lotes/series asignados en la SDN (opcional por línea).
    const lineIds = lines.map((l: any) => l.id);
    const batchRows = lineIds.length
      ? await req.tenantClient
          .select()
          .from(schema.salesDeliveryNoteLineBatches)
          .where(inArray(schema.salesDeliveryNoteLineBatches.deliveryLineId, lineIds))
      : [];
    const batchesByLine = new Map<string, any[]>();
    for (const b of batchRows as any[]) {
      const arr = batchesByLine.get(b.deliveryLineId) || [];
      arr.push(b);
      batchesByLine.set(b.deliveryLineId, arr);
    }

    // Dirección de envío: preferimos `shipToAddress` del albarán; si falta,
    // buscamos en `PartnerAddress` por orden de preferencia:
    //   1. La de envío (type='S') marcada por defecto.
    //   2. Cualquier dirección de envío.
    //   3. La de facturación (type='B') por defecto.
    //   4. El nombre del cliente como último recurso.
    let destinationAddress: string | null = dn.shipToAddress || null;
    if (!destinationAddress && dn.partnerId) {
      try {
        const addrs = await req.tenantClient
          .select()
          .from(schema.partnerAddresses)
          .where(eq(schema.partnerAddresses.partnerId, dn.partnerId));
        const best =
          addrs.find((a: any) => a.type === 'S' && a.isDefault) ||
          addrs.find((a: any) => a.type === 'S') ||
          addrs.find((a: any) => a.type === 'B' && a.isDefault) ||
          addrs[0];
        if (best) {
          destinationAddress =
            [best.street, best.zipCode, best.city].filter(Boolean).join(', ') || null;
        }
        if (!destinationAddress) {
          const [p] = await req.tenantClient
            .select({ name: schema.businessPartners.name })
            .from(schema.businessPartners)
            .where(eq(schema.businessPartners.id, dn.partnerId));
          if (p?.name) destinationAddress = p.name;
        }
      } catch {
        /* ignore */
      }
    }

    // Geocoding async — no bloquea si falla. Nominatim puede tardar, así
    // que lanzamos la query y esperamos con un timeout razonable antes de
    // persistir. Si no responde, el envío queda sin coords (fallback al
    // texto en la DriverApp).
    const coords = await geocodeAddress(destinationAddress).catch(() => null);

    const shipmentId = crypto.randomUUID();
    const reportToken = crypto.randomBytes(24).toString('hex');
    await req.tenantClient.insert(schema.shipments).values({
      id: shipmentId,
      deliveryNoteId: dnId,
      sourceDocType: 'SDN',
      sourceDocId: dnId,
      sourceOrderType: dn.orderId ? 'SO' : null,
      sourceOrderId: dn.orderId || null,
      reportToken,
      preparationStatus: 'picking',
      status: 'pending',
      destinationAddress,
      destinationLat: coords?.lat ?? null,
      destinationLng: coords?.lng ?? null,
      carrier: 'propio',
    });

    // Si la línea tiene lotes/series asignados en el SDN, creamos UNA tarea
    // por cada lote/serie con el batchNum y la cantidad pre-rellenados. Así
    // el operario sabe exactamente qué serie o lote coger.
    const taskRows: any[] = [];
    for (const l of lines as any[]) {
      const batches = batchesByLine.get(l.id) || [];
      if (batches.length > 0) {
        for (const b of batches) {
          taskRows.push({
            id: crypto.randomUUID(),
            docType: 'SDN',
            docId: dnId,
            docLineId: l.id,
            itemId: l.itemId,
            warehouseId: l.warehouseId,
            zoneId: l.zoneId,
            batchNumber: b.batchNum,
            requestedQty: Number(b.quantity),
            pickedQty: 0,
            status: 'pending',
            shipmentId,
          });
        }
      } else {
        taskRows.push({
          id: crypto.randomUUID(),
          docType: 'SDN',
          docId: dnId,
          docLineId: l.id,
          itemId: l.itemId,
          warehouseId: l.warehouseId,
          zoneId: l.zoneId,
          requestedQty: Number(l.quantity),
          pickedQty: 0,
          status: 'pending',
          shipmentId,
        });
      }
    }
    if (taskRows.length) await req.tenantClient.insert(schema.pickingTasks).values(taskRows);

    await emitTransition(
      req.tenantClient,
      req.tenantId,
      shipmentId,
      null,
      'picking',
      'Preparación iniciada desde SDN',
      'shipment.created',
      { sourceDocType: 'SDN', sourceDocId: dnId },
    );
    await HookManager.trigger('picking.started', {
      tenantId: req.tenantId,
      shipmentId,
      docType: 'SDN',
      docId: dnId,
    });

    res.json({ shipmentId, tasks: taskRows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Idem para PurchaseDeliveryNote — estado inicial `receiving`. */
router.post('/prep/from-pdn/:id', requireScope('write:logistics'), async (req: any, res) => {
  try {
    const dnId = req.params.id;
    const [dn] = await req.tenantClient
      .select()
      .from(schema.purchaseDeliveryNotes)
      .where(eq(schema.purchaseDeliveryNotes.id, dnId));
    if (!dn) return res.status(404).json({ error: 'Albarán no encontrado.' });

    const existing = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(
        and(eq(schema.shipments.sourceDocType, 'PDN'), eq(schema.shipments.sourceDocId, dnId)),
      );
    const alive = existing.find(
      (s: any) => s.preparationStatus !== 'cancelled' && s.preparationStatus !== 'received',
    );
    if (alive) {
      const tasks = await req.tenantClient
        .select()
        .from(schema.pickingTasks)
        .where(eq(schema.pickingTasks.shipmentId, alive.id));
      return res.json({ shipmentId: alive.id, reused: true, tasks });
    }

    const lines = await req.tenantClient
      .select()
      .from(schema.purchaseDeliveryNoteLines)
      .where(eq(schema.purchaseDeliveryNoteLines.deliveryId, dnId));

    const lineIds = lines.map((l: any) => l.id);
    const batchRows = lineIds.length
      ? await req.tenantClient
          .select()
          .from(schema.purchaseDeliveryNoteLineBatches)
          .where(inArray(schema.purchaseDeliveryNoteLineBatches.deliveryLineId, lineIds))
      : [];
    const batchesByLine = new Map<string, any[]>();
    for (const b of batchRows as any[]) {
      const arr = batchesByLine.get(b.deliveryLineId) || [];
      arr.push(b);
      batchesByLine.set(b.deliveryLineId, arr);
    }

    // Punto de recepción: preferimos `shipToAddress` del albarán; si está vacío,
    // caemos al almacén de destino (nombre + address) para que el operario sepa
    // dónde se descarga la mercancía.
    let destinationAddress: string | null = dn.shipToAddress || null;
    if (!destinationAddress && dn.warehouseId) {
      try {
        const [w] = await req.tenantClient
          .select()
          .from(schema.warehouses)
          .where(eq(schema.warehouses.id, dn.warehouseId));
        if (w) {
          destinationAddress = [w.name, w.address].filter(Boolean).join(' — ') || null;
        }
      } catch {
        /* ignore */
      }
    }

    const coords = await geocodeAddress(destinationAddress).catch(() => null);

    const shipmentId = crypto.randomUUID();
    const reportToken = crypto.randomBytes(24).toString('hex');
    await req.tenantClient.insert(schema.shipments).values({
      id: shipmentId,
      deliveryNoteId: dnId,
      sourceDocType: 'PDN',
      sourceDocId: dnId,
      sourceOrderType: dn.orderId ? 'PO' : null,
      sourceOrderId: dn.orderId || null,
      reportToken,
      preparationStatus: 'receiving',
      status: 'pending',
      destinationAddress,
      destinationLat: coords?.lat ?? null,
      destinationLng: coords?.lng ?? null,
      carrier: dn.carrier || 'propio',
    });

    const taskRows: any[] = [];
    for (const l of lines as any[]) {
      const batches = batchesByLine.get(l.id) || [];
      if (batches.length > 0) {
        for (const b of batches) {
          taskRows.push({
            id: crypto.randomUUID(),
            docType: 'PDN',
            docId: dnId,
            docLineId: l.id,
            itemId: l.itemId,
            warehouseId: l.warehouseId,
            zoneId: l.zoneId,
            batchNumber: b.batchNum,
            requestedQty: Number(b.quantity),
            pickedQty: 0,
            status: 'pending',
            shipmentId,
          });
        }
      } else {
        taskRows.push({
          id: crypto.randomUUID(),
          docType: 'PDN',
          docId: dnId,
          docLineId: l.id,
          itemId: l.itemId,
          warehouseId: l.warehouseId,
          zoneId: l.zoneId,
          requestedQty: Number(l.quantity),
          pickedQty: 0,
          status: 'pending',
          shipmentId,
        });
      }
    }
    if (taskRows.length) await req.tenantClient.insert(schema.pickingTasks).values(taskRows);

    await emitTransition(
      req.tenantClient,
      req.tenantId,
      shipmentId,
      null,
      'receiving',
      'Recepción iniciada desde PDN',
      'shipment.created',
      { sourceDocType: 'PDN', sourceDocId: dnId },
    );
    await HookManager.trigger('picking.started', {
      tenantId: req.tenantId,
      shipmentId,
      docType: 'PDN',
      docId: dnId,
    });

    res.json({ shipmentId, tasks: taskRows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Lista de tareas (filtros opcionales por query string). */
router.get('/prep/tasks', requireScope('read:logistics'), async (req: any, res) => {
  try {
    const conditions: any[] = [];
    if (req.query.shipmentId)
      conditions.push(eq(schema.pickingTasks.shipmentId, req.query.shipmentId));
    if (req.query.status) conditions.push(eq(schema.pickingTasks.status, req.query.status));
    if (req.query.assignedTo)
      conditions.push(eq(schema.pickingTasks.assignedUserId, req.query.assignedTo));
    if (req.query.docType && req.query.docId) {
      conditions.push(eq(schema.pickingTasks.docType, req.query.docType));
      conditions.push(eq(schema.pickingTasks.docId, req.query.docId));
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const q = req.tenantClient.select().from(schema.pickingTasks);
    const rows = await (where ? q.where(where) : q).orderBy(asc(schema.pickingTasks.createdAt));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Actualiza progreso de una tarea. Si al guardar todas las tareas del shipment
 * están `done`/`missing`, el shipment transita automáticamente a `packed`.
 */
router.patch('/prep/tasks/:id', requireScope('write:logistics'), async (req: any, res) => {
  try {
    const body = req.body || {};
    const [task] = await req.tenantClient
      .select()
      .from(schema.pickingTasks)
      .where(eq(schema.pickingTasks.id, req.params.id));
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada.' });

    const patch: any = {};
    for (const k of ['pickedQty', 'status', 'batchNumber', 'zoneId', 'warehouseId', 'notes']) {
      if (k in body) patch[k] = body[k];
    }
    // Auto-estado si el cliente no lo manda: por qty.
    if (!('status' in body) && 'pickedQty' in body) {
      const pq = Number(body.pickedQty);
      if (pq <= 0) patch.status = 'pending';
      else if (pq < Number(task.requestedQty)) patch.status = 'partial';
      else patch.status = 'done';
    }
    if (patch.status === 'done' || patch.status === 'missing') {
      patch.pickedByUserId = req.user?.id || task.pickedByUserId || null;
      patch.pickedAt = nowIso();
    }

    // Sustitución de lote/serie durante el picking: si cambia `batchNumber`
    // respecto al ya asignado, no basta con renombrar el campo — hay que
    // revertir el stock del lote original y descontarlo del nuevo, y
    // reflejar el cambio en la línea del albarán origen. Antes este campo
    // era puramente cosmético (nunca se leía en ningún otro sitio) y el
    // inventario registrado divergía del inventario físico realmente usado.
    if (
      'batchNumber' in patch &&
      patch.batchNumber &&
      task.batchNumber &&
      patch.batchNumber !== task.batchNumber &&
      task.itemId &&
      task.warehouseId
    ) {
      const oldBatch = task.batchNumber;
      const newBatch = patch.batchNumber;
      const qty = Number(task.requestedQty);
      try {
        await req.tenantClient.transaction(async (tx: any) => {
          const [newStock] = await tx
            .select({ quantity: schema.itemBatchStocks.quantity })
            .from(schema.itemBatchStocks)
            .where(
              and(
                eq(schema.itemBatchStocks.itemId, task.itemId),
                eq(schema.itemBatchStocks.batchNum, newBatch),
                eq(schema.itemBatchStocks.warehouseId, task.warehouseId),
              ),
            );
          if (!newStock || Number(newStock.quantity) < qty) {
            throw new Error(
              `Stock insuficiente en el lote ${newBatch}. Disponible: ${newStock?.quantity || 0}, necesario: ${qty}.`,
            );
          }

          // Revertir el lote antiguo (stock del almacén + global del artículo).
          await tx
            .update(schema.itemBatchStocks)
            .set({
              quantity: sql`${schema.itemBatchStocks.quantity} + ${qty}`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(schema.itemBatchStocks.itemId, task.itemId),
                eq(schema.itemBatchStocks.batchNum, oldBatch),
                eq(schema.itemBatchStocks.warehouseId, task.warehouseId),
              ),
            );
          await tx
            .update(schema.itemBatches)
            .set({ quantity: sql`${schema.itemBatches.quantity} + ${qty}` })
            .where(
              and(
                eq(schema.itemBatches.itemId, task.itemId),
                eq(schema.itemBatches.batchNum, oldBatch),
              ),
            );

          // Descontar del lote nuevo.
          await tx
            .update(schema.itemBatchStocks)
            .set({
              quantity: sql`${schema.itemBatchStocks.quantity} - ${qty}`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(schema.itemBatchStocks.itemId, task.itemId),
                eq(schema.itemBatchStocks.batchNum, newBatch),
                eq(schema.itemBatchStocks.warehouseId, task.warehouseId),
              ),
            );
          await tx
            .update(schema.itemBatches)
            .set({ quantity: sql`${schema.itemBatches.quantity} - ${qty}` })
            .where(
              and(
                eq(schema.itemBatches.itemId, task.itemId),
                eq(schema.itemBatches.batchNum, newBatch),
              ),
            );

          // Reflejar el lote realmente usado en la línea del albarán origen.
          if (task.docLineId) {
            const isSdn = task.docType === 'SDN';
            const batchesTable = isSdn
              ? schema.salesDeliveryNoteLineBatches
              : schema.purchaseDeliveryNoteLineBatches;
            await tx
              .update(batchesTable)
              .set({ batchNum: newBatch })
              .where(
                and(
                  eq(batchesTable.deliveryLineId, task.docLineId),
                  eq(batchesTable.batchNum, oldBatch),
                ),
              );
          }
        });
      } catch (e: any) {
        return res.status(400).json({ error: e.message || 'No se pudo sustituir el lote.' });
      }
    }

    await req.tenantClient
      .update(schema.pickingTasks)
      .set(patch)
      .where(eq(schema.pickingTasks.id, req.params.id));

    if (req.tenantId) {
      broadcastEvent(req.tenantId, {
        type: 'picking.task_changed',
        payload: {
          taskId: task.id,
          shipmentId: task.shipmentId,
          status: patch.status || task.status,
          pickedQty: 'pickedQty' in patch ? patch.pickedQty : task.pickedQty,
        },
      } as any);
    }
    HookManager.trigger('picking.taskUpdated', {
      tenantId: req.tenantId,
      taskId: task.id,
      shipmentId: task.shipmentId,
      status: patch.status || task.status,
    }).catch(() => {});

    // ¿Todas las tareas del shipment terminadas? → transición automática.
    if (task.shipmentId) {
      const all = await req.tenantClient
        .select()
        .from(schema.pickingTasks)
        .where(eq(schema.pickingTasks.shipmentId, task.shipmentId));
      const allDone =
        all.length > 0 && all.every((t: any) => t.status === 'done' || t.status === 'missing');
      if (allDone) {
        const [sh] = await req.tenantClient
          .select()
          .from(schema.shipments)
          .where(eq(schema.shipments.id, task.shipmentId));
        if (sh && sh.preparationStatus !== 'packed' && sh.preparationStatus !== 'received') {
          const nextStatus = sh.preparationStatus === 'receiving' ? 'received' : 'packed';
          await req.tenantClient
            .update(schema.shipments)
            .set({
              preparationStatus: nextStatus,
              preparedAt: nowIso(),
              preparedByUserId: req.user?.id || null,
              updatedAt: nowIso(),
            })
            .where(eq(schema.shipments.id, sh.id));
          await emitTransition(
            req.tenantClient,
            req.tenantId,
            sh.id,
            sh.preparationStatus,
            nextStatus,
            nextStatus === 'packed' ? 'Picking completado' : 'Recepción completada',
            nextStatus === 'packed' ? 'shipment.packed' : 'shipment.received',
          );
          HookManager.trigger('picking.completed', {
            tenantId: req.tenantId,
            shipmentId: sh.id,
            result: nextStatus,
          }).catch(() => {});
        }
      }
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Resincroniza las tareas de un Shipment con el albarán origen.
 *
 * Borra las tareas `pending` sin cantidad pickeada y las regenera desde las
 * líneas del SDN/PDN, copiando los lotes/series actualmente asignados. Las
 * tareas ya picked (done/missing) se conservan intactas.
 *
 * Útil cuando se cambian los lotes/series en el albarán DESPUÉS de iniciar
 * la preparación.
 */
router.post(
  '/prep/shipments/:id/resync',
  requireScope('write:logistics'),
  async (req: any, res) => {
    try {
      const [sh] = await req.tenantClient
        .select()
        .from(schema.shipments)
        .where(eq(schema.shipments.id, req.params.id));
      if (!sh) return res.status(404).json({ error: 'Shipment no encontrado.' });
      if (!sh.sourceDocType || !sh.sourceDocId)
        return res.status(400).json({ error: 'El envío no tiene albarán origen.' });

      // Tareas ya tocadas (conservar).
      const existingTasks = await req.tenantClient
        .select()
        .from(schema.pickingTasks)
        .where(eq(schema.pickingTasks.shipmentId, sh.id));
      const preservedTasks = existingTasks.filter(
        (t: any) => t.status === 'done' || t.status === 'missing' || Number(t.pickedQty) > 0,
      );

      // Borrar las pending.
      const deletable = existingTasks
        .filter((t: any) => !preservedTasks.some((p: any) => p.id === t.id))
        .map((t: any) => t.id);
      if (deletable.length) {
        await req.tenantClient
          .delete(schema.pickingTasks)
          .where(inArray(schema.pickingTasks.id, deletable));
      }

      // Cargar líneas + batches del albarán actual.
      const isSdn = sh.sourceDocType === 'SDN';
      const linesTable = isSdn ? schema.salesDeliveryNoteLines : schema.purchaseDeliveryNoteLines;
      const linesFk = isSdn
        ? schema.salesDeliveryNoteLines.deliveryId
        : schema.purchaseDeliveryNoteLines.deliveryId;
      const batchesTable = isSdn
        ? schema.salesDeliveryNoteLineBatches
        : schema.purchaseDeliveryNoteLineBatches;
      const batchesFk = isSdn
        ? schema.salesDeliveryNoteLineBatches.deliveryLineId
        : schema.purchaseDeliveryNoteLineBatches.deliveryLineId;

      const lines = await req.tenantClient
        .select()
        .from(linesTable)
        .where(eq(linesFk, sh.sourceDocId));
      const lineIds = lines.map((l: any) => l.id);
      const batchRows = lineIds.length
        ? await req.tenantClient.select().from(batchesTable).where(inArray(batchesFk, lineIds))
        : [];
      const batchesByLine = new Map<string, any[]>();
      for (const b of batchRows as any[]) {
        const arr = batchesByLine.get(b.deliveryLineId) || [];
        arr.push(b);
        batchesByLine.set(b.deliveryLineId, arr);
      }

      // Regenerar tareas pendientes saltando las combinaciones ya preservadas
      // (mismo docLineId + mismo batchNumber).
      const preservedKey = (t: any) => `${t.docLineId}::${t.batchNumber || ''}`;
      const preservedKeys = new Set(preservedTasks.map(preservedKey));
      const toInsert: any[] = [];
      for (const l of lines as any[]) {
        const batches = batchesByLine.get(l.id) || [];
        if (batches.length > 0) {
          for (const b of batches) {
            const k = `${l.id}::${b.batchNum}`;
            if (preservedKeys.has(k)) continue;
            toInsert.push({
              id: crypto.randomUUID(),
              docType: sh.sourceDocType,
              docId: sh.sourceDocId,
              docLineId: l.id,
              itemId: l.itemId,
              warehouseId: l.warehouseId,
              zoneId: l.zoneId,
              batchNumber: b.batchNum,
              requestedQty: Number(b.quantity),
              pickedQty: 0,
              status: 'pending',
              shipmentId: sh.id,
            });
          }
        } else {
          const k = `${l.id}::`;
          if (preservedKeys.has(k)) continue;
          toInsert.push({
            id: crypto.randomUUID(),
            docType: sh.sourceDocType,
            docId: sh.sourceDocId,
            docLineId: l.id,
            itemId: l.itemId,
            warehouseId: l.warehouseId,
            zoneId: l.zoneId,
            requestedQty: Number(l.quantity),
            pickedQty: 0,
            status: 'pending',
            shipmentId: sh.id,
          });
        }
      }
      if (toInsert.length) await req.tenantClient.insert(schema.pickingTasks).values(toInsert);

      res.json({
        ok: true,
        deleted: deletable.length,
        added: toInsert.length,
        preserved: preservedTasks.length,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

router.post('/prep/tasks/:id/assign', requireScope('write:logistics'), async (req: any, res) => {
  try {
    await req.tenantClient
      .update(schema.pickingTasks)
      .set({ assignedUserId: req.body?.assignedUserId || null })
      .where(eq(schema.pickingTasks.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Transiciones de Shipment ────────────────────────────────────

/**
 * Mueve el envío a un acopio: bulk-update de los packages existentes, y si
 * el envío aún no tiene ninguno, crea uno con el contenido de las tareas
 * `done` (materializa el paquete físico a partir del picking).
 */
router.post('/shipments/:id/to-staging', requireScope('write:logistics'), async (req: any, res) => {
  try {
    const body = req.body || {};
    const stagingAreaId = body.stagingAreaId || null;
    const [sh] = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(eq(schema.shipments.id, req.params.id));
    if (!sh) return res.status(404).json({ error: 'Shipment no encontrado.' });

    const existingPkgs = await req.tenantClient
      .select()
      .from(schema.packages)
      .where(eq(schema.packages.shipmentId, sh.id));

    let packagesAffected = 0;
    let packagesCreated = 0;

    if (existingPkgs.length > 0) {
      await req.tenantClient
        .update(schema.packages)
        .set({ stagingAreaId })
        .where(eq(schema.packages.shipmentId, sh.id));
      packagesAffected = existingPkgs.length;
    } else {
      // Materializa un paquete nuevo con las líneas de las tareas done.
      const tasks = await req.tenantClient
        .select()
        .from(schema.pickingTasks)
        .where(eq(schema.pickingTasks.shipmentId, sh.id));
      const doneTasks = tasks.filter((t: any) => t.status === 'done' && Number(t.pickedQty) > 0);
      if (doneTasks.length === 0) {
        return res.status(400).json({
          error: 'El envío no tiene paquetes ni tareas completadas para materializar.',
        });
      }
      const packageId = crypto.randomUUID();
      const code = genCode('PK');
      await req.tenantClient.insert(schema.packages).values({
        id: packageId,
        code,
        deliveryNoteId: sh.deliveryNoteId || null,
        shipmentId: sh.id,
        stagingAreaId,
        status: 'sealed',
        pickedAt: nowIso(),
        pickedByUserId: req.user?.id || null,
        sealedAt: nowIso(),
      });
      const lines = doneTasks.map((t: any) => ({
        id: crypto.randomUUID(),
        packageId,
        itemId: t.itemId,
        quantity: Number(t.pickedQty),
        sourceLineId: t.docLineId || null,
      }));
      await req.tenantClient.insert(schema.packageLines).values(lines);
      packagesCreated = 1;
      packagesAffected = 1;
    }

    // Si estaba packed, transita a ready (listo para salir del acopio).
    if (sh.preparationStatus === 'packed') {
      await req.tenantClient
        .update(schema.shipments)
        .set({ preparationStatus: 'ready', updatedAt: nowIso() })
        .where(eq(schema.shipments.id, sh.id));
      await emitTransition(
        req.tenantClient,
        req.tenantId,
        sh.id,
        'packed',
        'ready',
        `Movido a acopio (${packagesAffected} paquete${packagesAffected === 1 ? '' : 's'})`,
      );
    }

    res.json({ ok: true, packagesAffected, packagesCreated });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** packed → ready (listo para salir al muelle / asignar a ruta). */
router.post('/shipments/:id/ready', requireScope('write:logistics'), async (req: any, res) => {
  try {
    const [sh] = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(eq(schema.shipments.id, req.params.id));
    if (!sh) return res.status(404).json({ error: 'Shipment no encontrado.' });
    await req.tenantClient
      .update(schema.shipments)
      .set({ preparationStatus: 'ready', updatedAt: nowIso() })
      .where(eq(schema.shipments.id, sh.id));
    await emitTransition(
      req.tenantClient,
      req.tenantId,
      sh.id,
      sh.preparationStatus,
      'ready',
      'Listo para despachar',
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Despacho — asigna o crea RouteStop, marca dispatched. */
router.post('/shipments/:id/dispatch', requireScope('write:logistics'), async (req: any, res) => {
  try {
    const body = req.body || {};
    const [sh] = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(eq(schema.shipments.id, req.params.id));
    if (!sh) return res.status(404).json({ error: 'Shipment no encontrado.' });

    // Estados terminales → no se puede volver a despachar. Si el usuario
    // quiere reintentar, debe crear un shipment nuevo desde el albarán.
    // Esto mantiene el timeline del tracking coherente y evita que el
    // cliente reciba "devuelto" seguido de "en camino" sobre el mismo id.
    const terminal = ['returned', 'cancelled', 'delivered'];
    if (terminal.includes(sh.preparationStatus || '') || terminal.includes(sh.status || '')) {
      return res.status(409).json({
        error: `Este envío está en estado "${sh.preparationStatus || sh.status}" y no se puede volver a despachar. Crea un envío nuevo desde el albarán para reintentar.`,
        terminalStatus: sh.preparationStatus || sh.status,
      });
    }

    if (body.routeId && !body.routeStopId) {
      // ¿El shipment ya tiene una parada viva (no cancelada ni entregada)?
      // Si la tiene, NO creamos otra — según el caso:
      //   * misma ruta   → no-op, el shipment ya está ahí (idempotente).
      //   * otra ruta    → MOVEMOS la parada existente a la nueva ruta.
      // Así evitamos el bug de acabar con el mismo paquete dos veces en la
      // misma ruta (o en rutas distintas) después de despacharlo dos veces.
      const [existingStop] = await req.tenantClient
        .select()
        .from(schema.routeStops)
        .where(
          and(
            eq(schema.routeStops.shipmentId, sh.id),
            notInArray(schema.routeStops.status, ['cancelled', 'delivered']),
          ),
        )
        .limit(1);

      if (existingStop) {
        if (existingStop.routeId === body.routeId) {
          // Ya asignado a esta ruta — nada que hacer con el stop.
        } else {
          // Mover la parada existente a la nueva ruta, al final.
          const existingInTarget = await req.tenantClient
            .select({ sequence: schema.routeStops.sequence })
            .from(schema.routeStops)
            .where(eq(schema.routeStops.routeId, body.routeId));
          const nextSeq =
            (existingInTarget.reduce((m: number, s: any) => Math.max(m, s.sequence || 0), 0) || 0) +
            1;
          await req.tenantClient
            .update(schema.routeStops)
            .set({ routeId: body.routeId, sequence: nextSeq })
            .where(eq(schema.routeStops.id, existingStop.id));
        }
      } else {
        // No existe ningún stop → crear uno al final de la ruta.
        const inTarget = await req.tenantClient
          .select({ sequence: schema.routeStops.sequence })
          .from(schema.routeStops)
          .where(eq(schema.routeStops.routeId, body.routeId));
        const nextSeq =
          (inTarget.reduce((m: number, s: any) => Math.max(m, s.sequence || 0), 0) || 0) + 1;
        await req.tenantClient.insert(schema.routeStops).values({
          id: crypto.randomUUID(),
          routeId: body.routeId,
          sequence: nextSeq,
          shipmentId: sh.id,
          address: sh.destinationAddress || null,
        });
      }
    } else if (body.routeStopId) {
      await req.tenantClient
        .update(schema.routeStops)
        .set({ shipmentId: sh.id })
        .where(eq(schema.routeStops.id, body.routeStopId));
    }

    // `dispatched` en ambos campos — `in_transit` llega después, cuando el
    // conductor pulsa "Iniciar ruta" (POST /routes/:id/start), no al despachar.
    await req.tenantClient
      .update(schema.shipments)
      .set({
        preparationStatus: 'dispatched',
        dispatchedAt: nowIso(),
        status: 'dispatched',
        updatedAt: nowIso(),
      })
      .where(eq(schema.shipments.id, sh.id));
    await emitTransition(
      req.tenantClient,
      req.tenantId,
      sh.id,
      sh.preparationStatus,
      'dispatched',
      sh.kind === 'pickup_return' ? 'Recogida asignada a ruta' : 'Despachado',
      'shipment.dispatched',
      { routeId: body.routeId || null },
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Recepción inbound completada. */
router.post('/shipments/:id/receive', requireScope('write:logistics'), async (req: any, res) => {
  try {
    const [sh] = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(eq(schema.shipments.id, req.params.id));
    if (!sh) return res.status(404).json({ error: 'Shipment no encontrado.' });
    await req.tenantClient
      .update(schema.shipments)
      .set({
        preparationStatus: 'received',
        receivedAt: nowIso(),
        status: 'delivered',
        updatedAt: nowIso(),
      })
      .where(eq(schema.shipments.id, sh.id));
    await emitTransition(
      req.tenantClient,
      req.tenantId,
      sh.id,
      sh.preparationStatus,
      'received',
      'Recepción confirmada',
      'shipment.received',
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Consulta por documento origen + detalle rico para integraciones ──

router.get(
  '/shipments/by-doc/:docType/:docId',
  requireScope('read:logistics'),
  async (req: any, res) => {
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
  },
);

/**
 * Autocomplete de direcciones para el buscador del mapa (ShipmentDetail,
 * RouteMapPlanner…). Delegamos en Photon que soporta búsquedas parciales.
 */
router.get('/geocode/suggest', async (req: any, res) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    if (!q || q.length < 3) return res.json([]);

    // Si hay MapTiler key, lo preferimos — mejor precisión en direcciones
    // residenciales que Photon. Formato similar: features con place_type,
    // place_name, center [lng, lat].
    const mtKey = process.env.MAPTILER_API_KEY?.trim();
    if (mtKey) {
      const mtUrl = `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${encodeURIComponent(mtKey)}&language=es&country=es&limit=8&autocomplete=true`;
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 5000);
      try {
        const r = await fetch(mtUrl, { signal: c.signal, headers: { Accept: 'application/json' } });
        if (r.ok) {
          const data: any = await r.json();
          const feats = Array.isArray(data?.features) ? data.features : [];
          const results = feats
            .map((f: any) => {
              const coords =
                f.center || (f.geometry?.type === 'Point' ? f.geometry.coordinates : null);
              if (!coords || coords.length < 2) return null;
              const ctx: any[] = Array.isArray(f.context) ? f.context : [];
              const city = ctx.find(
                (x: any) => (x.id || '').startsWith('place') || (x.id || '').startsWith('locality'),
              )?.text;
              const postcode = ctx.find((x: any) => (x.id || '').startsWith('postal_code'))?.text;
              const types: string[] = Array.isArray(f.place_type) ? f.place_type : [];
              return {
                label: f.place_name || f.text || '',
                lat: Number(coords[1]),
                lng: Number(coords[0]),
                type: types[0] || null,
                housenumber: f.address || null,
                street: f.text || null,
                city: city || null,
                postcode: postcode || null,
              };
            })
            .filter(Boolean);
          clearTimeout(t);
          return res.json(results);
        }
      } catch {
        /* cae a Photon */
      } finally {
        clearTimeout(t);
      }
    }

    // Fallback: Photon. Probamos con variantes si la query lleva CP/comas
    // extrañas — Photon es sensible a formato.
    //   1. La query tal cual.
    //   2. Sin comas (Photon prefiere espacios).
    //   3. Sólo calle + ciudad (quitamos CP).
    //   4. Tal cual + ", España" si no lleva ya el país.
    const variants: string[] = [];
    const add = (v: string) => {
      const clean = v.replace(/\s+/g, ' ').trim();
      if (clean.length >= 3 && !variants.includes(clean)) variants.push(clean);
    };
    add(q);
    add(q.replace(/,+/g, ' '));
    // "Calle la florida, 13, 06209, Solana" → "Calle la florida 13 Solana"
    add(
      q
        .replace(/,+/g, ' ')
        .replace(/\b\d{5}\b/g, '') // quita CPs
        .replace(/\s+/g, ' ')
        .trim(),
    );
    if (!/espa(ñ|n)a/i.test(q)) add(`${q}, España`);

    for (const v of variants) {
      const url = `https://photon.komoot.io/api/?lang=es&limit=8&q=${encodeURIComponent(v)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const r = await fetch(url, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Keirost-ERP/1.0',
          },
        });
        if (!r.ok) continue;
        const data: any = await r.json();
        const features = Array.isArray(data?.features) ? data.features : [];
        if (features.length === 0) continue;
        const results = features.map((f: any) => {
          const p = f.properties || {};
          const coords = f.geometry?.coordinates || [];
          const parts = [
            p.name,
            p.housenumber ? `${p.street || ''} ${p.housenumber}`.trim() : p.street,
            p.postcode,
            p.city || p.town || p.village,
            p.country,
          ].filter(Boolean);
          return {
            label: parts.join(', '),
            lat: Number(coords[1]),
            lng: Number(coords[0]),
            type: p.type || p.osm_value || null,
            housenumber: p.housenumber || null,
            street: p.street || null,
            city: p.city || p.town || p.village || null,
            postcode: p.postcode || null,
          };
        });
        return res.json(results);
      } catch {
        // Siguiente variante
      } finally {
        clearTimeout(timer);
      }
    }

    // Ninguna variante dio resultados.
    res.json([]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/shipments/:id/track', requireScope('read:logistics'), async (req: any, res) => {
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

export default router;

// ─────────────────────────────────────────────────────────────────
// ENDPOINT PÚBLICO DE REPORTE DE POSICIÓN (sin auth del usuario)
//
// Se monta aparte en server.ts porque NO debe pasar por el middleware
// de auth/tenant — se identifica al shipment por `reportToken`.
// ─────────────────────────────────────────────────────────────────

export const publicTrackRouter = Router();

/**
 * Rango de progreso para elegir el status "más avanzado" entre el legacy
 * (`status`) y el canónico (`preparationStatus`) de un mismo shipment.
 * `receiving`/`received` (flujo INBOUND de recepción de compra) tienen rango
 * propio, distinto de `out_for_delivery`/`delivered` (flujo OUTBOUND de
 * entrega a cliente) — antes compartían rango con esos y podían mezclar
 * ambos flujos al elegir "el más avanzado".
 */
const SHIPMENT_STAGE_RANK: Record<string, number> = {
  draft: 0,
  pending: 1,
  picking: 2,
  packed: 3,
  ready: 4,
  dispatched: 5,
  in_transit: 6,
  out_for_delivery: 7,
  postponed: 7,
  receiving: 8,
  received: 9,
  delivered: 10,
  exception: 11,
  returned: 11,
  cancelled: 11,
};

/**
 * Status "más avanzado" entre `preparationStatus` y el legacy `status` de un
 * mismo shipment — protege contra envíos donde solo uno de los dos se
 * actualizó (p. ej. delivered antes del sync automático). Usado tanto por el
 * GET público como por el chat, para que ambos reporten siempre la misma
 * etapa (antes el chat usaba `preparationStatus || status` sin comparar
 * rangos, pudiendo desincronizarse del status mostrado en la página).
 */
function resolveShipmentStage(
  preparationStatus: string | null | undefined,
  status: string | null | undefined,
): string | null {
  const a = preparationStatus || status || null;
  const b = status || preparationStatus || null;
  return (SHIPMENT_STAGE_RANK[a || ''] ?? -1) >= (SHIPMENT_STAGE_RANK[b || ''] ?? -1) ? a : b;
}

/**
 * GET público de seguimiento — devuelve status + últimos eventos + última
 * posición. Sin datos sensibles (no partner, no líneas, no precios).
 *
 * Uso típico: un cliente final recibe un enlace `/track/<token>` y consulta.
 */
publicTrackRouter.get('/track/:token', async (req: any, res) => {
  try {
    const token = req.params.token;
    if (!token || token.length < 16) return res.status(400).json({ error: 'token' });
    const tenantId = await resolveTenantByReportToken(token);
    if (!tenantId) return res.status(404).json({ error: 'token desconocido' });
    const tenantDb = await getTenantDb(tenantId);
    const [s] = await tenantDb
      .select({
        id: schema.shipments.id,
        preparationStatus: schema.shipments.preparationStatus,
        status: schema.shipments.status,
        kind: schema.shipments.kind,
        destinationAddress: schema.shipments.destinationAddress,
        destinationLat: schema.shipments.destinationLat,
        destinationLng: schema.shipments.destinationLng,
        lastLat: schema.shipments.lastLat,
        lastLng: schema.shipments.lastLng,
        lastLocationAt: schema.shipments.lastLocationAt,
        estimatedDelivery: schema.shipments.estimatedDelivery,
        deliveredAt: schema.shipments.deliveredAt,
        createdAt: schema.shipments.createdAt,
        updatedAt: schema.shipments.updatedAt,
      })
      .from(schema.shipments)
      .where(eq(schema.shipments.reportToken, token));
    if (!s) return res.status(404).json({ error: 'shipment' });

    const events = await tenantDb
      .select({
        kind: schema.shipmentEvents.kind,
        status: schema.shipmentEvents.status,
        description: schema.shipmentEvents.description,
        createdAt: schema.shipmentEvents.createdAt,
      })
      .from(schema.shipmentEvents)
      .where(eq(schema.shipmentEvents.shipmentId, s.id))
      .orderBy(desc(schema.shipmentEvents.createdAt))
      .limit(50);

    const mostAdvanced = resolveShipmentStage(s.preparationStatus, s.status);

    // Chat de Keiro en esta página: solo si el tenant lo activó
    // explícitamente (flag off por defecto, ver appConfig.ts) Y tiene la IA
    // configurada — así el frontend sabe si mostrar el punto de entrada sin
    // una llamada extra.
    const [flags, aiCfg] = await Promise.all([
      getConfigSection(tenantDb, 'flags', FLAGS_DEFAULTS),
      getAiConfig(tenantDb),
    ]);
    const chatEnabled = !!flags.trackingChatEnabled && !!aiCfg.enabled;

    res.json({
      status: mostAdvanced || s.status,
      legacyStatus: s.status,
      kind: s.kind || 'delivery',
      destination: { address: s.destinationAddress || null },
      lastPosition:
        s.lastLat != null && s.lastLng != null
          ? { lat: s.lastLat, lng: s.lastLng, reportedAt: s.lastLocationAt }
          : null,
      estimatedDelivery: s.estimatedDelivery,
      deliveredAt: s.deliveredAt,
      events,
      updatedAt: s.updatedAt,
      chatEnabled,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST público de chat de Keiro para ESTE envío — sin login, igual que el
 * GET de arriba. Solo responde si el tenant activó `flags.trackingChatEnabled`
 * y tiene la IA configurada; el motor (`trackingChatEngine.ts`) no tiene
 * acceso a nada fuera de este envío — ver su cabecera para el porqué.
 */
publicTrackRouter.post('/track/:token/chat', async (req: any, res) => {
  try {
    const token = req.params.token;
    if (!token || token.length < 16) return res.status(400).json({ error: 'token' });

    const tenantId = await resolveTenantByReportToken(token);
    if (!tenantId) return res.status(404).json({ error: 'token desconocido' });
    const tenantDb = await getTenantDb(tenantId);

    const flags = await getConfigSection(tenantDb, 'flags', FLAGS_DEFAULTS);
    if (!flags.trackingChatEnabled) {
      return res.status(403).json({ error: 'El chat no está disponible para este envío' });
    }
    const aiCfg = await getAiConfig(tenantDb);
    if (!aiCfg.enabled) {
      return res
        .status(400)
        .json({ error: 'El asistente de IA no está activado para esta empresa' });
    }

    if (!checkTrackingChatRateLimit(token)) {
      return res
        .status(429)
        .json({ error: 'Demasiados mensajes — inténtalo de nuevo en unos minutos' });
    }

    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (messages.length === 0) return res.status(400).json({ error: 'messages es obligatorio' });
    // Límites laxos pero explícitos — esta ruta es pública y sin login, no
    // hay ningún otro freno de tamaño de payload aquí.
    if (messages.length > 40)
      return res.status(400).json({ error: 'Conversación demasiado larga' });
    if (JSON.stringify(messages).length > 20_000) {
      return res.status(400).json({ error: 'Mensaje demasiado largo' });
    }

    const [s] = await tenantDb
      .select({
        id: schema.shipments.id,
        preparationStatus: schema.shipments.preparationStatus,
        status: schema.shipments.status,
        kind: schema.shipments.kind,
        destinationAddress: schema.shipments.destinationAddress,
        estimatedDelivery: schema.shipments.estimatedDelivery,
        deliveredAt: schema.shipments.deliveredAt,
      })
      .from(schema.shipments)
      .where(eq(schema.shipments.reportToken, token));
    if (!s) return res.status(404).json({ error: 'shipment' });

    const events = await tenantDb
      .select({
        kind: schema.shipmentEvents.kind,
        status: schema.shipmentEvents.status,
        description: schema.shipmentEvents.description,
        createdAt: schema.shipmentEvents.createdAt,
      })
      .from(schema.shipmentEvents)
      .where(eq(schema.shipmentEvents.shipmentId, s.id))
      .orderBy(desc(schema.shipmentEvents.createdAt))
      .limit(20);

    const result = await streamTrackingChat({
      aiConfig: aiCfg,
      tenantClient: tenantDb,
      tenantId,
      shipment: {
        id: s.id,
        status: resolveShipmentStage(s.preparationStatus, s.status),
        kind: s.kind || 'delivery',
        destinationAddress: s.destinationAddress,
        estimatedDelivery: s.estimatedDelivery,
        deliveredAt: s.deliveredAt,
        events,
      },
      messages,
    });

    result.pipeUIMessageStreamToResponse(res, {
      onError: (e: unknown) => (e instanceof Error ? e.message : 'Error del asistente'),
    });
  } catch (e: any) {
    console.error('[publicTrackRouter.chat]', e);
    if (!res.headersSent) {
      res.status(502).json({ error: e?.message || 'Error en el chat de seguimiento' });
    } else {
      res.end();
    }
  }
});

publicTrackRouter.post('/track/:token/position', async (req: any, res) => {
  try {
    const token = req.params.token;
    if (!token || token.length < 16) return res.status(400).json({ error: 'token' });

    // Buscamos el shipment por token en todos los tenants — primero obtenemos
    // el tenant via lookup global. Como el schema per tenant, iteramos hasta
    // dar con uno. Para acelerar, guardamos un índice en memoria.
    const tenantId = await resolveTenantByReportToken(token);
    if (!tenantId) return res.status(404).json({ error: 'token desconocido' });

    const tenantDb = await getTenantDb(tenantId);
    const [s] = await tenantDb
      .select()
      .from(schema.shipments)
      .where(eq(schema.shipments.reportToken, token));
    if (!s) return res.status(404).json({ error: 'shipment' });

    const body = req.body || {};
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng))
      return res.status(400).json({ error: 'lat/lng requeridos' });

    const id = crypto.randomUUID();
    await tenantDb.insert(schema.shipmentPositions).values({
      id,
      shipmentId: s.id,
      lat,
      lng,
      speedKmh: body.speedKmh ?? null,
      heading: body.heading ?? null,
      accuracyMeters: body.accuracyMeters ?? null,
    });
    // Actualiza denormalizado en Shipment.
    await tenantDb
      .update(schema.shipments)
      .set({ lastLat: lat, lastLng: lng, lastLocationAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.shipments.id, s.id));

    broadcastEvent(tenantId, {
      type: 'shipment.position',
      payload: { shipmentId: s.id, lat, lng, at: Date.now() },
    } as any);

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

async function resolveTenantByReportToken(token: string): Promise<string | null> {
  // Busca en todos los tenants. Sin cache, O(N). Si hay muchos tenants
  // conviene añadir cache LRU (TTL ~60s) — fuera de alcance por ahora.
  const publicDb = ClientFactory.getClient('public');
  const tenants = await publicDb.select().from(schema.tenants);
  for (const t of tenants as any[]) {
    try {
      const tenantDb = ClientFactory.getClient(t.schemaName);
      const [s] = await tenantDb
        .select({ id: schema.shipments.id })
        .from(schema.shipments)
        .where(eq(schema.shipments.reportToken, token));
      if (s) return t.id;
    } catch {
      /* schema sin la tabla aún — ignorar */
    }
  }
  return null;
}

async function getTenantDb(tenantId: string) {
  const publicDb = ClientFactory.getClient('public');
  const [t] = await publicDb
    .select({ schemaName: schema.tenants.schemaName })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId));
  if (!t) throw new Error('tenant no encontrado');
  return ClientFactory.getClient(t.schemaName);
}
