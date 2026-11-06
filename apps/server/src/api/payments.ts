import { Router } from 'express';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { logAudit } from '../utils/audit';
import { assertDateNotClosed } from '../core/accounting/periodRules';
import { registerPayment, reversePayment } from '../core/payments/paymentService';
import { broadcastEvent } from '../core/realtime/EventSocket';
import { invalidateDashboardCache } from './dashboard';

const router = Router();

/**
 * GET /api/payments?salesInvoiceId=... o ?purchaseInvoiceId=...
 * Lista los cobros/pagos vinculados a una factura.
 */
router.get('/', async (req: any, res) => {
  try {
    const { salesInvoiceId, purchaseInvoiceId } = req.query;
    if (!salesInvoiceId && !purchaseInvoiceId)
      return res.status(400).json({ error: 'salesInvoiceId o purchaseInvoiceId requerido' });

    const where = salesInvoiceId
      ? eq(schema.payments.salesInvoiceId, String(salesInvoiceId))
      : eq(schema.payments.purchaseInvoiceId, String(purchaseInvoiceId));

    const rows = await req.tenantClient
      .select()
      .from(schema.payments)
      .where(where)
      .orderBy(schema.payments.date);

    res.json(rows);
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

/**
 * POST /api/payments
 * Body: { salesInvoiceId?|purchaseInvoiceId?, date, amount, currencyId?, paymentMethodId?, bankAccountId?, reference?, notes?, source? }
 * Guarda el cobro y su asiento, y recalcula el paymentStatus de la factura vinculada.
 */
router.post('/', async (req: any, res) => {
  try {
    const {
      salesInvoiceId,
      purchaseInvoiceId,
      date,
      amount,
      currencyId,
      exchangeRate,
      amountBase,
      paymentMethodId,
      bankAccountId,
      reference,
      notes,
      source,
      sourceRef,
    } = req.body;

    if (!date || amount == null)
      return res.status(400).json({ error: 'date y amount son obligatorios' });
    if (!reference || !String(reference).trim())
      return res.status(400).json({ error: 'El nº de referencia es obligatorio' });
    if (!salesInvoiceId && !purchaseInvoiceId)
      return res.status(400).json({ error: 'salesInvoiceId o purchaseInvoiceId obligatorio' });
    if (salesInvoiceId && purchaseInvoiceId)
      return res.status(400).json({ error: 'Solo uno de salesInvoiceId o purchaseInvoiceId' });

    const kind = salesInvoiceId ? 'sales' : 'purchase';
    const invoiceId = salesInvoiceId || purchaseInvoiceId;
    const result = await req.tenantClient.transaction((tx: any) =>
      registerPayment(
        tx,
        {
          kind,
          invoiceId,
          date,
          amount: Number(amount),
          reference,
          currencyId,
          exchangeRate,
          amountBase,
          paymentMethodId,
          bankAccountId,
          notes,
          source,
          sourceRef,
        },
        req.user?.id,
      ),
    );
    const { id, journalEntryId } = result;

    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'Payment',
      entityId: id,
      action: 'CREATE',
      newValue: { amount, date, kind, invoiceId, journalEntryId },
    });

    if (req.tenantId) {
      invalidateDashboardCache(req.tenantId);
      broadcastEvent(req.tenantId, {
        type: 'payment.created',
        payload: { id, amount: Number(amount), kind, invoiceId, journalEntryId },
      });
    }

    res.json(result);
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

/**
 * PATCH /api/payments/:id — edita campos informativos (fecha, referencia,
 * método, notas). NO permite cambiar el importe ni la factura vinculada
 * porque eso rompería la contabilidad — para eso hay que anular y recrear.
 */
router.patch('/:id', async (req: any, res) => {
  try {
    const [old] = await req.tenantClient
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, req.params.id));
    if (!old) return res.status(404).json({ error: 'No encontrado' });

    const payload: any = {};
    if ('date' in req.body) {
      if (!req.body.date) return res.status(400).json({ error: 'date obligatorio' });
      await assertDateNotClosed(req.tenantClient, req.body.date);
      payload.date = req.body.date;
    }
    if ('reference' in req.body) {
      const ref = String(req.body.reference || '').trim();
      if (!ref) return res.status(400).json({ error: 'El nº de referencia es obligatorio' });
      payload.reference = ref;
    }
    if ('notes' in req.body) payload.notes = req.body.notes || null;
    if ('paymentMethodId' in req.body) payload.paymentMethodId = req.body.paymentMethodId || null;

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }

    const [row] = await req.tenantClient
      .update(schema.payments)
      .set(payload)
      .where(eq(schema.payments.id, req.params.id))
      .returning();
    res.json(row);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'Payment',
      entityId: req.params.id,
      action: 'UPDATE',
      oldValue: old,
      newValue: row,
    });
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

/**
 * DELETE /api/payments/:id — anula el pago y recalcula.
 */
router.delete('/:id', async (req: any, res) => {
  try {
    const { row, invoiceId } = await req.tenantClient.transaction((tx: any) =>
      reversePayment(tx, req.params.id, req.user?.id),
    );

    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'Payment',
      entityId: req.params.id,
      action: 'DELETE',
      oldValue: { amount: row.amount, invoiceId },
    });

    res.json({ success: true });
  } catch (e: any) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

export default router;
