import { Router } from 'express';
import { eq, sql, desc } from 'drizzle-orm';
import * as schema from '../db/schema';
import { DocumentEngine } from '../core/documents/DocumentEngine';
import { renderDocumentPdf } from '../core/documents/renderDocumentPdf';
import { logAudit } from '../utils/audit';
import {
  assertLockedPatchAllowed,
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
        id: schema.salesInvoices.id,
        docNum: schema.salesInvoices.docNum,
        seriesPrefix: schema.documentSeries.prefix,
        periodCode: schema.accountingPeriods.code,
        date: schema.salesInvoices.date,
        partnerId: schema.salesInvoices.partnerId,
        total: schema.salesInvoices.total,
        status: schema.salesInvoices.status,
        paymentStatus: schema.salesInvoices.paymentStatus,
        amountPaid: schema.salesInvoices.amountPaid,
        isLocked: schema.salesInvoices.isLocked,
        dueDate: schema.salesInvoices.dueDate,
        baseDocCode: sql<string | null>`(
        SELECT COALESCE(ds."prefix", '') || '-' || COALESCE(ap."code", '') || '-' || LPAD(sdn."docNum"::text, 6, '0')
        FROM "SalesDeliveryNote" sdn
        LEFT JOIN "DocumentSeries" ds ON sdn."seriesId" = ds."id"
        LEFT JOIN "AccountingPeriod" ap ON sdn."periodId" = ap."id"
        WHERE sdn."id" IN (
          SELECT "baseId" FROM "SalesInvoiceLine"
          WHERE "invoiceId" = ${schema.salesInvoices.id} AND "baseType" = 'SDN'
        )
        LIMIT 1
      )`,
      })
      .from(schema.salesInvoices)
      .leftJoin(schema.documentSeries, eq(schema.salesInvoices.seriesId, schema.documentSeries.id))
      .leftJoin(
        schema.accountingPeriods,
        eq(schema.salesInvoices.periodId, schema.accountingPeriods.id),
      )
      .orderBy(desc(schema.salesInvoices.date));
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
        header: schema.salesInvoices,
        seriesPrefix: schema.documentSeries.prefix,
        periodCode: schema.accountingPeriods.code,
      })
      .from(schema.salesInvoices)
      .leftJoin(schema.documentSeries, eq(schema.salesInvoices.seriesId, schema.documentSeries.id))
      .leftJoin(
        schema.accountingPeriods,
        eq(schema.salesInvoices.periodId, schema.accountingPeriods.id),
      )
      .where(eq(schema.salesInvoices.id, req.params.id));

    if (!header) return res.status(404).json({ error: 'No encontrado' });

    const lines = await req.tenantClient
      .select()
      .from(schema.salesInvoiceLines)
      .where(eq(schema.salesInvoiceLines.invoiceId, req.params.id));

    const linesWithBatches = await Promise.all(
      lines.map(async (line: any) => {
        const batches = await req.tenantClient
          .select()
          .from(schema.salesInvoiceLineBatches)
          .where(eq(schema.salesInvoiceLineBatches.invoiceLineId, line.id));
        return {
          ...line,
          batchDetails: batches.map((b: any) => ({
            batchNum: b.batchNum,
            quantity: Number(b.quantity),
          })),
        };
      }),
    );

    // Drizzle solo proyecta las columnas declaradas en el schema, así que
    // los campos custom `p_*` (plugin/user) se pierden. Hacemos un SELECT
    // crudo y mergeamos solo esas columnas.
    const schemaName = req.tenantSchema || req.tenant?.schemaName;
    if (!schemaName) {
      // No podemos leer columnas custom sin conocer el schema; devolvemos sin merge.
      return res.json({
        ...header.header,
        seriesPrefix: header.seriesPrefix,
        periodCode: header.periodCode,
        lines: linesWithBatches,
      });
    }
    const rawHeader: any = await req.tenantClient.execute(
      sql.raw(`SELECT * FROM "${schemaName}"."SalesInvoice" WHERE "id" = '${req.params.id}'`),
    );
    const rawHeaderRow = rawHeader.rows?.[0] || {};
    const pluginCols: Record<string, any> = {};
    for (const [k, v] of Object.entries(rawHeaderRow)) {
      if (k.startsWith('p_')) pluginCols[k] = v;
    }

    const lineIds = linesWithBatches.map((l: any) => l.id);
    const linePluginByLineId: Record<string, Record<string, any>> = {};
    if (lineIds.length > 0) {
      const escapedIds = lineIds
        .map((id: string) => `'${String(id).replace(/'/g, "''")}'`)
        .join(',');
      const rawLines: any = await req.tenantClient.execute(
        sql.raw(`SELECT * FROM "${schemaName}"."SalesInvoiceLine" WHERE "id" IN (${escapedIds})`),
      );
      for (const r of rawLines.rows || []) {
        const entry: Record<string, any> = {};
        for (const [k, v] of Object.entries(r)) {
          if (k.startsWith('p_')) entry[k] = v;
        }
        linePluginByLineId[r.id] = entry;
      }
    }

    res.json({
      ...header.header,
      ...pluginCols,
      seriesPrefix: header.seriesPrefix,
      periodCode: header.periodCode,
      lines: linesWithBatches.map((l: any) => ({
        ...l,
        ...(linePluginByLineId[l.id] || {}),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /:id/pdf — Descarga el PDF de la factura
router.get('/:id/pdf', async (req: any, res) => {
  try {
    await renderDocumentPdf(
      'SINV',
      req.params.id,
      req.query.templateId as string | undefined,
      req.tenantClient,
      res,
    );
  } catch (error: any) {
    console.error('[SalesInvoice PDF] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST new sales invoice
router.post('/', async (req: any, res) => {
  try {
    const result = await DocumentEngine.create(
      req.tenantId,
      req.tenantClient,
      req.user,
      {
        tableName: 'salesInvoices',
        schemaTable: schema.salesInvoices,
        lineSchemaTable: schema.salesInvoiceLines,
        batchSchemaTable: schema.salesInvoiceLineBatches,
        eventPrefix: 'salesInvoice',
        stockAction: 'OUT',
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
      entityType: 'SalesInvoice',
      entityId: result.id,
      action: 'CREATE',
      newValue: { docNum: result.docNum, total: req.body.total, partnerId: req.body.partnerId },
    });
  } catch (error: any) {
    console.error('[SalesInvoice API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST — asienta un borrador (D → O) y lockea la factura
router.post('/:id/post', async (req: any, res) => {
  try {
    const [header] = await req.tenantClient
      .select()
      .from(schema.salesInvoices)
      .where(eq(schema.salesInvoices.id, req.params.id));
    if (!header) return res.status(404).json({ error: 'No encontrada' });
    if (header.status !== 'D')
      return res.status(400).json({ error: 'Solo se pueden asentar facturas en estado Borrador.' });

    // Si tiene PaymentTerm, calcular paymentDueLines a partir de date+days.
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

    // Calcular withholding del documento si se definió tasa.
    const withholdingAmount = computeWithholding(Number(header.subtotal), header.withholdingRate);

    await req.tenantClient
      .update(schema.salesInvoices)
      .set({
        status: 'O',
        isLocked: true,
        lockedAt: new Date(),
        paymentDueLines,
        dueDate,
        withholdingAmount: withholdingAmount != null ? String(withholdingAmount) : null,
      })
      .where(eq(schema.salesInvoices.id, req.params.id));

    // Generación automática de asiento (best-effort). Si faltan mapeos básicos
    // devuelve null y seguimos — el asiento se puede crear manualmente luego.
    let journalEntryId: string | null = null;
    try {
      const { JournalEngine } = await import('../core/accounting/JournalEngine');
      const fresh = { ...header, isLocked: true };
      const invoiceLines = await req.tenantClient
        .select()
        .from(schema.salesInvoiceLines)
        .where(eq(schema.salesInvoiceLines.invoiceId, req.params.id));
      const result = await JournalEngine.createFromSalesInvoice(
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
      console.warn('[SalesInvoice post] No se pudo generar asiento:', je.message);
    }

    res.json({ success: true, isLocked: true, paymentDueLines, dueDate, journalEntryId });
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'SalesInvoice',
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
async function cancelSalesInvoice(req: any, res: any) {
  try {
    const [old] = await req.tenantClient
      .select()
      .from(schema.salesInvoices)
      .where(eq(schema.salesInvoices.id, req.params.id));
    const result = await req.tenantClient.transaction(async (tx: any) => {
      const [header] = await tx
        .select()
        .from(schema.salesInvoices)
        .where(eq(schema.salesInvoices.id, req.params.id));
      if (!header) throw new Error('No encontrado');
      if (header.status === 'X') throw new Error('Ya está cancelado');

      const lines = await tx
        .select()
        .from(schema.salesInvoiceLines)
        .where(eq(schema.salesInvoiceLines.invoiceId, req.params.id));
      const reopenedSdns = new Set<string>();

      for (const line of lines) {
        const baseQty = Number(line.quantity) * Number(line.uomFactor || 1);

        // Si la línea vino de un albarán, la factura no movió stock; sólo hay que reabrir el SDN origen
        if (line.baseType === 'SDN' && line.baseId) {
          reopenedSdns.add(line.baseId);
          continue;
        }

        // Factura directa: la creación hizo stock OUT, lo devolvemos
        await tx
          .update(schema.items)
          .set({ stock: sql`${schema.items.stock} + ${baseQty}` })
          .where(eq(schema.items.id, line.itemId));

        if (line.warehouseId) {
          await tx
            .update(schema.itemWarehouseStocks)
            .set({
              stock: sql`${schema.itemWarehouseStocks.stock} + ${baseQty}`,
              updatedAt: new Date(),
            })
            .where(
              sql`${schema.itemWarehouseStocks.itemId} = ${line.itemId} AND ${schema.itemWarehouseStocks.warehouseId} = ${line.warehouseId}`,
            );
        }

        const batches = await tx
          .select()
          .from(schema.salesInvoiceLineBatches)
          .where(eq(schema.salesInvoiceLineBatches.invoiceLineId, line.id));
        for (const bd of batches) {
          await tx
            .update(schema.itemBatches)
            .set({ quantity: sql`${schema.itemBatches.quantity} + ${Number(bd.quantity)}` })
            .where(
              sql`${schema.itemBatches.itemId} = ${line.itemId} AND ${schema.itemBatches.batchNum} = ${bd.batchNum}`,
            );
        }
      }

      // Reabrir SDNs base (estaban en 'C', vuelven a 'O')
      for (const sdnId of reopenedSdns) {
        await tx
          .update(schema.salesDeliveryNotes)
          .set({ status: 'O' })
          .where(eq(schema.salesDeliveryNotes.id, sdnId));
      }

      await tx
        .update(schema.salesInvoices)
        .set({ status: 'X' })
        .where(eq(schema.salesInvoices.id, req.params.id));
      return { success: true };
    });
    res.json(result);
    if (old)
      logAudit({
        tenantClient: req.tenantClient,
        tenantId: req.tenantId || '',
        userId: req.user?.id,
        entityType: 'SalesInvoice',
        entityId: req.params.id,
        action: 'DELETE',
        oldValue: { status: old.status },
      });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

router.delete('/:id', cancelSalesInvoice);
router.post('/:id/cancel', cancelSalesInvoice);

export default router;
