import { Router } from 'express';
import { eq, desc, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { DocumentEngine } from '../../core/documents/DocumentEngine';
import { DocumentRegistry } from '../../core/documents/DocumentRegistry';
import { renderDocumentPdf } from '../../core/documents/renderDocumentPdf';
import { logAudit } from '../../utils/audit';

const router = Router();
const config = DocumentRegistry.get('SO');

// GET /:id/pdf — montado antes que /:id para evitar que lo capture el route genérico
router.get('/:id/pdf', async (req: any, res) => {
  try {
    await renderDocumentPdf(
      'SO',
      req.params.id,
      req.query.templateId as string | undefined,
      req.tenantClient,
      res,
      req.tenantId,
    );
  } catch (error: any) {
    console.error('[SalesOrder PDF] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET all orders
router.get('/', async (req: any, res) => {
  try {
    const orders = await req.tenantClient
      .select({
        id: schema.salesOrders.id,
        docNum: schema.salesOrders.docNum,
        seriesPrefix: schema.documentSeries.prefix,
        numberingMode: schema.documentSeries.numberingMode,
        periodCode: schema.accountingPeriods.code,
        date: schema.salesOrders.date,
        partnerId: schema.salesOrders.partnerId,
        total: schema.salesOrders.total,
        status: schema.salesOrders.status,
        subtotal: schema.salesOrders.subtotal,
        taxTotal: schema.salesOrders.taxTotal,
      })
      .from(schema.salesOrders)
      .leftJoin(schema.documentSeries, eq(schema.salesOrders.seriesId, schema.documentSeries.id))
      .leftJoin(
        schema.accountingPeriods,
        eq(schema.salesOrders.periodId, schema.accountingPeriods.id),
      )
      .orderBy(desc(schema.salesOrders.date), desc(schema.salesOrders.createdAt));

    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST new sales order — usa DocumentEngine en vez de lógica inline
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
      entityType: 'SalesOrder',
      entityId: result.id,
      action: 'CREATE',
      newValue: { docNum: result.docNum, partnerId: req.body.partnerId },
    });
  } catch (error: any) {
    console.error('[SalesOrder API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET by ID
router.get('/:id', async (req: any, res) => {
  try {
    const [order] = await req.tenantClient
      .select({
        header: schema.salesOrders,
        seriesPrefix: schema.documentSeries.prefix,
        numberingMode: schema.documentSeries.numberingMode,
        periodCode: schema.accountingPeriods.code,
      })
      .from(schema.salesOrders)
      .leftJoin(schema.documentSeries, eq(schema.salesOrders.seriesId, schema.documentSeries.id))
      .leftJoin(
        schema.accountingPeriods,
        eq(schema.salesOrders.periodId, schema.accountingPeriods.id),
      )
      .where(eq(schema.salesOrders.id, req.params.id));

    if (!order) return res.status(404).json({ error: 'No encontrado' });

    const lines = await req.tenantClient
      .select()
      .from(schema.salesOrderLines)
      .where(eq(schema.salesOrderLines.orderId, req.params.id));

    res.json({
      ...order.header,
      seriesPrefix: order.seriesPrefix,
      numberingMode: order.numberingMode,
      periodCode: order.periodCode,
      lines,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /:id/cancel — Cancela un pedido de venta
router.post('/:id/cancel', async (req: any, res) => {
  try {
    const result = await req.tenantClient.transaction(async (tx: any) => {
      const [header] = await tx
        .select()
        .from(schema.salesOrders)
        .where(eq(schema.salesOrders.id, req.params.id));
      if (!header) throw new Error('Pedido no encontrado');
      if (header.status === 'X') throw new Error('El pedido ya está cancelado');

      // Comprobar que no hay albaranes vigentes vinculados
      const activeSdns = await tx
        .select()
        .from(schema.salesDeliveryNotes)
        .where(
          sql`${schema.salesDeliveryNotes.orderId} = ${req.params.id} AND ${schema.salesDeliveryNotes.status} != 'X'`,
        );
      if (activeSdns.length > 0) {
        throw new Error(
          'No se puede cancelar: existen albaranes vigentes vinculados. Cancela los albaranes primero.',
        );
      }

      await tx
        .update(schema.salesOrders)
        .set({ status: 'X' })
        .where(eq(schema.salesOrders.id, req.params.id));

      return { success: true, old: header };
    });

    res.json({ success: true });
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'SalesOrder',
      entityId: req.params.id,
      action: 'DELETE',
      oldValue: { status: result.old.status },
      newValue: { status: 'X' },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
