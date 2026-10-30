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
import { and, eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { DocType } from '@openfactu/common';
import { DocumentRegistry } from '../core/documents/DocumentRegistry';
import { walkChain } from '../core/documents/documentChain';

const router = Router();

/**
 * GET /api/document-links?type=SINV&id=<uuid>
 */
router.get('/', async (req: any, res) => {
  try {
    const type = (req.query.type as DocType) || ('SINV' as DocType);
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: 'id obligatorio' });

    const [parents, children] = await Promise.all([
      walkChain(req.tenantClient, type, id, 'back'),
      walkChain(req.tenantClient, type, id, 'forward'),
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
