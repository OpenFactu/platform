import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { FactuApi } from '../../core/plugins/FactuApi';
import { logAudit } from '../../utils/audit';
import * as schema from '../../db/schema';
type DocType = 'SINV' | 'PINV' | 'SO' | 'PO' | 'SDN' | 'PDN';

const DOC_TYPE_LABELS: Record<DocType, string> = {
  SINV: 'Factura Venta',
  PINV: 'Factura Compra',
  SO: 'Pedido Venta',
  PO: 'Pedido Compra',
  SDN: 'Albarán Venta',
  PDN: 'Albarán Compra',
};

const router = Router();

const VALID_TYPES = new Set<string>(['SINV', 'PINV', 'SO', 'PO', 'SDN', 'PDN']);

/**
 * POST /api/factuapi/documents/:docType
 * Crea un documento completo con líneas + campos custom + trazabilidad.
 *
 * Body: { partnerId, seriesId, periodId, date, warehouseId?, lines: [...], customFields?: {...} }
 */
router.post('/:docType', async (req: any, res) => {
  const { docType } = req.params;
  if (!VALID_TYPES.has(docType)) {
    return res.status(400).json({
      error: `Tipo de documento inválido: ${docType}. Válidos: ${[...VALID_TYPES].join(', ')}`,
    });
  }

  try {
    const doc = FactuApi.create(docType as DocType);
    doc.fromBody(req.body);

    const result = await doc.save(req.tenantId, req.tenantClient, req.user);

    res.json({
      success: true,
      id: result.id,
      docNum: result.docNum,
      docType,
      label: DOC_TYPE_LABELS[docType as DocType],
    });

    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: `FACTUAPI_${docType}`,
      entityId: result.id,
      action: 'CREATE',
      newValue: { docNum: result.docNum, partnerId: req.body.partnerId },
    });
  } catch (error: any) {
    console.error(`[FactuAPI] Error creating ${docType}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/factuapi/documents/:docType/:id/post
 * Asienta un borrador (D → O). Sólo para facturas.
 */
router.post('/:docType/:id/post', async (req: any, res) => {
  const { docType, id } = req.params;
  if (!VALID_TYPES.has(docType)) {
    return res.status(400).json({ error: `Tipo inválido: ${docType}` });
  }

  try {
    const tableMap: Record<string, any> = {
      SINV: schema.salesInvoices,
      PINV: schema.purchaseInvoices,
    };
    const table = tableMap[docType];
    if (!table) {
      return res
        .status(400)
        .json({ error: `El tipo ${docType} no soporta asentamiento (sólo facturas).` });
    }

    const [header] = await req.tenantClient.select().from(table).where(eq(table.id, id));
    if (!header) return res.status(404).json({ error: 'Documento no encontrado' });
    if (header.status !== 'D')
      return res
        .status(400)
        .json({ error: 'Sólo se pueden asentar documentos en estado Borrador.' });

    await req.tenantClient.update(table).set({ status: 'O' }).where(eq(table.id, id));

    res.json({ success: true, id, status: 'O' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/factuapi/documents/:docType/:id/cancel
 * Cancela un documento. Delega al endpoint existente del tipo correspondiente.
 */
router.post('/:docType/:id/cancel', async (req: any, res) => {
  const { docType, id } = req.params;
  if (!VALID_TYPES.has(docType)) {
    return res.status(400).json({ error: `Tipo inválido: ${docType}` });
  }

  const cancelEndpoints: Record<string, string> = {
    SINV: `/api/sales/invoices/${id}/cancel`,
    PINV: `/api/purchases/invoices/${id}/cancel`,
    SDN: `/api/sales/delivery-notes/${id}/cancel`,
    PDN: `/api/purchases/delivery-notes/${id}/cancel`,
    SO: `/api/sales/${id}/cancel`,
    PO: `/api/purchases/orders/${id}/cancel`,
  };

  try {
    const endpoint = cancelEndpoints[docType];
    // Redirigimos internamente al handler existente
    req.url = endpoint;
    req.method = 'POST';
    req.app.handle(req, res);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
