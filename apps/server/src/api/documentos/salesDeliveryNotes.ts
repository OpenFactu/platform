import { Router } from 'express';
import { and, eq, inArray, notInArray, sql, desc } from 'drizzle-orm';
import * as schema from '../../db/schema';
import crypto from 'crypto';
import { renderDocumentPdf } from '../../core/documents/renderDocumentPdf';
import { logAudit } from '../../utils/audit';
import { notifyShipmentStageChange } from '../../core/logistics/shipmentNotifications';
import { dispatchEvent } from '../../core/webhooks/WebhookQueue';
import { DocumentEngine } from '../../core/documents/DocumentEngine';
import { DocumentRegistry } from '../../core/documents/DocumentRegistry';

const router = Router();
const config = DocumentRegistry.get('SDN');

// GET all delivery notes
router.get('/', async (req: any, res) => {
  try {
    const results = await req.tenantClient
      .select({
        id: schema.salesDeliveryNotes.id,
        docNum: schema.salesDeliveryNotes.docNum,
        seriesPrefix: schema.documentSeries.prefix,
        numberingMode: schema.documentSeries.numberingMode,
        periodCode: schema.accountingPeriods.code,
        date: schema.salesDeliveryNotes.date,
        partnerId: schema.salesDeliveryNotes.partnerId,
        total: schema.salesDeliveryNotes.total,
        status: schema.salesDeliveryNotes.status,
        orderId: schema.salesDeliveryNotes.orderId,
        orderDocNum: schema.salesOrders.docNum,
        orderPrefix: sql`(SELECT "prefix" FROM "DocumentSeries" WHERE id = ${schema.salesOrders.seriesId})`,
      })
      .from(schema.salesDeliveryNotes)
      .leftJoin(schema.salesOrders, eq(schema.salesDeliveryNotes.orderId, schema.salesOrders.id))
      .leftJoin(
        schema.documentSeries,
        eq(schema.salesDeliveryNotes.seriesId, schema.documentSeries.id),
      )
      .leftJoin(
        schema.accountingPeriods,
        eq(schema.salesDeliveryNotes.periodId, schema.accountingPeriods.id),
      )
      .orderBy(desc(schema.salesDeliveryNotes.date));

    // Enriquecer con info de preparación — ¿tiene shipment vivo vinculado?
    // Así el UI puede mostrar un badge "En preparación" y ocultar el botón
    // Preparar cuando ya se ha disparado. Una sola query + map en memoria.
    const ids = results.map((r: any) => r.id);
    let shipmentMap = new Map<string, string>();
    let shipmentStatusMap = new Map<string, string>();
    if (ids.length > 0) {
      // 'delivered' cuenta como shipment activo/bloqueante a efectos de este
      // badge: el albarán ya se entregó, así que no debe volver a ofrecerse
      // "Preparar envío" (ver prep/from-sdn en logistics.ts, mismo criterio).
      const activeShipments = await req.tenantClient
        .select({
          id: schema.shipments.id,
          sourceDocId: schema.shipments.sourceDocId,
          preparationStatus: schema.shipments.preparationStatus,
        })
        .from(schema.shipments)
        .where(
          and(
            eq(schema.shipments.sourceDocType, 'SDN'),
            inArray(schema.shipments.sourceDocId, ids),
            notInArray(schema.shipments.preparationStatus, ['cancelled', 'returned']),
          ),
        );
      for (const s of activeShipments as any[]) {
        if (s.sourceDocId) {
          shipmentMap.set(s.sourceDocId, s.id);
          shipmentStatusMap.set(s.sourceDocId, s.preparationStatus);
        }
      }
    }
    const enriched = results.map((r: any) => ({
      ...r,
      hasActiveShipment: shipmentMap.has(r.id),
      activeShipmentId: shipmentMap.get(r.id) || null,
      activeShipmentStatus: shipmentStatusMap.get(r.id) || null,
    }));
    res.json(enriched);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET detail
router.get('/:id', async (req: any, res) => {
  try {
    const [header] = await req.tenantClient
      .select({
        header: schema.salesDeliveryNotes,
        seriesPrefix: schema.documentSeries.prefix,
        numberingMode: schema.documentSeries.numberingMode,
        periodCode: schema.accountingPeriods.code,
        orderDocNum: schema.salesOrders.docNum,
        orderPrefix: sql`(SELECT "prefix" FROM "DocumentSeries" WHERE id = ${schema.salesOrders.seriesId})`,
      })
      .from(schema.salesDeliveryNotes)
      .leftJoin(schema.salesOrders, eq(schema.salesDeliveryNotes.orderId, schema.salesOrders.id))
      .leftJoin(
        schema.documentSeries,
        eq(schema.salesDeliveryNotes.seriesId, schema.documentSeries.id),
      )
      .leftJoin(
        schema.accountingPeriods,
        eq(schema.salesDeliveryNotes.periodId, schema.accountingPeriods.id),
      )
      .where(eq(schema.salesDeliveryNotes.id, req.params.id));

    if (!header) return res.status(404).json({ error: 'No encontrado' });

    // Mismo criterio que el listado (`GET /`, arriba): un shipment 'delivered'
    // también cuenta como activo/bloqueante — si no, el botón "Preparar envío"
    // del detalle (que no reutilizaba este campo) volvía a aparecer para un
    // albarán ya entregado o ya en preparación.
    const [activeShipment] = await req.tenantClient
      .select({
        id: schema.shipments.id,
        preparationStatus: schema.shipments.preparationStatus,
      })
      .from(schema.shipments)
      .where(
        and(
          eq(schema.shipments.sourceDocType, 'SDN'),
          eq(schema.shipments.sourceDocId, req.params.id),
          notInArray(schema.shipments.preparationStatus, ['cancelled', 'returned']),
        ),
      );

    const lines = await req.tenantClient
      .select()
      .from(schema.salesDeliveryNoteLines)
      .where(eq(schema.salesDeliveryNoteLines.deliveryId, req.params.id));

    const linesWithBatches = await Promise.all(
      lines.map(async (line: any) => {
        const batches = await req.tenantClient
          .select()
          .from(schema.salesDeliveryNoteLineBatches)
          .where(eq(schema.salesDeliveryNoteLineBatches.deliveryLineId, line.id));

        return {
          ...line,
          batchDetails: batches.map((b: any) => ({
            batchNum: b.batchNum,
            quantity: Number(b.quantity),
          })),
        };
      }),
    );

    res.json({
      ...header.header,
      seriesPrefix: header.seriesPrefix,
      numberingMode: header.numberingMode,
      periodCode: header.periodCode,
      orderDocNum: header.orderDocNum,
      orderPrefix: header.orderPrefix,
      lines: linesWithBatches,
      hasActiveShipment: !!activeShipment,
      activeShipmentId: activeShipment?.id || null,
      activeShipmentStatus: activeShipment?.preparationStatus || null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /:id/pdf
router.get('/:id/pdf', async (req: any, res) => {
  try {
    await renderDocumentPdf(
      'SDN',
      req.params.id,
      req.query.templateId as string | undefined,
      req.tenantClient,
      res,
      req.tenantId,
    );
  } catch (error: any) {
    console.error('[SalesDeliveryNote PDF] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST new sales delivery note (Relieved Goods) — usa DocumentEngine en vez
// de lógica inline (numeración, stock global/almacén/zona, lotes con
// auto-FIFO, stock insuficiente y fulfillment parcial de pedido viven ahora
// como capacidades del motor / hooks de `salesDeliveryNoteHooks`).
router.post('/', async (req: any, res) => {
  try {
    const result = await DocumentEngine.create(
      req.tenantId,
      req.tenantClient,
      req.user,
      {
        tableName: config.tableName,
        schemaTable: config.schemaTable,
        lineSchemaTable: config.lineSchemaTable,
        batchSchemaTable: config.batchSchemaTable,
        eventPrefix: config.eventPrefix,
        stockAction: config.stockAction,
        closeBaseDocuments: config.closeBaseDocuments,
        initialStatus: config.initialStatus,
        hooks: config.hooks,
      },
      req.body,
    );

    res.json(result);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'SalesDeliveryNote',
      entityId: result.id,
      action: 'CREATE',
      newValue: { docNum: result.docNum, partnerId: req.body.partnerId },
    });
  } catch (error: any) {
    console.error('[SalesDeliveryNote API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /:id/cancel — Cancela un albarán de venta, devolviendo stock y
// reabriendo el pedido origen. En modo logística integrada, también
// propaga la cancelación al Shipment activo si existe.
//
// Body: { reason?: string; force?: boolean }
//   - reason: motivo, se registra en audit + shipmentEvents.
//   - force:  obligatorio si el envío ya está en ruta (in_transit /
//             out_for_delivery). Protege contra cancelaciones accidentales
//             cuando el conductor ya está circulando con el paquete.
router.post('/:id/cancel', async (req: any, res) => {
  try {
    const body = req.body || {};

    // Pre-check del shipment vinculado — fuera de la transacción porque
    // un rechazo no debe dejar la tx abierta.
    const [activeShipment] = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(
        sql`${schema.shipments.sourceDocType} = 'SDN' AND ${schema.shipments.sourceDocId} = ${req.params.id} AND ${schema.shipments.preparationStatus} NOT IN ('cancelled','delivered','returned')`,
      );
    if (activeShipment) {
      if (activeShipment.preparationStatus === 'delivered') {
        return res.status(409).json({
          error:
            'El envío ya ha sido entregado. Usa "Devolver" en el envío en lugar de cancelar el albarán.',
        });
      }
      const inRoute = ['in_transit', 'out_for_delivery'].includes(activeShipment.preparationStatus);
      if (inRoute && !body.force) {
        return res.status(409).json({
          error:
            'El envío está en ruta. Confirma con force=true para cancelarlo — el conductor debe volver sin entregar.',
          requiresForce: true,
          shipmentId: activeShipment.id,
          shipmentStatus: activeShipment.preparationStatus,
        });
      }
    }

    const result = await req.tenantClient.transaction(async (tx: any) => {
      const [header] = await tx
        .select()
        .from(schema.salesDeliveryNotes)
        .where(eq(schema.salesDeliveryNotes.id, req.params.id));
      if (!header) throw new Error('Albarán no encontrado');
      if (header.status === 'X') throw new Error('El albarán ya está cancelado');
      if (header.status === 'C') throw new Error('No se puede cancelar un albarán ya facturado');

      // Revierte stock (global/almacén/zona/lotes), marca 'X' y decrementa el
      // fulfillment del Pedido de Venta origen — todo vía DocumentEngine
      // (el hook `afterCancel` de SDN hace el paso D de antes).
      await DocumentEngine.cancel(
        tx,
        req.tenantId,
        req.user,
        {
          tableName: config.tableName,
          schemaTable: config.schemaTable,
          lineSchemaTable: config.lineSchemaTable,
          batchSchemaTable: config.batchSchemaTable,
          eventPrefix: config.eventPrefix,
          stockAction: config.stockAction,
          closeBaseDocuments: config.closeBaseDocuments,
          hooks: config.hooks,
        },
        req.params.id,
      );

      // 2b. Propagar al shipment vinculado (si existe y sigue vivo) +
      // cancelar picking tasks asociadas. La cancelación fiscal del
      // albarán debe parar también la operación logística.
      if (activeShipment) {
        await tx
          .update(schema.shipments)
          .set({
            status: 'cancelled',
            preparationStatus: 'cancelled',
            updatedAt: new Date(),
          })
          .where(eq(schema.shipments.id, activeShipment.id));

        await tx.insert(schema.shipmentEvents).values({
          id: crypto.randomUUID(),
          shipmentId: activeShipment.id,
          kind: 'status_change',
          status: 'cancelled',
          description: body.reason
            ? `Cancelado al anular el albarán: ${body.reason}`
            : 'Cancelado al anular el albarán de venta',
        });

        // Picking tasks pendientes → cancelled (el almacén deja de
        // procesarlas).
        try {
          await tx
            .update(schema.pickingTasks)
            .set({ status: 'cancelled' })
            .where(
              sql`${schema.pickingTasks.shipmentId} = ${activeShipment.id} AND ${schema.pickingTasks.status} IN ('pending','in_progress')`,
            );
        } catch {
          /* tabla opcional, si no existe pickingTasks no rompemos */
        }
      }

      return { success: true };
    });

    res.json({
      ...result,
      shipmentCancelled: !!activeShipment,
      shipmentId: activeShipment?.id || null,
    });

    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'SalesDeliveryNote',
      entityId: req.params.id,
      action: 'DELETE',
      newValue: { reason: body.reason || null, force: !!body.force },
    });

    // Side-effects fire-and-forget: no bloquean la respuesta al cliente.
    dispatchEvent(req.tenantId, 'sales_delivery_note.cancelled', {
      id: req.params.id,
      reason: body.reason || null,
      shipmentId: activeShipment?.id || null,
    }).catch(() => {});

    if (activeShipment) {
      // Deducir la URL pública desde el Origin del request (sin tocar tenant
      // config para no hacer esta ruta async).
      const origin = (req.headers?.origin as string | undefined) || '';
      const baseUrl =
        process.env.PUBLIC_BASE_URL?.trim() || origin || `${req.protocol}://${req.get('host')}`;
      notifyShipmentStageChange(
        req.tenantClient,
        req.tenantId,
        activeShipment.id,
        'cancelled' as any,
        baseUrl.replace(/\/$/, ''),
      ).catch(() => {});
      dispatchEvent(req.tenantId, 'shipment.cancelled', {
        id: activeShipment.id,
        reason: body.reason || null,
        cascadedFrom: 'sales_delivery_note',
      }).catch(() => {});
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
