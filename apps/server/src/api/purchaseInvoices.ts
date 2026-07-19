import { Router } from 'express';
import { eq, and, sql, desc } from 'drizzle-orm';
import * as schema from '../db/schema';
import { DocumentEngine } from '../core/documents/DocumentEngine';
import { renderDocumentPdf } from '../core/documents/renderDocumentPdf';
import { logAudit } from '../utils/audit';
import {
  buildPaymentDueLines,
  computeWithholding,
  latestDueDate,
} from '../core/documents/invoiceLock';

const router = Router();

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
        dueDate: schema.purchaseInvoices.dueDate,
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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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
    );
  } catch (error: any) {
    console.error('[PurchaseInvoice PDF] Error:', error);
    res.status(500).json({ error: error.message });
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
        tableName: 'purchaseInvoices',
        schemaTable: schema.purchaseInvoices,
        lineSchemaTable: schema.purchaseInvoiceLines,
        batchSchemaTable: schema.purchaseInvoiceLineBatches,
        eventPrefix: 'purchaseInvoice',
        stockAction: 'IN',
        closeBaseDocuments: true,
        initialStatus: 'D',
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
    res.status(500).json({ error: error.message });
  }
});

// POST — asienta un borrador (D → O) y lockea la factura
router.post('/:id/post', async (req: any, res) => {
  try {
    const [header] = await req.tenantClient
      .select()
      .from(schema.purchaseInvoices)
      .where(eq(schema.purchaseInvoices.id, req.params.id));
    if (!header) return res.status(404).json({ error: 'No encontrada' });
    if (header.status !== 'D')
      return res.status(400).json({ error: 'Solo se pueden asentar facturas en estado Borrador.' });

    let paymentDueLines: Array<{ date: string; amount: number }> = [];
    let dueDate: string | null = header.dueDate || null;
    if (header.paymentTermId) {
      const [term] = await req.tenantClient
        .select()
        .from(schema.paymentTerms)
        .where(eq(schema.paymentTerms.id, header.paymentTermId));
      if (term && Array.isArray(term.lines) && term.lines.length > 0) {
        paymentDueLines = buildPaymentDueLines(
          new Date(header.date),
          term.lines as Array<{ days: number; percentage: number }>,
          Number(header.total),
        );
        dueDate = latestDueDate(paymentDueLines) || dueDate;
      }
    }

    const withholdingAmount = computeWithholding(Number(header.subtotal), header.withholdingRate);

    await req.tenantClient
      .update(schema.purchaseInvoices)
      .set({
        status: 'O',
        isLocked: true,
        lockedAt: new Date(),
        paymentDueLines,
        dueDate,
        withholdingAmount: withholdingAmount != null ? String(withholdingAmount) : null,
      })
      .where(eq(schema.purchaseInvoices.id, req.params.id));

    // Generación automática de asiento (best-effort).
    let journalEntryId: string | null = null;
    try {
      const { JournalEngine } = await import('../core/accounting/JournalEngine');
      const fresh = { ...header, isLocked: true };
      const invoiceLines = await req.tenantClient
        .select()
        .from(schema.purchaseInvoiceLines)
        .where(eq(schema.purchaseInvoiceLines.invoiceId, req.params.id));
      const result = await JournalEngine.createFromPurchaseInvoice(
        req.tenantClient,
        fresh,
        invoiceLines,
        req.user?.id,
      );
      if (result) {
        await JournalEngine.post(req.tenantClient, result.id, req.user?.id);
        journalEntryId = result.id;
      }
    } catch (je: any) {
      console.warn('[PurchaseInvoice post] No se pudo generar asiento:', je.message);
    }

    res.json({ success: true, isLocked: true, paymentDueLines, dueDate, journalEntryId });
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
    res.status(500).json({ error: error.message });
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
      if (!header) throw new Error('No encontrado');
      if (header.status === 'X') throw new Error('Ya está cancelada');

      const lines = await tx
        .select()
        .from(schema.purchaseInvoiceLines)
        .where(eq(schema.purchaseInvoiceLines.invoiceId, req.params.id));
      const reopenedPdns = new Set<string>();

      for (const line of lines) {
        const baseQty = Number(line.quantity) * Number(line.uomFactor || 1);

        // Si la línea vino de un albarán, la factura no movió stock; sólo reabrimos el PDN
        if (line.baseType === 'PDN' && line.baseId) {
          reopenedPdns.add(line.baseId);
          continue;
        }

        // Factura directa: la creación hizo stock IN, lo deshacemos
        await tx
          .update(schema.items)
          .set({ stock: sql`${schema.items.stock} - ${baseQty}` })
          .where(eq(schema.items.id, line.itemId));

        if (line.warehouseId) {
          await tx
            .update(schema.itemWarehouseStocks)
            .set({
              stock: sql`${schema.itemWarehouseStocks.stock} - ${baseQty}`,
              updatedAt: new Date(),
            })
            .where(
              sql`${schema.itemWarehouseStocks.itemId} = ${line.itemId} AND ${schema.itemWarehouseStocks.warehouseId} = ${line.warehouseId}`,
            );
        }

        const batches = await tx
          .select()
          .from(schema.purchaseInvoiceLineBatches)
          .where(eq(schema.purchaseInvoiceLineBatches.invoiceLineId, line.id));
        for (const bd of batches) {
          await tx
            .update(schema.itemBatches)
            .set({ quantity: sql`${schema.itemBatches.quantity} - ${Number(bd.quantity)}` })
            .where(
              sql`${schema.itemBatches.itemId} = ${line.itemId} AND ${schema.itemBatches.batchNum} = ${bd.batchNum}`,
            );
          if (line.warehouseId) {
            await tx
              .update(schema.itemBatchStocks)
              .set({
                quantity: sql`${schema.itemBatchStocks.quantity} - ${Number(bd.quantity)}`,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(schema.itemBatchStocks.itemId, line.itemId),
                  eq(schema.itemBatchStocks.batchNum, bd.batchNum),
                  eq(schema.itemBatchStocks.warehouseId, line.warehouseId),
                ),
              );
          }
        }
      }

      // Reabrir PDNs base (estaban en 'C', vuelven a 'O')
      for (const pdnId of reopenedPdns) {
        await tx
          .update(schema.purchaseDeliveryNotes)
          .set({ status: 'O' })
          .where(eq(schema.purchaseDeliveryNotes.id, pdnId));
      }

      await tx
        .update(schema.purchaseInvoices)
        .set({ status: 'X' })
        .where(eq(schema.purchaseInvoices.id, req.params.id));
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
        action: 'DELETE',
        oldValue: { status: old.status },
      });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

router.post('/:id/cancel', cancelPurchaseInvoice);
router.delete('/:id', cancelPurchaseInvoice);

export default router;
