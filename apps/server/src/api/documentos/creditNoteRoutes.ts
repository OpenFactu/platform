/** Rutas de abonos, iguales en facturas de venta y de compra. */
import { Router } from 'express';
import { logAudit } from '../../utils/audit';
import { DocumentRegistry } from '../../core/documents/DocumentRegistry';
import {
  createCreditNote,
  creditNotePreparation,
  invoiceCreditNotes,
  type InvoiceSide,
} from '../../core/documents/creditNotes';
import {
  applyCreditToInvoice,
  creditTargets,
  partnerCreditBalance,
} from '../../core/documents/creditNoteMoney';

export function creditNoteRoutes(side: InvoiceSide): Router {
  const router = Router();
  const config = DocumentRegistry.get(side === 'sales' ? 'SINV' : 'PINV');

  /** Lo que un interlocutor tiene a favor en abonos emitidos. */
  router.get('/credit-balance', async (req: any, res) => {
    try {
      if (!req.query.partnerId) return res.status(400).json({ error: 'partnerId obligatorio' });
      res.json(await partnerCreditBalance(req.tenantClient, side, String(req.query.partnerId)));
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  /** Lo que hace falta para preparar un abono: líneas por abonar y tipos rectificativos. */
  /** Los abonos que tiene una factura, para decirlo en su ficha. */
  router.get('/:id/credit-notes', async (req: any, res) => {
    try {
      res.json(await invoiceCreditNotes(req.tenantClient, side, req.params.id));
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.get('/:id/credit-note', async (req: any, res) => {
    try {
      res.json(await creditNotePreparation(req.tenantClient, side, req.params.id));
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.post('/:id/credit-note', async (req: any, res) => {
    try {
      const result = await createCreditNote(
        { tenantId: req.tenantId, db: req.tenantClient, user: req.user },
        side,
        req.params.id,
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
        newValue: { docNum: result.docNum, rectifiesInvoiceId: req.params.id },
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.get('/:id/credit-targets', async (req: any, res) => {
    try {
      res.json(await creditTargets(req.tenantClient, side, req.params.id));
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.post('/:id/apply-credit', async (req: any, res) => {
    try {
      await applyCreditToInvoice(req.tenantClient, side, req.params.id, req.body, req.user?.id);
      res.json({ success: true });
      logAudit({
        tenantClient: req.tenantClient,
        tenantId: req.tenantId || '',
        userId: req.user?.id,
        entityType: config.headerPgName,
        entityId: req.params.id,
        action: 'UPDATE',
        newValue: { appliedTo: req.body?.targetInvoiceId, amount: req.body?.amount },
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  return router;
}
