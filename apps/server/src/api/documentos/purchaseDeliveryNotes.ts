import { Router } from 'express';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import crypto from 'crypto';
import { renderDocumentPdf } from '../../core/documents/renderDocumentPdf';
import { logAudit } from '../../utils/audit';
import { notifyShipmentStageChange } from '../../core/logistics/shipmentNotifications';
import { dispatchEvent } from '../../core/webhooks/WebhookQueue';
import { DocumentEngine } from '../../core/documents/DocumentEngine';
import { DocumentRegistry } from '../../core/documents/DocumentRegistry';
import { contextOf } from '../logistics/shared';
import { cancelLinkedShipment } from '../../core/logistics/shipmentActions';
import { runEffects, type Effect } from '../../core/logistics/shipmentTransitions';
import { statusError } from '../../core/documents/documentRules';

const router = Router();
const config = DocumentRegistry.get('PDN');

// GET all delivery notes
router.get('/', async (req: any, res) => {
  try {
    const results = await req.tenantClient
      .select({
        id: schema.purchaseDeliveryNotes.id,
        docNum: schema.purchaseDeliveryNotes.docNum,
        seriesPrefix: schema.documentSeries.prefix,
        numberingMode: schema.documentSeries.numberingMode,
        periodCode: schema.accountingPeriods.code,
        date: schema.purchaseDeliveryNotes.date,
        partnerId: schema.purchaseDeliveryNotes.partnerId,
        total: schema.purchaseDeliveryNotes.total,
        status: schema.purchaseDeliveryNotes.status,
        orderId: schema.purchaseDeliveryNotes.orderId,
        orderDocNum: schema.purchaseOrders.docNum,
        orderPrefix: sql`(SELECT "prefix" FROM "DocumentSeries" WHERE id = ${schema.purchaseOrders.seriesId})`,
      })
      .from(schema.purchaseDeliveryNotes)
      .leftJoin(
        schema.purchaseOrders,
        eq(schema.purchaseDeliveryNotes.orderId, schema.purchaseOrders.id),
      )
      .leftJoin(
        schema.documentSeries,
        eq(schema.purchaseDeliveryNotes.seriesId, schema.documentSeries.id),
      )
      .leftJoin(
        schema.accountingPeriods,
        eq(schema.purchaseDeliveryNotes.periodId, schema.accountingPeriods.id),
      )
      .orderBy(sql`${schema.purchaseDeliveryNotes.date} DESC`);

    // Idéntico al SDN: enriquecer con info del shipment de recepción vivo.
    const ids = results.map((r: any) => r.id);
    const shipmentMap = new Map<string, string>();
    const shipmentStatusMap = new Map<string, string>();
    if (ids.length > 0) {
      const active = await req.tenantClient
        .select({
          id: schema.shipments.id,
          sourceDocId: schema.shipments.sourceDocId,
          preparationStatus: schema.shipments.preparationStatus,
        })
        .from(schema.shipments)
        .where(
          and(
            eq(schema.shipments.sourceDocType, 'PDN'),
            inArray(schema.shipments.sourceDocId, ids),
            notInArray(schema.shipments.preparationStatus, ['cancelled', 'returned']),
          ),
        );
      for (const s of active as any[]) {
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
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// GET detail
router.get('/:id', async (req: any, res) => {
  try {
    const [header] = await req.tenantClient
      .select({
        header: schema.purchaseDeliveryNotes,
        seriesPrefix: schema.documentSeries.prefix,
        numberingMode: schema.documentSeries.numberingMode,
        periodCode: schema.accountingPeriods.code,
        orderDocNum: schema.purchaseOrders.docNum,
        orderPrefix: sql`(SELECT "prefix" FROM "DocumentSeries" WHERE id = ${schema.purchaseOrders.seriesId})`,
      })
      .from(schema.purchaseDeliveryNotes)
      .leftJoin(
        schema.documentSeries,
        eq(schema.purchaseDeliveryNotes.seriesId, schema.documentSeries.id),
      )
      .leftJoin(
        schema.accountingPeriods,
        eq(schema.purchaseDeliveryNotes.periodId, schema.accountingPeriods.id),
      )
      .leftJoin(
        schema.purchaseOrders,
        eq(schema.purchaseDeliveryNotes.orderId, schema.purchaseOrders.id),
      )
      .where(eq(schema.purchaseDeliveryNotes.id, req.params.id));

    if (!header) return res.status(404).json({ error: 'No encontrado' });

    // Flatten header for easier use
    const headerData = {
      ...header.header,
      seriesPrefix: header.seriesPrefix,
      numberingMode: header.numberingMode,
      periodCode: header.periodCode,
      orderDocNum: header.orderDocNum,
      orderPrefix: header.orderPrefix,
    };

    const lines = await req.tenantClient
      .select()
      .from(schema.purchaseDeliveryNoteLines)
      .where(eq(schema.purchaseDeliveryNoteLines.deliveryId, req.params.id));

    // Get batches for each line
    const linesWithBatches = await Promise.all(
      lines.map(async (line: any) => {
        const batches = await req.tenantClient
          .select()
          .from(schema.purchaseDeliveryNoteLineBatches)
          .where(eq(schema.purchaseDeliveryNoteLineBatches.deliveryLineId, line.id));

        return {
          ...line,
          batchDetails: batches.map((b: any) => ({
            batchNum: b.batchNum,
            quantity: Number(b.quantity),
            expiryDate: b.expiryDate,
          })),
        };
      }),
    );

    const [activeShipment] = await req.tenantClient
      .select({
        id: schema.shipments.id,
        preparationStatus: schema.shipments.preparationStatus,
      })
      .from(schema.shipments)
      .where(
        and(
          eq(schema.shipments.sourceDocType, 'PDN'),
          eq(schema.shipments.sourceDocId, req.params.id),
          notInArray(schema.shipments.preparationStatus, ['cancelled', 'returned']),
        ),
      );

    res.json({
      ...headerData,
      lines: linesWithBatches,
      hasActiveShipment: !!activeShipment,
      activeShipmentId: activeShipment?.id || null,
      activeShipmentStatus: activeShipment?.preparationStatus || null,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// GET /:id/pdf
router.get('/:id/pdf', async (req: any, res) => {
  try {
    await renderDocumentPdf(
      'PDN',
      req.params.id,
      req.query.templateId as string | undefined,
      req.tenantClient,
      res,
      req.tenantId,
    );
  } catch (error: any) {
    console.error('[PurchaseDeliveryNote PDF] Error:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// POST new delivery note (Entry of Goods) — usa DocumentEngine en vez de
// lógica inline (numeración, stock global/almacén/zona, lotes, zona
// requerida y unicidad de serie viven ahora como capacidades del motor /
// hooks de `purchaseDeliveryNoteHooks`).
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
      entityType: 'PurchaseDeliveryNote',
      entityId: result.id,
      action: 'CREATE',
      newValue: { docNum: result.docNum, partnerId: req.body.partnerId },
    });
  } catch (error: any) {
    console.error('Error en Albarán de Compra:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

async function cancelPurchaseDeliveryNote(req: any, res: any) {
  try {
    const body = req.body || {};

    // Pre-check del shipment de recepción vinculado.
    const [activeShipment] = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(
        sql`${schema.shipments.sourceDocType} = 'PDN' AND ${schema.shipments.sourceDocId} = ${req.params.id} AND ${schema.shipments.preparationStatus} NOT IN ('cancelled','received','delivered','returned')`,
      );
    if (activeShipment) {
      if (['received', 'delivered'].includes(activeShipment.preparationStatus)) {
        return res.status(409).json({
          error: 'La recepción ya está cerrada. No se puede cancelar el albarán de compra.',
        });
      }
      const inProgress = ['in_transit', 'out_for_delivery', 'receiving'].includes(
        activeShipment.preparationStatus,
      );
      if (inProgress && !body.force) {
        return res.status(409).json({
          error: 'Recepción en curso. Confirma con force=true para cancelar.',
          requiresForce: true,
          shipmentId: activeShipment.id,
          shipmentStatus: activeShipment.preparationStatus,
        });
      }
    }

    const logisticsContext = await contextOf(req);
    const logisticsEffects: Effect[] = [];
    const result = await req.tenantClient.transaction(async (tx: any) => {
      // 1. Obtener cabecera y líneas para revertir
      const [header] = await tx
        .select()
        .from(schema.purchaseDeliveryNotes)
        .where(eq(schema.purchaseDeliveryNotes.id, req.params.id));
      if (!header) throw statusError(404, 'Albarán no encontrado');
      if (header.status === 'X') throw statusError(409, 'El albarán ya está cancelado');
      if (header.status === 'C')
        throw statusError(409, 'No se puede cancelar un albarán ya facturado');

      // Revierte stock (global/almacén/zona/lotes), marca 'X' y decrementa el
      // fulfillment del Pedido de Compra origen — todo vía DocumentEngine
      // (el hook `afterCancel` de PDN hace el paso D de antes).
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
        { reason: body.reason },
      );

      // Parar también la operación logística: envío, paradas y tareas.
      if (activeShipment) {
        await cancelLinkedShipment(
          logisticsContext,
          tx,
          logisticsEffects,
          activeShipment,
          body.reason
            ? `Cancelado al anular el albarán: ${body.reason}`
            : 'Cancelado al anular el albarán de compra',
        );
      }

      return { success: true };
    });

    await runEffects(logisticsEffects);

    res.json({
      ...result,
      shipmentCancelled: !!activeShipment,
      shipmentId: activeShipment?.id || null,
    });
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'PurchaseDeliveryNote',
      entityId: req.params.id,
      action: 'CANCEL',
      newValue: { reason: body.reason || null, force: !!body.force },
    });

    dispatchEvent(req.tenantId, 'purchase_delivery_note.cancelled', {
      id: req.params.id,
      reason: body.reason || null,
      shipmentId: activeShipment?.id || null,
    }).catch(() => {});
    if (activeShipment) {
      dispatchEvent(req.tenantId, 'shipment.cancelled', {
        id: activeShipment.id,
        reason: body.reason || null,
        cascadedFrom: 'purchase_delivery_note',
      }).catch(() => {});
    }
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
}

router.delete('/:id', cancelPurchaseDeliveryNote);
router.post('/:id/cancel', cancelPurchaseDeliveryNote);

export default router;
