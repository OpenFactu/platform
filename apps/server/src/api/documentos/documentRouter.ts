import { Router, Request, Response } from 'express';
import { eq, sql, desc } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { DocumentEngine } from '../../core/documents/DocumentEngine';
import {
  DocumentRegistry,
  type DocType,
  type DocumentTypeConfig,
} from '../../core/documents/DocumentRegistry';
import { renderDocumentPdf } from '../../core/documents/renderDocumentPdf';
import { logAudit } from '../../utils/audit';
import {
  buildPaymentDueLines,
  computeWithholding,
  latestDueDate,
} from '../../core/documents/invoiceLock';

const router = Router();

/**
 * Router genérico para documentos.
 *
 * Rutas:
 *   GET    /:docType          — Lista documentos
 *   GET    /:docType/:id      — Detalle con líneas
 *   GET    /:docType/:id/pdf  — Descarga PDF
 *   POST   /:docType          — Crear documento
 *   POST   /:docType/:id/post — Postear (solo invoices)
 *   POST   /:docType/:id/cancel — Cancelar
 *   DELETE /:docType/:id      — Cancelar (alias)
 *
 * Uso desde server.ts:
 *   app.use('/api/documents', createDocumentRouter());
 *
 * Las rutas legacy siguen funcionando en paralelo.
 */

// ── Helpers genéricos ──────────────────────────────────────────────

/**
 * Construye la query de lista para cualquier documento.
 */
async function buildListQuery(config: DocumentTypeConfig, tenantClient: any) {
  const baseSelect: any = {
    id: config.schemaTable.id,
    docNum: config.schemaTable.docNum,
    seriesPrefix: schema.documentSeries.prefix,
    numberingMode: schema.documentSeries.numberingMode,
    periodCode: schema.accountingPeriods.code,
    date: config.schemaTable.date,
    partnerId: config.schemaTable.partnerId,
    total: config.schemaTable.total,
    status: config.schemaTable.status,
    subtotal: config.schemaTable.subtotal,
    taxTotal: config.schemaTable.taxTotal,
  };

  // Invoices tienen campos extra
  if (config.hasFiscalFields) {
    baseSelect.paymentStatus = config.schemaTable.paymentStatus;
    baseSelect.amountPaid = config.schemaTable.amountPaid;
    baseSelect.isLocked = config.schemaTable.isLocked;
    baseSelect.dueDate = config.schemaTable.dueDate;
  }

  return tenantClient
    .select(baseSelect)
    .from(config.schemaTable)
    .leftJoin(schema.documentSeries, eq(config.schemaTable.seriesId, schema.documentSeries.id))
    .leftJoin(
      schema.accountingPeriods,
      eq(config.schemaTable.periodId, schema.accountingPeriods.id),
    )
    .orderBy(desc(config.schemaTable.date));
}

/**
 * Obtiene un documento con sus líneas y lotes.
 */
async function getDocumentWithLines(
  config: DocumentTypeConfig,
  documentId: string,
  tenantClient: any,
  tenantSchema?: string,
) {
  const [header] = await tenantClient
    .select({
      header: config.schemaTable,
      seriesPrefix: schema.documentSeries.prefix,
      numberingMode: schema.documentSeries.numberingMode,
      periodCode: schema.accountingPeriods.code,
    })
    .from(config.schemaTable)
    .leftJoin(schema.documentSeries, eq(config.schemaTable.seriesId, schema.documentSeries.id))
    .leftJoin(
      schema.accountingPeriods,
      eq(config.schemaTable.periodId, schema.accountingPeriods.id),
    )
    .where(eq(config.schemaTable.id, documentId));

  if (!header) return null;

  // Líneas
  const lines = await tenantClient
    .select()
    .from(config.lineSchemaTable)
    .where(eq(config.lineSchemaTable[config.lineFk], documentId));

  // Lotes (si aplica)
  let linesWithBatches = lines;
  if (config.batchSchemaTable) {
    const batchFkCol =
      'invoiceLineId' in config.batchSchemaTable ? 'invoiceLineId' : 'deliveryLineId';

    linesWithBatches = await Promise.all(
      lines.map(async (line: any) => {
        const batches = await tenantClient
          .select()
          .from(config.batchSchemaTable)
          .where(eq((config.batchSchemaTable as any)[batchFkCol], line.id));
        return {
          ...line,
          batchDetails: batches.map((b: any) => ({
            batchNum: b.batchNum,
            quantity: Number(b.quantity),
          })),
        };
      }),
    );
  }

  // Plugin fields (columnas p_*)
  let result = {
    ...header.header,
    seriesPrefix: header.seriesPrefix,
    numberingMode: header.numberingMode,
    periodCode: header.periodCode,
    lines: linesWithBatches,
  };

  if (tenantSchema) {
    try {
      const rawHeader: any = await tenantClient.execute(
        sql.raw(
          `SELECT * FROM "${tenantSchema}"."${config.headerPgName}" WHERE "id" = '${documentId}'`,
        ),
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
        const rawLines: any = await tenantClient.execute(
          sql.raw(
            `SELECT * FROM "${tenantSchema}"."${config.linePgName}" WHERE "id" IN (${escapedIds})`,
          ),
        );
        for (const r of rawLines.rows || []) {
          const entry: Record<string, any> = {};
          for (const [k, v] of Object.entries(r)) {
            if (k.startsWith('p_')) entry[k] = v;
          }
          linePluginByLineId[r.id] = entry;
        }
      }

      result = {
        ...header.header,
        ...pluginCols,
        seriesPrefix: header.seriesPrefix,
        numberingMode: header.numberingMode,
        periodCode: header.periodCode,
        lines: linesWithBatches.map((l: any) => ({
          ...l,
          ...(linePluginByLineId[l.id] || {}),
        })),
      };
    } catch {
      /* Si falla la query raw, devolvemos sin plugin cols */
    }
  }

  return result;
}

// ── Rutas ──────────────────────────────────────────────────────────

/** GET /:docType — Lista documentos */
router.get('/:docType', async (req: any, res) => {
  try {
    const docType = req.params.docType as DocType;
    if (!DocumentRegistry.has(docType)) {
      return res.status(400).json({ error: `Tipo de documento no válido: ${docType}` });
    }
    const config = DocumentRegistry.get(docType);
    const results = await buildListQuery(config, req.tenantClient);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /:docType/:id — Detalle */
router.get('/:docType/:id', async (req: any, res) => {
  try {
    const docType = req.params.docType as DocType;
    if (!DocumentRegistry.has(docType)) {
      return res.status(400).json({ error: `Tipo de documento no válido: ${docType}` });
    }
    const config = DocumentRegistry.get(docType);
    const result = await getDocumentWithLines(
      config,
      req.params.id,
      req.tenantClient,
      req.tenantSchema || req.tenant?.schemaName,
    );
    if (!result) return res.status(404).json({ error: 'No encontrado' });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /:docType/:id/pdf — Descarga PDF */
router.get('/:docType/:id/pdf', async (req: any, res) => {
  try {
    const docType = req.params.docType as DocType;
    if (!DocumentRegistry.has(docType)) {
      return res.status(400).json({ error: `Tipo de documento no válido: ${docType}` });
    }
    await renderDocumentPdf(
      docType,
      req.params.id,
      req.query.templateId as string | undefined,
      req.tenantClient,
      res,
    );
  } catch (error: any) {
    console.error(`[Document PDF] Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /:docType — Crear documento */
router.post('/:docType', async (req: any, res) => {
  try {
    const docType = req.params.docType as DocType;
    if (!DocumentRegistry.has(docType)) {
      return res.status(400).json({ error: `Tipo de documento no válido: ${docType}` });
    }
    const config = DocumentRegistry.get(docType);

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
      entityType: config.headerPgName,
      entityId: result.id,
      action: 'CREATE',
      newValue: { docNum: result.docNum, partnerId: req.body.partnerId },
    });
  } catch (error: any) {
    console.error('[Document Create] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /:docType/:id/post — Postear (solo invoices con campos fiscales) */
router.post('/:docType/:id/post', async (req: any, res) => {
  try {
    const docType = req.params.docType as DocType;
    if (!DocumentRegistry.has(docType)) {
      return res.status(400).json({ error: `Tipo de documento no válido: ${docType}` });
    }
    const config = DocumentRegistry.get(docType);

    if (!config.hasFiscalFields) {
      return res.status(400).json({ error: 'Este tipo de documento no soporta posteo.' });
    }

    const [header] = await req.tenantClient
      .select()
      .from(config.schemaTable)
      .where(eq(config.schemaTable.id, req.params.id));

    if (!header) return res.status(404).json({ error: 'No encontrado' });
    if (header.status !== 'D') {
      return res.status(400).json({
        error: 'Solo se pueden asentar documentos en estado Borrador.',
      });
    }

    // Payment terms
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

    // Withholding
    const withholdingAmount = computeWithholding(Number(header.subtotal), header.withholdingRate);

    await req.tenantClient
      .update(config.schemaTable)
      .set({
        status: 'O',
        isLocked: true,
        lockedAt: new Date(),
        paymentDueLines,
        dueDate,
        withholdingAmount: withholdingAmount != null ? String(withholdingAmount) : null,
      })
      .where(eq(config.schemaTable.id, req.params.id));

    // Asiento contable (best-effort)
    let journalEntryId: string | null = null;
    try {
      const { JournalEngine } = await import('../../core/accounting/JournalEngine');
      const fresh = { ...header, isLocked: true };
      const lines = await req.tenantClient
        .select()
        .from(config.lineSchemaTable)
        .where(eq(config.lineSchemaTable[config.lineFk], req.params.id));

      let jeResult: any;
      if (docType === 'SINV') {
        jeResult = await JournalEngine.createFromSalesInvoice(
          req.tenantClient,
          fresh,
          lines,
          req.user?.id,
        );
      } else if (docType === 'PINV') {
        jeResult = await JournalEngine.createFromPurchaseInvoice(
          req.tenantClient,
          fresh,
          lines,
          req.user?.id,
        );
      }

      if (jeResult) {
        await JournalEngine.post(req.tenantClient, jeResult.id, req.user?.id);
        journalEntryId = jeResult.id;
      }
    } catch (je: any) {
      console.warn(`[Document post] No se pudo generar asiento:`, je.message);
    }

    res.json({
      success: true,
      isLocked: true,
      paymentDueLines,
      dueDate,
      journalEntryId,
    });

    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: config.headerPgName,
      entityId: req.params.id,
      action: 'UPDATE',
      oldValue: { status: 'D', isLocked: false },
      newValue: { status: 'O', isLocked: true, lockedAt: new Date() },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /:docType/:id/cancel — Cancelar documento */
router.post('/:docType/:id/cancel', async (req: any, res) => {
  try {
    const docType = req.params.docType as DocType;
    if (!DocumentRegistry.has(docType)) {
      return res.status(400).json({ error: `Tipo de documento no válido: ${docType}` });
    }
    const config = DocumentRegistry.get(docType);

    const [old] = await req.tenantClient
      .select()
      .from(config.schemaTable)
      .where(eq(config.schemaTable.id, req.params.id));

    const result = await req.tenantClient.transaction(async (tx: any) => {
      const [header] = await tx
        .select()
        .from(config.schemaTable)
        .where(eq(config.schemaTable.id, req.params.id));
      if (!header) throw new Error('No encontrado');
      if (header.status === 'X') throw new Error('Ya está cancelado');
      // Antes esta ruta genérica no comprobaba esto — un albarán ya
      // facturado (status 'C') no debe poder cancelarse por aquí tampoco.
      if (config.category === 'delivery_note' && header.status === 'C') {
        throw new Error('No se puede cancelar: el documento ya está facturado.');
      }

      // Revierte stock (global/almacén/zona/lotes) respetando
      // `baseAlreadyMovedStock`, reabre documentos base y marca 'X' — todo
      // vía DocumentEngine, para los 6 tipos de documento por igual.
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

    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: config.headerPgName,
      entityId: req.params.id,
      action: 'DELETE',
      oldValue: { status: old?.status },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export function createDocumentRouter(): Router {
  return router;
}

export default router;
