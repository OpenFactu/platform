import { Router } from 'express';
import { creditNoteRoutes } from './creditNoteRoutes';
import { eq, sql, desc } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { DocumentEngine } from '../../core/documents/DocumentEngine';
import { DocumentRegistry } from '../../core/documents/DocumentRegistry';
import { renderDocumentPdf } from '../../core/documents/renderDocumentPdf';
import { logAudit } from '../../utils/audit';
import { statusError } from '../../core/documents/documentRules';

const router = Router();
router.use(creditNoteRoutes('purchase'));
const config = DocumentRegistry.get('PINV');

// GET all invoices
router.get('/', async (req: any, res) => {
  try {
    const results = await req.tenantClient
      .select({
        id: schema.purchaseInvoices.id,
        docNum: schema.purchaseInvoices.docNum,
        seriesPrefix: schema.documentSeries.prefix,
        numberingMode: schema.documentSeries.numberingMode,
        periodCode: schema.accountingPeriods.code,
        date: schema.purchaseInvoices.date,
        partnerId: schema.purchaseInvoices.partnerId,
        total: schema.purchaseInvoices.total,
        status: schema.purchaseInvoices.status,
        paymentStatus: schema.purchaseInvoices.paymentStatus,
        amountPaid: schema.purchaseInvoices.amountPaid,
        isLocked: schema.purchaseInvoices.isLocked,
        rectifiesInvoiceId: schema.purchaseInvoices.rectifiesInvoiceId,
        creditNoteCount: sql<number>`(
          SELECT COUNT(*)::int FROM "PurchaseInvoice" note
          WHERE note."rectifiesInvoiceId" = ${schema.purchaseInvoices.id} AND note."status" <> 'X'
        )`,
        dueDate: schema.purchaseInvoices.dueDate,
        externalRef: schema.purchaseInvoices.externalRef,
        baseDocCode: sql<string | null>`(
        SELECT COALESCE(ds."prefix", '') || '-' || COALESCE(ap."code", '') || '-' || LPAD(pdn."docNum"::text, 6, '0')
        FROM "PurchaseDeliveryNote" pdn
        LEFT JOIN "DocumentSeries" ds ON pdn."seriesId" = ds."id"
        LEFT JOIN "AccountingPeriod" ap ON pdn."periodId" = ap."id"
        WHERE pdn."id" IN (
          SELECT "baseId" FROM "PurchaseInvoiceLine"
          WHERE "invoiceId" = ${schema.purchaseInvoices.id} AND "baseType" = 'PDN'
        )
        LIMIT 1
      )`,
      })
      .from(schema.purchaseInvoices)
      .leftJoin(
        schema.documentSeries,
        eq(schema.purchaseInvoices.seriesId, schema.documentSeries.id),
      )
      .leftJoin(
        schema.accountingPeriods,
        eq(schema.purchaseInvoices.periodId, schema.accountingPeriods.id),
      )
      .orderBy(desc(schema.purchaseInvoices.date));
    res.json(results);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// GET single invoice
router.get('/:id', async (req: any, res) => {
  try {
    const [header] = await req.tenantClient
      .select({
        header: schema.purchaseInvoices,
        seriesPrefix: schema.documentSeries.prefix,
        numberingMode: schema.documentSeries.numberingMode,
        periodCode: schema.accountingPeriods.code,
      })
      .from(schema.purchaseInvoices)
      .leftJoin(
        schema.documentSeries,
        eq(schema.purchaseInvoices.seriesId, schema.documentSeries.id),
      )
      .leftJoin(
        schema.accountingPeriods,
        eq(schema.purchaseInvoices.periodId, schema.accountingPeriods.id),
      )
      .where(eq(schema.purchaseInvoices.id, req.params.id));

    if (!header) return res.status(404).json({ error: 'No encontrado' });

    const lines = await req.tenantClient
      .select()
      .from(schema.purchaseInvoiceLines)
      .where(eq(schema.purchaseInvoiceLines.invoiceId, req.params.id));

    const linesWithBatches = await Promise.all(
      lines.map(async (line: any) => {
        const batches = await req.tenantClient
          .select()
          .from(schema.purchaseInvoiceLineBatches)
          .where(eq(schema.purchaseInvoiceLineBatches.invoiceLineId, line.id));
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
      lines: linesWithBatches,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// GET /:id/pdf
router.get('/:id/pdf', async (req: any, res) => {
  try {
    await renderDocumentPdf(
      'PINV',
      req.params.id,
      req.query.templateId as string | undefined,
      req.tenantClient,
      res,
      req.tenantId,
    );
  } catch (error: any) {
    console.error('[PurchaseInvoice PDF] Error:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// POST new purchase invoice
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
      entityType: 'PurchaseInvoice',
      entityId: result.id,
      action: 'CREATE',
      newValue: { docNum: result.docNum, partnerId: req.body.partnerId },
    });
  } catch (error: any) {
    console.error('[PurchaseInvoice API] Error:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// POST — asienta un borrador (D → O) y lockea la factura
router.post('/:id/post', async (req: any, res) => {
  try {
    const result = await DocumentEngine.post(
      req.tenantId,
      req.tenantClient,
      req.user,
      config,
      req.params.id,
    );
    res.json(result);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'PurchaseInvoice',
      entityId: req.params.id,
      action: 'UPDATE',
      oldValue: { status: 'D', isLocked: false },
      newValue: { status: 'O', isLocked: true, lockedAt: new Date() },
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// CANCEL — revierte stock y reabre albaranes de origen
async function cancelPurchaseInvoice(req: any, res: any) {
  try {
    const [old] = await req.tenantClient
      .select()
      .from(schema.purchaseInvoices)
      .where(eq(schema.purchaseInvoices.id, req.params.id));
    const result = await req.tenantClient.transaction(async (tx: any) => {
      const [header] = await tx
        .select()
        .from(schema.purchaseInvoices)
        .where(eq(schema.purchaseInvoices.id, req.params.id));
      if (!header) throw statusError(404, 'No encontrado');
      if (header.status === 'X') throw statusError(409, 'Ya está cancelada');

      // Revierte stock (global/almacén/zona/lotes) solo para líneas directas
      // (si vino de un PDN, la factura nunca movió stock, solo reabre el PDN
      // origen) y marca 'X' — todo vía DocumentEngine.
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
      return { success: true };
    });
    res.json(result);
    if (old)
      logAudit({
        tenantClient: req.tenantClient,
        tenantId: req.tenantId || '',
        userId: req.user?.id,
        entityType: 'PurchaseInvoice',
        entityId: req.params.id,
        action: 'CANCEL',
        oldValue: { status: old.status },
      });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
}

router.post('/:id/cancel', cancelPurchaseInvoice);
router.delete('/:id', cancelPurchaseInvoice);

export default router;
