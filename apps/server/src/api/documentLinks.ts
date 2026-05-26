/**
 * Grafo de documentos relacionados. Dado un documento (tipo + id), devuelve
 * qué documentos lo originaron (parents) y qué documentos se generaron a
 * partir de él (children), más asientos contables y pagos asociados.
 *
 * Cadena de trazabilidad:
 *   Pedido (SO/PO) → Albarán (SDN/PDN) → Factura (SINV/PINV) → Pago → Asiento
 *
 * Links reales en el modelo:
 *   - Albarán → Pedido:  `header.orderId`
 *   - Factura → Albarán: `line.baseType = 'SDN'|'PDN'` + `line.baseId = deliveryLine.id`
 *   - Factura → Pago:    `payments.salesInvoiceId | purchaseInvoiceId`
 *   - Factura → Asiento: `journalEntries.source = sales_invoice|purchase_invoice`
 */
import { Router } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '../db/schema';

const router = Router();

type DocType = 'SO' | 'PO' | 'SDN' | 'PDN' | 'SINV' | 'PINV';

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
  switch (type) {
    case 'SO':
      return schema.salesOrders;
    case 'PO':
      return schema.purchaseOrders;
    case 'SDN':
      return schema.salesDeliveryNotes;
    case 'PDN':
      return schema.purchaseDeliveryNotes;
    case 'SINV':
      return schema.salesInvoices;
    case 'PINV':
      return schema.purchaseInvoices;
  }
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
  if (type === 'SO' || type === 'PO') return [];

  if (type === 'SDN') {
    const [h] = await tenantClient
      .select()
      .from(schema.salesDeliveryNotes)
      .where(eq(schema.salesDeliveryNotes.id, id));
    return h?.orderId ? hydrate(tenantClient, 'SO', [h.orderId]) : [];
  }
  if (type === 'PDN') {
    const [h] = await tenantClient
      .select()
      .from(schema.purchaseDeliveryNotes)
      .where(eq(schema.purchaseDeliveryNotes.id, id));
    return h?.orderId ? hydrate(tenantClient, 'PO', [h.orderId]) : [];
  }

  // SINV / PINV → padres vía `line.baseType + baseId`.
  // La UI guarda `baseId = <pdn/sdn id de CABECERA>` (ver PurchaseInvoices.tsx
  // y SalesDeliveryNotes copy flow). Pero en datos antiguos pudo guardarse
  // como id de LÍNEA del albarán — probamos ambos.
  const lineTable = type === 'SINV' ? schema.salesInvoiceLines : schema.purchaseInvoiceLines;
  const lines = await tenantClient
    .select()
    .from(lineTable)
    .where(eq((lineTable as any).invoiceId, id));

  const byType = new Map<string, string[]>();
  for (const l of lines) {
    if (!l.baseId || !l.baseType) continue;
    const set = byType.get(l.baseType) || [];
    set.push(l.baseId);
    byType.set(l.baseType, set);
  }

  const parents: DocRef[] = [];
  for (const [btype, baseIds] of byType.entries()) {
    const dnHeaderTable =
      btype === 'SDN'
        ? schema.salesDeliveryNotes
        : btype === 'PDN'
          ? schema.purchaseDeliveryNotes
          : null;
    const dnLineTable =
      btype === 'SDN'
        ? schema.salesDeliveryNoteLines
        : btype === 'PDN'
          ? schema.purchaseDeliveryNoteLines
          : null;
    if (!dnHeaderTable || !dnLineTable) continue;

    // 1) Intentamos directamente: baseIds = cabeceras de albarán.
    const headerRows = await tenantClient
      .select({ id: (dnHeaderTable as any).id })
      .from(dnHeaderTable)
      .where(inArray((dnHeaderTable as any).id, baseIds));
    let docIds = headerRows.map((r: any) => r.id);

    // 2) Fallback: baseIds pueden ser ids de líneas del albarán (datos viejos).
    if (docIds.length === 0) {
      const parentLines = await tenantClient
        .select({ deliveryId: (dnLineTable as any).deliveryId })
        .from(dnLineTable)
        .where(inArray((dnLineTable as any).id, baseIds));
      docIds = parentLines.map((l: any) => l.deliveryId);
    }
    parents.push(...(await hydrate(tenantClient, btype as DocType, docIds)));
  }
  return parents;
}

async function childrenOf(tenantClient: any, type: DocType, id: string): Promise<DocRef[]> {
  if (type === 'SO') {
    const dns = await tenantClient
      .select({ id: schema.salesDeliveryNotes.id })
      .from(schema.salesDeliveryNotes)
      .where(eq(schema.salesDeliveryNotes.orderId, id));
    return hydrate(
      tenantClient,
      'SDN',
      dns.map((d: any) => d.id),
    );
  }
  if (type === 'PO') {
    const dns = await tenantClient
      .select({ id: schema.purchaseDeliveryNotes.id })
      .from(schema.purchaseDeliveryNotes)
      .where(eq(schema.purchaseDeliveryNotes.orderId, id));
    return hydrate(
      tenantClient,
      'PDN',
      dns.map((d: any) => d.id),
    );
  }
  if (type === 'SDN') {
    // Las líneas de SalesInvoice tienen `baseType='SDN'` + `baseId` apuntando
    // al ID de la CABECERA del albarán (así lo guarda la UI al generar factura
    // desde albarán). También admitimos el fallback histórico en que `baseId`
    // apuntase a la línea del albarán.
    const byHeader = await tenantClient
      .select({ invoiceId: schema.salesInvoiceLines.invoiceId })
      .from(schema.salesInvoiceLines)
      .where(
        and(eq(schema.salesInvoiceLines.baseType, 'SDN'), eq(schema.salesInvoiceLines.baseId, id)),
      );
    let invoiceIds = byHeader.map((l: any) => l.invoiceId);
    if (invoiceIds.length === 0) {
      // Fallback: baseId puede ser id de línea del albarán en datos antiguos.
      const ourLines = await tenantClient
        .select({ id: schema.salesDeliveryNoteLines.id })
        .from(schema.salesDeliveryNoteLines)
        .where(eq(schema.salesDeliveryNoteLines.deliveryId, id));
      const ids = ourLines.map((l: any) => l.id);
      if (ids.length > 0) {
        const byLine = await tenantClient
          .select({ invoiceId: schema.salesInvoiceLines.invoiceId })
          .from(schema.salesInvoiceLines)
          .where(
            and(
              eq(schema.salesInvoiceLines.baseType, 'SDN'),
              inArray(schema.salesInvoiceLines.baseId, ids),
            ),
          );
        invoiceIds = byLine.map((l: any) => l.invoiceId);
      }
    }
    return hydrate(tenantClient, 'SINV', invoiceIds);
  }
  if (type === 'PDN') {
    const byHeader = await tenantClient
      .select({ invoiceId: schema.purchaseInvoiceLines.invoiceId })
      .from(schema.purchaseInvoiceLines)
      .where(
        and(
          eq(schema.purchaseInvoiceLines.baseType, 'PDN'),
          eq(schema.purchaseInvoiceLines.baseId, id),
        ),
      );
    let invoiceIds = byHeader.map((l: any) => l.invoiceId);
    if (invoiceIds.length === 0) {
      const ourLines = await tenantClient
        .select({ id: schema.purchaseDeliveryNoteLines.id })
        .from(schema.purchaseDeliveryNoteLines)
        .where(eq(schema.purchaseDeliveryNoteLines.deliveryId, id));
      const ids = ourLines.map((l: any) => l.id);
      if (ids.length > 0) {
        const byLine = await tenantClient
          .select({ invoiceId: schema.purchaseInvoiceLines.invoiceId })
          .from(schema.purchaseInvoiceLines)
          .where(
            and(
              eq(schema.purchaseInvoiceLines.baseType, 'PDN'),
              inArray(schema.purchaseInvoiceLines.baseId, ids),
            ),
          );
        invoiceIds = byLine.map((l: any) => l.invoiceId);
      }
    }
    return hydrate(tenantClient, 'PINV', invoiceIds);
  }
  return [];
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

    // Asientos contables vinculados (solo para facturas).
    let journalEntries: Array<{ id: string; number: number; date: string; status: string }> = [];
    if (type === 'SINV' || type === 'PINV') {
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
              type === 'SINV' ? 'sales_invoice' : 'purchase_invoice',
            ),
            eq(schema.journalEntries.sourceDocumentId, id),
          ),
        );
    }

    // Pagos vinculados (solo facturas).
    let payments: Array<{ id: string; date: string; amount: number; reference: string | null }> =
      [];
    if (type === 'SINV') {
      const ps = await req.tenantClient
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.salesInvoiceId, id));
      payments = ps.map((p: any) => ({
        id: p.id,
        date: p.date,
        amount: Number(p.amount),
        reference: p.reference,
      }));
    } else if (type === 'PINV') {
      const ps = await req.tenantClient
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.purchaseInvoiceId, id));
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
