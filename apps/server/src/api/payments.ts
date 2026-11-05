import { Router } from 'express';
import { eq, or, and } from 'drizzle-orm';
import * as schema from '../db/schema';
import { logAudit } from '../utils/audit';
import { newId, recalcInvoicePaymentStatus } from '../core/documents/paymentStatusRecalc';
import { JournalEngine } from '../core/accounting/JournalEngine';
import { assertDateNotClosed, paymentPeriodFor } from '../core/accounting/periodRules';
import { CREDIT_NOTE_SOURCE, lockInvoiceForPayment } from '../core/documents/creditNoteMoney';
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
 * Body: { salesInvoiceId?|purchaseInvoiceId?, date, amount, currencyId?, paymentMethodId?, reference?, notes?, source? }
 * Al crear, recalcula el paymentStatus de la factura vinculada.
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
    const id = newId();
    let paymentPeriodId = '';
    const result = await req.tenantClient.transaction(async (tx: any) => {
      const invoice = await lockInvoiceForPayment(tx, kind, invoiceId, Number(amount));
      // Antes de guardar: un cobro no puede quedarse sin su asiento.
      paymentPeriodId = await paymentPeriodFor(tx, date, invoice.periodId);
      await tx.insert(schema.payments).values({
        id,
        salesInvoiceId: salesInvoiceId || null,
        purchaseInvoiceId: purchaseInvoiceId || null,
        date,
        amount: String(amount),
        currencyId: currencyId || null,
        exchangeRate: exchangeRate != null ? String(exchangeRate) : '1',
        amountBase: amountBase != null ? String(amountBase) : String(amount),
        paymentMethodId: paymentMethodId || null,
        reference: String(reference).trim(),
        notes: notes || null,
        source: source || 'manual',
        sourceRef: sourceRef || null,
        createdBy: req.user?.id || null,
      });
      return recalcInvoicePaymentStatus(tx, kind, invoiceId);
    });

    // Asiento automático del cobro/pago (best-effort).
    let journalEntryId: string | null = null;
    try {
      const invoiceTable = kind === 'sales' ? schema.salesInvoices : schema.purchaseInvoices;
      const [inv] = await req.tenantClient
        .select()
        .from(invoiceTable)
        .where(eq(invoiceTable.id, invoiceId!));
      if (inv) {
        const je = await JournalEngine.createFromPayment(
          req.tenantClient,
          { id, amount, date, paymentMethodId: paymentMethodId || null },
          { id: inv.id, partnerId: inv.partnerId, periodId: paymentPeriodId, docNum: inv.docNum },
          kind as 'sales' | 'purchase',
          req.user?.id,
        );
        if (je) {
          await JournalEngine.post(req.tenantClient, je.id, req.user?.id);
          journalEntryId = je.id;
        }
      }
    } catch (err: any) {
      console.warn('[Payment POST] No se pudo generar asiento:', err.message);
    }

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

    res.json({ id, journalEntryId, ...result });
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
    const [row] = await req.tenantClient
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, req.params.id));
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    if (row.source === CREDIT_NOTE_SOURCE) {
      return res.status(409).json({ error: 'Esto es la aplicación de un abono, no un cobro.' });
    }

    // Reversar asiento asociado (si existe) ANTES de borrar el pago —
    // así el contra-asiento queda vinculado con sourceDocumentId del pago. Si no se
    // puede, el cobro se queda: borrarlo dejaría su asiento en los libros.
    const [je] = await req.tenantClient
      .select()
      .from(schema.journalEntries)
      .where(
        and(
          eq(schema.journalEntries.source, 'payment'),
          eq(schema.journalEntries.sourceDocumentId, req.params.id),
          eq(schema.journalEntries.status, 'posted'),
        ),
      );
    if (je) {
      await JournalEngine.reverse(
        req.tenantClient,
        je.id,
        req.user?.id,
        `Anulación de cobro/pago ${req.params.id}`,
      );
    }

    await req.tenantClient.delete(schema.payments).where(eq(schema.payments.id, req.params.id));

    const invoiceId = row.salesInvoiceId || row.purchaseInvoiceId;
    const kind = row.salesInvoiceId ? 'sales' : 'purchase';
    if (invoiceId) {
      await recalcInvoicePaymentStatus(req.tenantClient, kind as any, invoiceId);
    }

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
