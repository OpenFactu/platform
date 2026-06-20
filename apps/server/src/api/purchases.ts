import { Router } from 'express';
import { eq, desc, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { DocumentEngine } from '../core/documents/DocumentEngine';
import { DocumentRegistry } from '../core/documents/DocumentRegistry';
import { renderDocumentPdf } from '../core/documents/renderDocumentPdf';
import { logAudit } from '../utils/audit';

const router = Router();
const config = DocumentRegistry.get('PO');

// GET /orders/:id/pdf
router.get('/orders/:id/pdf', async (req: any, res) => {
  try {
    await renderDocumentPdf(
      'PO',
      req.params.id,
      req.query.templateId as string | undefined,
      req.tenantClient,
      res,
    );
  } catch (error: any) {
    console.error('[PurchaseOrder PDF] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET all orders
router.get('/orders', async (req: any, res) => {
  try {
    const orders = await req.tenantClient
      .select({
        id: schema.purchaseOrders.id,
        docNum: schema.purchaseOrders.docNum,
        seriesPrefix: schema.documentSeries.prefix,
        periodCode: schema.accountingPeriods.code,
        date: schema.purchaseOrders.date,
        partnerId: schema.purchaseOrders.partnerId,
        total: schema.purchaseOrders.total,
        status: schema.purchaseOrders.status,
        subtotal: schema.purchaseOrders.subtotal,
        taxTotal: schema.purchaseOrders.taxTotal,
      })
      .from(schema.purchaseOrders)
      .leftJoin(schema.documentSeries, eq(schema.purchaseOrders.seriesId, schema.documentSeries.id))
      .leftJoin(
        schema.accountingPeriods,
        eq(schema.purchaseOrders.periodId, schema.accountingPeriods.id),
      )
      .orderBy(desc(schema.purchaseOrders.date), desc(schema.purchaseOrders.createdAt));

    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST new order — usa DocumentEngine en vez de lógica inline
router.post('/orders', async (req: any, res) => {
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
      },
      req.body,
    );

    res.json(result);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'PurchaseOrder',
      entityId: result.id,
      action: 'CREATE',
      newValue: { docNum: result.docNum, partnerId: req.body.partnerId },
    });
  } catch (error: any) {
    console.error('[PurchaseOrder API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET order by ID with lines
router.get('/orders/:id', async (req: any, res) => {
  try {
    const [order] = await req.tenantClient
      .select({
        header: schema.purchaseOrders,
        seriesPrefix: schema.documentSeries.prefix,
        periodCode: schema.accountingPeriods.code,
      })
      .from(schema.purchaseOrders)
      .leftJoin(schema.documentSeries, eq(schema.purchaseOrders.seriesId, schema.documentSeries.id))
      .leftJoin(
        schema.accountingPeriods,
        eq(schema.purchaseOrders.periodId, schema.accountingPeriods.id),
      )
      .where(eq(schema.purchaseOrders.id, req.params.id));

    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    const lines = await req.tenantClient
      .select()
      .from(schema.purchaseOrderLines)
      .where(eq(schema.purchaseOrderLines.orderId, order.header.id));

    res.json({
      ...order.header,
      seriesPrefix: order.seriesPrefix,
      periodCode: order.periodCode,
      lines,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /orders/:id/cancel — Cancela un pedido de compra
router.post('/orders/:id/cancel', async (req: any, res) => {
  try {
    const result = await req.tenantClient.transaction(async (tx: any) => {
      const [header] = await tx
        .select()
        .from(schema.purchaseOrders)
        .where(eq(schema.purchaseOrders.id, req.params.id));
      if (!header) throw new Error('Pedido no encontrado');
      if (header.status === 'X') throw new Error('El pedido ya está cancelado');

      // Comprobar que no hay albaranes vigentes vinculados
      const activePdns = await tx
        .select()
        .from(schema.purchaseDeliveryNotes)
        .where(
          sql`${schema.purchaseDeliveryNotes.orderId} = ${req.params.id} AND ${schema.purchaseDeliveryNotes.status} != 'X'`,
        );
      if (activePdns.length > 0) {
        throw new Error(
          'No se puede cancelar: existen albaranes vigentes vinculados. Cancela los albaranes primero.',
        );
      }

      await tx
        .update(schema.purchaseOrders)
        .set({ status: 'X' })
        .where(eq(schema.purchaseOrders.id, req.params.id));

      return { success: true, old: header };
    });

    res.json({ success: true });
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'PurchaseOrder',
      entityId: req.params.id,
      action: 'DELETE',
      oldValue: { status: result.old.status },
      newValue: { status: 'X' },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH update status (Manual Close)
router.patch('/orders/:id/status', async (req: any, res) => {
  const { status } = req.body;
  try {
    const [old] = await req.tenantClient
      .select()
      .from(schema.purchaseOrders)
      .where(eq(schema.purchaseOrders.id, req.params.id));
    const [updated] = await req.tenantClient
      .update(schema.purchaseOrders)
      .set({ status })
      .where(eq(schema.purchaseOrders.id, req.params.id))
      .returning();
    res.json(updated);
    if (old)
      logAudit({
        tenantClient: req.tenantClient,
        tenantId: req.tenantId || '',
        userId: req.user?.id,
        entityType: 'PurchaseOrder',
        entityId: req.params.id,
        action: 'UPDATE',
        oldValue: { status: old.status },
        newValue: { status },
      });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
