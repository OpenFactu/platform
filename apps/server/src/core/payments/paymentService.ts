/**
 * Cobrar y pagar. Un cobro y su asiento van en la misma transacción: un cobro sin asiento no
 * cuadra con el banco. Solo queda sin él si la empresa no tiene cuentas configuradas, que es no
 * llevar contabilidad; cualquier otro fallo lo deshace todo.
 *
 * Todo el que registre un cobro pasa por aquí: la API, los plugins, la conciliación y las remesas.
 */
import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { JournalEngine } from '../accounting/JournalEngine';
import { paymentPeriodFor } from '../accounting/periodRules';
import { CREDIT_NOTE_SOURCE, lockInvoiceForPayment } from '../documents/creditNoteMoney';
import { statusError } from '../documents/documentRules';
import { recalcInvoicePaymentStatus, type InvoiceKind } from '../documents/paymentStatusRecalc';

export const BANK_SOURCE = 'bank';
export const BATCH_SOURCE = 'batch';

export interface RegisterPaymentInput {
  kind: InvoiceKind;
  invoiceId: string;
  date: string;
  /** Negativo solo para devolver el saldo de un abono. */
  amount: number;
  reference: string;
  currencyId?: string | null;
  exchangeRate?: number | string | null;
  amountBase?: number | string | null;
  paymentMethodId?: string | null;
  bankAccountId?: string | null;
  notes?: string | null;
  source?: string | null;
  sourceRef?: string | null;
}

export interface RegisteredPayment {
  id: string;
  journalEntryId: string | null;
  amountPaid: number;
  paymentStatus: string;
  total: number;
}

async function assertBankAccount(tx: any, bankAccountId: string) {
  const [account] = await tx
    .select({ isActive: schema.companyBankAccounts.isActive })
    .from(schema.companyBankAccounts)
    .where(eq(schema.companyBankAccounts.id, bankAccountId));
  if (!account) throw statusError(400, 'Esa cuenta del banco no existe.');
  if (!account.isActive) throw statusError(400, 'Esa cuenta del banco está desactivada.');
}

/** Registra un cobro o un pago y su asiento. Se llama dentro de una transacción. */
export async function registerPayment(
  tx: any,
  input: RegisterPaymentInput,
  userId?: string | null,
): Promise<RegisteredPayment> {
  const reference = String(input.reference ?? '').trim();
  if (!reference) throw statusError(400, 'El nº de referencia es obligatorio');
  const amount = Number(input.amount);
  const invoice = await lockInvoiceForPayment(tx, input.kind, input.invoiceId, amount);
  // Antes de guardar: un cobro no puede quedarse sin su asiento.
  const periodId = await paymentPeriodFor(tx, input.date, invoice.periodId);
  if (input.bankAccountId) await assertBankAccount(tx, input.bankAccountId);

  const id = crypto.randomUUID();
  await tx.insert(schema.payments).values({
    id,
    salesInvoiceId: input.kind === 'sales' ? input.invoiceId : null,
    purchaseInvoiceId: input.kind === 'purchase' ? input.invoiceId : null,
    date: input.date,
    amount: String(amount),
    currencyId: input.currencyId || null,
    exchangeRate: input.exchangeRate != null ? String(input.exchangeRate) : '1',
    amountBase: input.amountBase != null ? String(input.amountBase) : String(amount),
    paymentMethodId: input.paymentMethodId || null,
    bankAccountId: input.bankAccountId || null,
    reference,
    notes: input.notes || null,
    source: input.source || 'manual',
    sourceRef: input.sourceRef || null,
    createdBy: userId || null,
  });
  const status = await recalcInvoicePaymentStatus(tx, input.kind, input.invoiceId);

  const entry = await JournalEngine.createFromPayment(
    tx,
    {
      id,
      amount,
      date: input.date,
      paymentMethodId: input.paymentMethodId || null,
      bankAccountId: input.bankAccountId || null,
    },
    { id: invoice.id, partnerId: invoice.partnerId, periodId, docNum: invoice.docNum },
    input.kind,
    userId,
  );
  if (entry) await JournalEngine.post(tx, entry.id, userId);

  return {
    id,
    journalEntryId: entry?.id ?? null,
    amountPaid: status?.amountPaid ?? 0,
    paymentStatus: status?.paymentStatus ?? 'pending',
    total: status?.total ?? 0,
  };
}

export interface ReversePaymentOptions {
  /** Lo deshace la propia conciliación o remesa de la que nació. */
  fromOrigin?: boolean;
}

/** Anula un cobro: revierte su asiento y reabre la deuda. Se llama dentro de una transacción. */
export async function reversePayment(
  tx: any,
  paymentId: string,
  userId?: string | null,
  options: ReversePaymentOptions = {},
) {
  const [row] = await tx
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.id, paymentId))
    .for('update');
  if (!row) throw statusError(404, 'No encontrado');
  if (row.source === CREDIT_NOTE_SOURCE) {
    throw statusError(409, 'Esto es la aplicación de un abono, no un cobro.');
  }
  if (!options.fromOrigin) {
    const [match] = await tx
      .select({ id: schema.bankMatches.id })
      .from(schema.bankMatches)
      .where(eq(schema.bankMatches.paymentId, paymentId));
    if (match) {
      throw statusError(
        409,
        'Este cobro está conciliado con el banco: deshaz antes la conciliación.',
      );
    }
    if (row.source === BATCH_SOURCE) {
      throw statusError(409, 'Este cobro viene de una remesa: devuélvelo desde la remesa.');
    }
  }

  // Antes de borrar: el contra-asiento queda ligado al cobro. Si no se puede, el cobro se queda,
  // porque borrarlo dejaría su asiento en los libros.
  const [entry] = await tx
    .select()
    .from(schema.journalEntries)
    .where(
      and(
        eq(schema.journalEntries.source, 'payment'),
        eq(schema.journalEntries.sourceDocumentId, paymentId),
        eq(schema.journalEntries.status, 'posted'),
      ),
    );
  if (entry) {
    await JournalEngine.reverse(tx, entry.id, userId, `Anulación de cobro/pago ${paymentId}`);
  }

  await tx.delete(schema.payments).where(eq(schema.payments.id, paymentId));

  const invoiceId = row.salesInvoiceId || row.purchaseInvoiceId;
  const kind: InvoiceKind = row.salesInvoiceId ? 'sales' : 'purchase';
  if (invoiceId) await recalcInvoicePaymentStatus(tx, kind, invoiceId);
  return { row, kind, invoiceId };
}
