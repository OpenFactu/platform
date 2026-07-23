/**
 * Grafo de documentos relacionados. Dado un documento (tipo + id), devuelve
 * qué documentos lo originaron (parents) y qué documentos se generaron a
 * partir de él (children), más asientos contables y pagos asociados.
 *
 * Cadena de trazabilidad:
 *   Presupuesto (SQ) → Pedido (SO/PO) → Albarán (SDN/PDN) → Factura (SINV/PINV) → Pago → Asiento
 *
 * Registry-driven: los enlaces se derivan de dos campos de DocumentTypeConfig
 * en vez de ramas por tipo, de forma que un tipo nuevo (SQ, plugins) entra al
 * grafo con solo declarar su config:
 *   - `headerBaseRef`: FK de cabecera hacia el padre (SDN.orderId → SO,
 *     SO.quoteId → SQ).
 *   - `linesCarryBaseRef`: las líneas llevan `baseType` + `baseId` (SINV/PINV).
 *     `baseId` apunta al ID de CABECERA del documento base (así lo guarda la
 *     UI actual), pero en datos antiguos pudo guardarse como id de LÍNEA del
 *     base — se prueban ambos (doble sonda legacy, no eliminar).
 */
import { Router } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '../db/schema';
import { DocType } from '@openfactu/common';
import { DocumentRegistry } from '../core/documents/DocumentRegistry';

const router = Router();

interface DocRef {
  type: DocType;
  id: string;
  code: string;
  date: string;
  partnerId: string;
  total: number;
  status: string;
}

function headerTableFor(type: DocType) {
  return DocumentRegistry.get(type).schemaTable;
}

async function hydrate(tenantClient: any, type: DocType, ids: string[]): Promise<DocRef[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return [];
  const table = headerTableFor(type);
  // JOIN con DocumentSeries + AccountingPeriod para obtener prefix y periodCode.
  const rows = await tenantClient
    .select({
      id: (table as any).id,
      docNum: (table as any).docNum,
      date: (table as any).date,
      partnerId: (table as any).partnerId,
      total: (table as any).total,
      status: (table as any).status,
      seriesPrefix: schema.documentSeries.prefix,
      periodCode: schema.accountingPeriods.code,
    })
    .from(table)
    .leftJoin(schema.documentSeries, eq((table as any).seriesId, schema.documentSeries.id))
    .leftJoin(schema.accountingPeriods, eq((table as any).periodId, schema.accountingPeriods.id))
    .where(inArray((table as any).id, unique));
  return rows.map((r: any) => {
    const parts = [r.seriesPrefix, r.periodCode, String(r.docNum).padStart(6, '0')].filter(Boolean);
    return {
      type,
      id: r.id,
      code: parts.join('-'),
      date: r.date,
      partnerId: r.partnerId,
      total: Number(r.total || 0),
      status: r.status,
    };
  });
}

async function parentsOf(tenantClient: any, type: DocType, id: string): Promise<DocRef[]> {
  if (!DocumentRegistry.has(type)) return [];
  const config = DocumentRegistry.get(type);
  const parents: DocRef[] = [];

  // 1) FK de cabecera hacia el padre (albarán → pedido, pedido → presupuesto).
  if (config.headerBaseRef) {
    const { column, baseDocType } = config.headerBaseRef;
    const [h] = await tenantClient
      .select()
      .from(config.schemaTable)
      .where(eq((config.schemaTable as any).id, id));
    if (h?.[column]) {
      parents.push(...(await hydrate(tenantClient, baseDocType, [h[column]])));
    }
  }

  // 2) Líneas con baseType/baseId (factura → albarán, factura → presupuesto).
  if (config.linesCarryBaseRef) {
    const lines = await tenantClient
      .select()
      .from(config.lineSchemaTable)
      .where(eq((config.lineSchemaTable as any)[config.lineFk], id));

    const byType = new Map<string, string[]>();
    for (const l of lines) {
      if (!l.baseId || !l.baseType) continue;
      const set = byType.get(l.baseType) || [];
      set.push(l.baseId);
      byType.set(l.baseType, set);
    }

    for (const [btype, baseIds] of byType.entries()) {
      if (!DocumentRegistry.has(btype)) continue;
      const baseConfig = DocumentRegistry.get(btype);

      // Sonda 1: baseIds = ids de CABECERA del documento base.
      const headerRows = await tenantClient
        .select({ id: (baseConfig.schemaTable as any).id })
        .from(baseConfig.schemaTable)
        .where(inArray((baseConfig.schemaTable as any).id, baseIds));
      let docIds = headerRows.map((r: any) => r.id);

      // Sonda 2 (datos antiguos): baseIds = ids de LÍNEA del base → mapear a
      // su cabecera vía el FK de líneas del base.
      if (docIds.length === 0) {
        const parentLines = await tenantClient
          .select({ headerId: (baseConfig.lineSchemaTable as any)[baseConfig.lineFk] })
          .from(baseConfig.lineSchemaTable)
          .where(inArray((baseConfig.lineSchemaTable as any).id, baseIds));
        docIds = parentLines.map((l: any) => l.headerId);
      }
      parents.push(...(await hydrate(tenantClient, btype as DocType, docIds)));
    }
  }

  return parents;
}

async function childrenOf(tenantClient: any, type: DocType, id: string): Promise<DocRef[]> {
  if (!DocumentRegistry.has(type)) return [];
  const config = DocumentRegistry.get(type);
  const children: DocRef[] = [];

  for (const child of DocumentRegistry.getAll()) {
    // 1) Hijos que referencian por FK de cabecera (pedido → albaranes).
    if (child.headerBaseRef?.baseDocType === type) {
      const rows = await tenantClient
        .select({ id: (child.schemaTable as any).id })
        .from(child.schemaTable)
        .where(eq((child.schemaTable as any)[child.headerBaseRef.column], id));
      children.push(
        ...(await hydrate(
          tenantClient,
          child.docType,
          rows.map((r: any) => r.id),
        )),
      );
    }

    // 2) Hijos cuyas líneas llevan baseType/baseId (albarán → facturas).
    if (child.linesCarryBaseRef) {
      const byHeader = await tenantClient
        .select({ headerId: (child.lineSchemaTable as any)[child.lineFk] })
        .from(child.lineSchemaTable)
        .where(
          and(
            eq((child.lineSchemaTable as any).baseType, type),
            eq((child.lineSchemaTable as any).baseId, id),
          ),
        );
      let childIds = byHeader.map((l: any) => l.headerId);

      // Fallback histórico: baseId apuntando a nuestras LÍNEAS.
      if (childIds.length === 0) {
        const ourLines = await tenantClient
          .select({ id: (config.lineSchemaTable as any).id })
          .from(config.lineSchemaTable)
          .where(eq((config.lineSchemaTable as any)[config.lineFk], id));
        const ids = ourLines.map((l: any) => l.id);
        if (ids.length > 0) {
          const byLine = await tenantClient
            .select({ headerId: (child.lineSchemaTable as any)[child.lineFk] })
            .from(child.lineSchemaTable)
            .where(
              and(
                eq((child.lineSchemaTable as any).baseType, type),
                inArray((child.lineSchemaTable as any).baseId, ids),
              ),
            );
          childIds = byLine.map((l: any) => l.headerId);
        }
      }
      children.push(...(await hydrate(tenantClient, child.docType, childIds)));
    }
  }

  return children;
}

/**
 * GET /api/document-links?type=SINV&id=<uuid>
 */
router.get('/', async (req: any, res) => {
  try {
    const type = (req.query.type as DocType) || ('SINV' as DocType);
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: 'id obligatorio' });

    const [parents, children] = await Promise.all([
      parentsOf(req.tenantClient, type, id),
      childrenOf(req.tenantClient, type, id),
    ]);

    const config = DocumentRegistry.has(type) ? DocumentRegistry.get(type) : null;
    const isInvoice = !!config?.hasFiscalFields;

    // Asientos contables vinculados (solo para facturas).
    let journalEntries: Array<{ id: string; number: number; date: string; status: string }> = [];
    if (isInvoice) {
      journalEntries = await req.tenantClient
        .select({
          id: schema.journalEntries.id,
          number: schema.journalEntries.number,
          date: schema.journalEntries.date,
          status: schema.journalEntries.status,
        })
        .from(schema.journalEntries)
        .where(
          and(
            eq(
              schema.journalEntries.source,
              config!.side === 'sales' ? 'sales_invoice' : 'purchase_invoice',
            ),
            eq(schema.journalEntries.sourceDocumentId, id),
          ),
        );
    }

    // Pagos vinculados (solo facturas).
    let payments: Array<{ id: string; date: string; amount: number; reference: string | null }> =
      [];
    if (isInvoice) {
      const paymentFk =
        config!.side === 'sales'
          ? schema.payments.salesInvoiceId
          : schema.payments.purchaseInvoiceId;
      const ps = await req.tenantClient.select().from(schema.payments).where(eq(paymentFk, id));
      payments = ps.map((p: any) => ({
        id: p.id,
        date: p.date,
        amount: Number(p.amount),
        reference: p.reference,
      }));
    }

    res.json({ parents, children, journalEntries, payments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
