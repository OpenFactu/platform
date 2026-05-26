import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';

export type InvoiceKind = 'sales' | 'purchase';

/**
 * Tras insertar/borrar un `Payment` vinculado a una factura, recalcula
 * `amountPaid` y `paymentStatus`.
 *   amountPaid == 0       → 'pending'
 *   0 < amountPaid < total → 'partial'
 *   amountPaid >= total    → 'paid'
 * El estado `overdue` lo marca un job nocturno (fuera de este PR).
 */
export async function recalcInvoicePaymentStatus(
  tenantClient: any,
  kind: InvoiceKind,
  invoiceId: string,
): Promise<{ amountPaid: number; paymentStatus: string; total: number } | null> {
  const invoiceTable = kind === 'sales' ? schema.salesInvoices : schema.purchaseInvoices;
  const fkCol = kind === 'sales' ? 'salesInvoiceId' : 'purchaseInvoiceId';

  const [inv] = await tenantClient
    .select()
    .from(invoiceTable)
    .where(eq(invoiceTable.id, invoiceId));
  if (!inv) return null;

  const [{ sum }] = await tenantClient
    .select({ sum: sql<number>`COALESCE(SUM(${schema.payments.amount}), 0)` })
    .from(schema.payments)
    .where(eq((schema.payments as any)[fkCol], invoiceId));

  const amountPaid = Number(sum || 0);
  const total = Number(inv.total || 0);
  let paymentStatus = 'pending';
  if (amountPaid <= 0) paymentStatus = 'pending';
  else if (amountPaid < total) paymentStatus = 'partial';
  else paymentStatus = 'paid';

  await tenantClient
    .update(invoiceTable)
    .set({
      amountPaid: String(amountPaid),
      paymentStatus,
    })
    .where(eq(invoiceTable.id, invoiceId));

  return { amountPaid, paymentStatus, total };
}

/** Utilidad para generar IDs tipo UUID (coherente con el resto del core). */
export function newId(): string {
  return crypto.randomUUID();
}
