/**
 * El dinero de un abono. Al emitirse baja la deuda de su factura; lo que sobra queda a
 * favor del interlocutor hasta aplicarlo a otra factura o devolverlo con un pago negativo.
 *
 * Aplicar un abono no mueve dinero, solo cruza dos documentos: por eso son dos `Payment`
 * de origen `credit_note`, uno en cada factura y sin asiento de cobro.
 */
import crypto from 'crypto';
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { recalcInvoicePaymentStatus, type InvoiceKind } from './paymentStatusRecalc';
import { hydrate } from './documentChain';

export const CREDIT_NOTE_SOURCE = 'credit_note';

const round2 = (n: number) => Math.round(n * 100) / 100;

const invoiceTable = (side: InvoiceKind): any =>
  side === 'sales' ? schema.salesInvoices : schema.purchaseInvoices;

function httpError(statusCode: number, message: string): Error {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/** Lo que queda por cobrar de una factura, o por aplicar de un abono, en positivo. */
export const remaining = (doc: any) =>
  round2(Math.abs(Number(doc.total)) - Math.abs(Number(doc.amountPaid ?? 0)));

async function recordApplication(
  tx: any,
  side: InvoiceKind,
  note: any,
  invoice: any,
  amount: number,
  userId?: string | null,
) {
  const fk = side === 'sales' ? 'salesInvoiceId' : 'purchaseInvoiceId';
  const row = (invoiceId: string, value: number, sourceRef: string, reference: string) => ({
    id: crypto.randomUUID(),
    [fk]: invoiceId,
    date: note.date,
    amount: String(value),
    amountBase: String(value),
    exchangeRate: '1',
    reference,
    source: CREDIT_NOTE_SOURCE,
    sourceRef,
    createdBy: userId || null,
  });
  // El código con el que se conocen, no el número suelto: en cada serie se repite.
  const docs = await hydrate(tx, side === 'sales' ? 'SINV' : ('PINV' as any), [
    note.id,
    invoice.id,
  ]);
  const codeOf = (doc: any) => docs.find((d) => d.id === doc.id)?.code ?? String(doc.docNum);
  await tx
    .insert(schema.payments)
    .values([
      row(invoice.id, amount, note.id, `Abono ${codeOf(note)}`),
      row(note.id, -amount, invoice.id, `Factura ${codeOf(invoice)}`),
    ]);
  await recalcInvoicePaymentStatus(tx, side, invoice.id);
  await recalcInvoicePaymentStatus(tx, side, note.id);
}

/** Al emitir un abono: baja lo pendiente de su factura, hasta donde llegue. */
export async function applyCreditNote(
  tx: any,
  side: InvoiceKind,
  note: any,
  userId?: string | null,
): Promise<void> {
  const table = invoiceTable(side);
  const [invoice] = await tx
    .select()
    .from(table)
    .where(eq(table.id, note.rectifiesInvoiceId))
    .for('update');
  if (!invoice) return;
  const amount = Math.min(remaining(invoice), Math.abs(Number(note.total)));
  if (amount > 0) await recordApplication(tx, side, note, invoice, round2(amount), userId);
}

export interface CreditBalanceNote {
  id: string;
  docNum: number;
  date: Date;
  total: number;
  applied: number;
  available: number;
}

/** Los abonos emitidos de un interlocutor que aún tienen saldo. */
export async function partnerCreditBalance(
  db: any,
  side: InvoiceKind,
  partnerId: string,
): Promise<{ total: number; notes: CreditBalanceNote[] }> {
  const table = invoiceTable(side);
  const rows = await db
    .select()
    .from(table)
    .where(
      and(
        eq(table.partnerId, partnerId),
        eq(table.status, 'O'),
        isNotNull(table.rectifiesInvoiceId),
        sql`ABS(${table.total}) > ABS(COALESCE(${table.amountPaid}, 0))`,
      ),
    )
    .orderBy(asc(table.date));
  const notes = rows.map((row: any) => ({
    id: row.id,
    docNum: row.docNum,
    date: row.date,
    total: Number(row.total),
    applied: Number(row.amountPaid ?? 0),
    available: remaining(row),
  }));
  return {
    total: round2(notes.reduce((sum: number, note: CreditBalanceNote) => sum + note.available, 0)),
    notes,
  };
}

/** A qué facturas se puede aplicar un abono: emitidas, con deuda y del mismo interlocutor. */
export async function creditTargets(db: any, side: InvoiceKind, noteId: string) {
  const table = invoiceTable(side);
  const [note] = await db.select().from(table).where(eq(table.id, noteId));
  if (!note || !note.rectifiesInvoiceId) throw httpError(404, 'Abono no encontrado.');
  const rows = await db
    .select({
      id: table.id,
      docNum: table.docNum,
      date: table.date,
      total: table.total,
      amountPaid: table.amountPaid,
      seriesPrefix: schema.documentSeries.prefix,
      periodCode: schema.accountingPeriods.code,
    })
    .from(table)
    .leftJoin(schema.documentSeries, eq(table.seriesId, schema.documentSeries.id))
    .leftJoin(schema.accountingPeriods, eq(table.periodId, schema.accountingPeriods.id))
    .where(
      and(
        eq(table.partnerId, note.partnerId),
        eq(table.status, 'O'),
        isNull(table.rectifiesInvoiceId),
        sql`${table.total} > COALESCE(${table.amountPaid}, 0)`,
      ),
    )
    .orderBy(asc(table.date));
  return rows.map((row: any) => ({ ...row, remaining: remaining(row) }));
}

/** Aplica saldo de un abono a otra factura emitida del mismo interlocutor. */
export async function applyCreditToInvoice(
  db: any,
  side: InvoiceKind,
  noteId: string,
  input: { targetInvoiceId: string; amount: number },
  userId?: string | null,
): Promise<void> {
  const table = invoiceTable(side);
  const amount = round2(Number(input?.amount));
  if (!(amount > 0)) throw httpError(400, 'El importe tiene que ser mayor que cero.');
  if (input?.targetInvoiceId === noteId) {
    throw httpError(400, 'Un abono no se aplica a sí mismo.');
  }

  await db.transaction(async (tx: any) => {
    const [note] = await tx.select().from(table).where(eq(table.id, noteId)).for('update');
    if (!note || !note.rectifiesInvoiceId) throw httpError(404, 'Abono no encontrado.');
    if (note.status !== 'O') throw httpError(400, 'Solo se aplican abonos emitidos.');
    if (amount > remaining(note)) throw httpError(400, 'Es más de lo que queda en este abono.');

    const [target] = await tx
      .select()
      .from(table)
      .where(eq(table.id, input.targetInvoiceId))
      .for('update');
    if (!target) throw httpError(400, 'Factura de destino no encontrada.');
    if (target.partnerId !== note.partnerId) {
      throw httpError(400, 'La factura de destino es de otro interlocutor.');
    }
    if (target.status !== 'O' || target.rectifiesInvoiceId) {
      throw httpError(400, 'Solo se aplica a facturas emitidas.');
    }
    if (amount > remaining(target)) throw httpError(400, 'Es más de lo que debe esa factura.');

    await recordApplication(tx, side, note, target, amount, userId);
  });
}

/**
 * Lo que admite un documento: una factura emitida, hasta lo que le queda por cobrar. Un
 * pago negativo solo tiene sentido al devolver el saldo de un abono, y a un abono no se le
 * cobra en positivo. Lanza si el importe no encaja.
 */
export function assertPaymentFits(invoice: any, amount: number): void {
  if (!invoice) throw httpError(404, 'Factura no encontrada.');
  if (!Number.isFinite(amount) || amount === 0) {
    throw httpError(400, 'El importe no puede ser cero.');
  }
  const isNote = !!invoice.rectifiesInvoiceId;
  if (!isNote && amount < 0) {
    throw httpError(400, 'Un importe negativo solo vale para devolver el saldo de un abono.');
  }
  if (invoice.status !== 'O') {
    throw httpError(409, 'Solo se registran cobros y pagos en facturas emitidas.');
  }
  const left = remaining(invoice);
  if (isNote) {
    if (amount > 0) throw httpError(400, 'Un abono se devuelve con un importe negativo.');
    if (round2(Math.abs(amount)) > left) {
      throw httpError(400, `Solo quedan ${left} por devolver en este abono.`);
    }
    return;
  }
  if (left <= 0) throw httpError(409, 'Esta factura ya está saldada.');
  if (round2(amount) > left) {
    throw httpError(409, `Solo quedan ${left.toFixed(2)} pendientes en esta factura.`);
  }
}

/**
 * Bloquea la factura y comprueba que el cobro le cabe. Dentro de la transacción que lo
 * guarda: así, de dos cobros a la vez, el segundo ve lo que ha dejado el primero.
 */
export async function lockInvoiceForPayment(
  tx: any,
  side: InvoiceKind,
  invoiceId: string,
  amount: number,
): Promise<any> {
  const table = invoiceTable(side);
  const [invoice] = await tx.select().from(table).where(eq(table.id, invoiceId)).for('update');
  assertPaymentFits(invoice, amount);
  return invoice;
}
