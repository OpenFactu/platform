/**
 * Conciliar: los movimientos del banco frente a cobros y pagos. Enlazar un cobro que ya existía no
 * cambia los libros. Lo que nace aquí (un cobro, un asiento) se apunta como tal, y deshacer la
 * conciliación lo deshace también.
 */
import crypto from 'crypto';
import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { JournalEngine } from '../accounting/JournalEngine';
import { openPeriodsFor } from '../accounting/periodRules';
import { hydrate } from '../documents/documentChain';
import { CREDIT_NOTE_SOURCE, remaining } from '../documents/creditNoteMoney';
import { statusError } from '../documents/documentRules';
import type { InvoiceKind } from '../documents/paymentStatusRecalc';
import { BANK_SOURCE, registerPayment, reversePayment } from '../payments/paymentService';
import { scoreCandidate, type MatchReason } from './statementLines';

const toCents = (amount: number) => Math.round(amount * 100);

const lines = schema.bankStatementLines;

/** Con su signo: un cobro de venta entra en la cuenta y un pago de compra sale. */
const signedOf = (payment: any) => (payment.salesInvoiceId ? 1 : -1) * Number(payment.amount);

interface Ctx {
  db: any;
  user?: any;
}

async function lockOpenLine(tx: any, lineId: string) {
  const [line] = await tx.select().from(lines).where(eq(lines.id, lineId)).for('update');
  if (!line) throw statusError(404, 'Movimiento no encontrado');
  if (line.status === 'matched') throw statusError(409, 'Este movimiento ya está conciliado.');
  if (line.status === 'ignored') throw statusError(409, 'Este movimiento está ignorado.');
  return line;
}

async function bankAccountOf(tx: any, line: any) {
  const [account] = await tx
    .select()
    .from(schema.companyBankAccounts)
    .where(eq(schema.companyBankAccounts.id, line.bankAccountId));
  return account;
}

async function saveMatch(
  tx: any,
  ctx: Ctx,
  lineId: string,
  match: {
    paymentId?: string;
    journalEntryId?: string;
    amount: number;
    createdFromLine: boolean;
  },
) {
  await tx.insert(schema.bankMatches).values({
    id: crypto.randomUUID(),
    statementLineId: lineId,
    paymentId: match.paymentId ?? null,
    journalEntryId: match.journalEntryId ?? null,
    amount: String(match.amount),
    createdFromLine: match.createdFromLine,
    createdBy: ctx.user?.id ?? null,
  });
}

const markMatched = (tx: any, lineId: string) =>
  tx.update(lines).set({ status: 'matched' }).where(eq(lines.id, lineId));

/**
 * El asiento de una parte del movimiento contra una cuenta: una comisión, unos intereses. `signed`
 * es lo que explica del movimiento: en positivo entra en el banco.
 */
async function entryAgainstAccount(
  tx: any,
  ctx: Ctx,
  line: any,
  signed: number,
  target: { accountId?: string; description?: string },
): Promise<string> {
  const account = await bankAccountOf(tx, line);
  if (!account?.accountId) {
    throw statusError(400, 'Esta cuenta del banco no tiene cuenta contable: ponle una antes.');
  }
  const accountId = String(target.accountId ?? '');
  const [counter] = await tx
    .select({ id: schema.chartOfAccounts.id, isActive: schema.chartOfAccounts.isActive })
    .from(schema.chartOfAccounts)
    .where(eq(schema.chartOfAccounts.id, accountId));
  if (!counter?.isActive) throw statusError(400, 'Esa cuenta contable no existe.');
  if (counter.id === account.accountId) {
    throw statusError(400, 'Elige una cuenta distinta de la del propio banco.');
  }
  const description = String(target.description ?? '').trim() || line.description || 'Banco';
  const [period] = await openPeriodsFor(tx, line.date);
  if (!period) throw statusError(409, `No hay un periodo contable abierto para el ${line.date}.`);

  const amount = Math.abs(signed);
  const treasury = { accountId: account.accountId, description };
  const other = { accountId: counter.id, description };
  const entry = await JournalEngine.create(tx, {
    date: line.date,
    periodId: period.id,
    description,
    source: 'bank',
    sourceDocumentId: line.id,
    createdBy: ctx.user?.id,
    lines:
      signed > 0
        ? [
            { ...treasury, debit: amount, credit: 0 },
            { ...other, debit: 0, credit: amount },
          ]
        : [
            { ...other, debit: amount, credit: 0 },
            { ...treasury, debit: 0, credit: amount },
          ],
  });
  await JournalEngine.post(tx, entry.id, ctx.user?.id);
  return entry.id;
}

/** Lo que falta para cuadrar: o se lleva a una cuenta o se rechaza. */
async function settleDifference(
  tx: any,
  ctx: Ctx,
  line: any,
  explainedCents: number,
  difference?: { accountId?: string; description?: string },
) {
  const gap = toCents(Number(line.amount)) - explainedCents;
  if (gap === 0) return;
  if (!difference?.accountId) {
    throw statusError(
      409,
      `El movimiento es de ${Number(line.amount).toFixed(2)} y lo elegido suma ${(explainedCents / 100).toFixed(2)}.`,
    );
  }
  const signed = gap / 100;
  const journalEntryId = await entryAgainstAccount(tx, ctx, line, signed, difference);
  await saveMatch(tx, ctx, line.id, { journalEntryId, amount: signed, createdFromLine: true });
}

export interface DifferenceInput {
  accountId?: string;
  description?: string;
}

/** Enlaza un movimiento con cobros y pagos que ya existen. */
export async function matchLine(
  ctx: Ctx,
  lineId: string,
  input: { paymentIds?: string[]; difference?: DifferenceInput },
) {
  const paymentIds = Array.isArray(input?.paymentIds) ? [...new Set(input.paymentIds)] : [];
  if (paymentIds.length === 0) throw statusError(400, 'Elige al menos un cobro o pago.');
  return ctx.db.transaction(async (tx: any) => {
    const line = await lockOpenLine(tx, lineId);
    const payments = await tx
      .select()
      .from(schema.payments)
      .where(inArray(schema.payments.id, paymentIds))
      .for('update');
    if (payments.length !== paymentIds.length) throw statusError(400, 'Ese cobro no existe.');
    const taken = await tx
      .select({ id: schema.bankMatches.paymentId })
      .from(schema.bankMatches)
      .where(inArray(schema.bankMatches.paymentId, paymentIds));
    if (taken.length > 0)
      throw statusError(409, 'Ese cobro ya está conciliado con otro movimiento.');
    for (const payment of payments) {
      if (payment.source === CREDIT_NOTE_SOURCE) {
        throw statusError(400, 'La aplicación de un abono no pasa por el banco.');
      }
      if (payment.bankAccountId && payment.bankAccountId !== line.bankAccountId) {
        throw statusError(409, 'Ese cobro es de otra cuenta del banco.');
      }
    }
    const explained = payments.reduce(
      (sum: number, payment: any) => sum + toCents(signedOf(payment)),
      0,
    );
    await settleDifference(tx, ctx, line, explained, input.difference);
    for (const payment of payments) {
      await saveMatch(tx, ctx, lineId, {
        paymentId: payment.id,
        amount: signedOf(payment),
        createdFromLine: false,
      });
    }
    await tx
      .update(schema.payments)
      .set({ bankAccountId: line.bankAccountId })
      .where(and(inArray(schema.payments.id, paymentIds), isNull(schema.payments.bankAccountId)));
    await markMatched(tx, lineId);
    return { success: true };
  });
}

const invoiceTableOf = (kind: InvoiceKind): any =>
  kind === 'sales' ? schema.salesInvoices : schema.purchaseInvoices;

/** Crea los cobros desde el movimiento: con su fecha y por esa cuenta del banco. */
export async function payFromLine(
  ctx: Ctx,
  lineId: string,
  input: {
    invoices?: Array<{ kind?: InvoiceKind; id?: string; amount?: number }>;
    paymentMethodId?: string | null;
    difference?: DifferenceInput;
  },
) {
  const wanted = Array.isArray(input?.invoices) ? input.invoices : [];
  if (wanted.length === 0) throw statusError(400, 'Elige al menos una factura.');
  return ctx.db.transaction(async (tx: any) => {
    const line = await lockOpenLine(tx, lineId);
    const inflow = Number(line.amount) > 0;
    let explained = 0;
    const created: Array<{ id: string; amount: number }> = [];
    for (const item of wanted) {
      const kind: InvoiceKind = item.kind === 'purchase' ? 'purchase' : 'sales';
      const invoiceId = String(item.id ?? '');
      const positive = Number(item.amount);
      if (!(positive > 0)) throw statusError(400, 'El importe tiene que ser mayor que cero.');
      const [invoice] = await tx
        .select({ rectifiesInvoiceId: invoiceTableOf(kind).rectifiesInvoiceId })
        .from(invoiceTableOf(kind))
        .where(eq(invoiceTableOf(kind).id, invoiceId));
      if (!invoice) throw statusError(400, 'Esa factura no existe.');
      // Un abono se devuelve en negativo, y eso le da la vuelta al sentido del dinero.
      const amount = invoice.rectifiesInvoiceId ? -positive : positive;
      const signed = (kind === 'sales' ? 1 : -1) * amount;
      if (signed > 0 !== inflow) {
        throw statusError(
          409,
          inflow
            ? 'Este movimiento es una entrada: no paga esa factura.'
            : 'Este movimiento es una salida: no cobra esa factura.',
        );
      }
      const payment = await registerPayment(
        tx,
        {
          kind,
          invoiceId,
          date: String(line.date).slice(0, 10),
          amount,
          reference: line.reference || line.description?.slice(0, 80) || `Banco ${line.date}`,
          paymentMethodId: input.paymentMethodId,
          bankAccountId: line.bankAccountId,
          source: BANK_SOURCE,
          sourceRef: line.id,
        },
        ctx.user?.id,
      );
      created.push({ id: payment.id, amount: signed });
      explained += toCents(signed);
    }
    await settleDifference(tx, ctx, line, explained, input.difference);
    for (const payment of created) {
      await saveMatch(tx, ctx, lineId, {
        paymentId: payment.id,
        amount: payment.amount,
        createdFromLine: true,
      });
    }
    await markMatched(tx, lineId);
    return { success: true, payments: created.map((payment) => payment.id) };
  });
}

/** Explica el movimiento entero con un asiento contra una cuenta. */
export async function entryFromLine(ctx: Ctx, lineId: string, input: DifferenceInput) {
  return ctx.db.transaction(async (tx: any) => {
    const line = await lockOpenLine(tx, lineId);
    const signed = Number(line.amount);
    const journalEntryId = await entryAgainstAccount(tx, ctx, line, signed, input ?? {});
    await saveMatch(tx, ctx, lineId, { journalEntryId, amount: signed, createdFromLine: true });
    await markMatched(tx, lineId);
    return { success: true, journalEntryId };
  });
}

/** Lo deja como estaba: lo que nació aquí se anula y lo que ya existía sigue ahí. */
export async function undoLine(ctx: Ctx, lineId: string) {
  return ctx.db.transaction(async (tx: any) => {
    const [line] = await tx.select().from(lines).where(eq(lines.id, lineId)).for('update');
    if (!line) throw statusError(404, 'Movimiento no encontrado');
    if (line.status !== 'matched') throw statusError(409, 'Este movimiento no está conciliado.');
    const matches = await tx
      .select()
      .from(schema.bankMatches)
      .where(eq(schema.bankMatches.statementLineId, lineId));
    await tx.delete(schema.bankMatches).where(eq(schema.bankMatches.statementLineId, lineId));
    for (const match of matches) {
      if (!match.createdFromLine) continue;
      if (match.paymentId) {
        await reversePayment(tx, match.paymentId, ctx.user?.id, { fromOrigin: true });
      }
      if (match.journalEntryId) {
        await JournalEngine.reverse(
          tx,
          match.journalEntryId,
          ctx.user?.id,
          `Conciliación deshecha: ${line.description ?? line.date}`,
        );
      }
    }
    await tx.update(lines).set({ status: 'open' }).where(eq(lines.id, lineId));
    return { success: true, undone: matches.length };
  });
}

/** Lo que no se va a conciliar nunca: lo de antes de empezar, lo que ya se llevó aparte. */
export async function ignoreLine(ctx: Ctx, lineId: string, ignored: boolean) {
  return ctx.db.transaction(async (tx: any) => {
    const [line] = await tx.select().from(lines).where(eq(lines.id, lineId)).for('update');
    if (!line) throw statusError(404, 'Movimiento no encontrado');
    if (line.status === 'matched') throw statusError(409, 'Este movimiento ya está conciliado.');
    await tx
      .update(lines)
      .set({ status: ignored ? 'ignored' : 'open' })
      .where(eq(lines.id, lineId));
    return { success: true };
  });
}

/** El movimiento y con qué está conciliado. */
export async function statementLineDetail(db: any, lineId: string) {
  const [line] = await db.select().from(lines).where(eq(lines.id, lineId));
  if (!line) throw statusError(404, 'Movimiento no encontrado');
  const matches = await db
    .select({
      match: schema.bankMatches,
      payment: schema.payments,
    })
    .from(schema.bankMatches)
    .leftJoin(schema.payments, eq(schema.bankMatches.paymentId, schema.payments.id))
    .where(eq(schema.bankMatches.statementLineId, lineId));
  const codes = await invoiceCodes(
    db,
    matches.flatMap((row: any) => (row.payment ? [row.payment] : [])),
  );
  return {
    ...line,
    matches: matches.map(({ match, payment }: any) => ({
      ...match,
      reference: payment?.reference ?? null,
      date: payment?.date ?? null,
      invoiceCode: payment
        ? (codes.get(payment.salesInvoiceId || payment.purchaseInvoiceId) ?? null)
        : null,
    })),
  };
}

async function invoiceCodes(db: any, payments: any[]) {
  const sales = payments.map((row) => row.salesInvoiceId).filter(Boolean);
  const purchases = payments.map((row) => row.purchaseInvoiceId).filter(Boolean);
  const docs: any[] = [
    ...(sales.length ? await hydrate(db, 'SINV' as any, sales) : []),
    ...(purchases.length ? await hydrate(db, 'PINV' as any, purchases) : []),
  ];
  return new Map<string, string>(docs.map((doc) => [doc.id, doc.code]));
}

const SUGGESTIONS = 30;
const SCANNED = 500;

interface Scored {
  score: number;
  reasons: MatchReason[];
}

const byScore = (a: Scored, b: Scored) => b.score - a.score;

/** Lo que se parece a este movimiento: cobros sin conciliar y facturas con deuda. */
export async function suggestForLine(db: any, lineId: string, query?: string) {
  const [line] = await db.select().from(lines).where(eq(lines.id, lineId));
  if (!line) throw statusError(404, 'Movimiento no encontrado');
  const movement = {
    date: String(line.date),
    amount: Number(line.amount),
    description: line.description,
    reference: line.reference,
    counterparty: line.counterparty,
  };
  const inflow = movement.amount > 0;
  const search = (query ?? '').trim().toLowerCase();

  // Cobros y pagos: los que van en este sentido, de esta cuenta o sin cuenta, y sin conciliar.
  const p = schema.payments;
  const paymentRows = await db
    .select({ payment: p })
    .from(p)
    .leftJoin(schema.bankMatches, eq(schema.bankMatches.paymentId, p.id))
    .where(
      and(
        isNull(schema.bankMatches.id),
        ne(p.source, CREDIT_NOTE_SOURCE),
        or(isNull(p.bankAccountId), eq(p.bankAccountId, line.bankAccountId)),
        inflow
          ? or(
              and(sql`${p.salesInvoiceId} IS NOT NULL`, gt(p.amount, '0')),
              and(sql`${p.purchaseInvoiceId} IS NOT NULL`, sql`${p.amount} < 0`),
            )
          : or(
              and(sql`${p.purchaseInvoiceId} IS NOT NULL`, gt(p.amount, '0')),
              and(sql`${p.salesInvoiceId} IS NOT NULL`, sql`${p.amount} < 0`),
            ),
      ),
    )
    .orderBy(desc(p.date))
    .limit(SCANNED);
  const payments = paymentRows.map((row: any) => row.payment);
  const codes = await invoiceCodes(db, payments);

  const partnerNames = new Map<string, string>();
  const partnerIds = async (table: any, ids: string[]) => {
    if (ids.length === 0) return;
    const rows = await db
      .select({ id: table.id, name: schema.businessPartners.name })
      .from(table)
      .innerJoin(schema.businessPartners, eq(table.partnerId, schema.businessPartners.id))
      .where(inArray(table.id, ids));
    for (const row of rows) partnerNames.set(row.id, row.name);
  };
  await partnerIds(
    schema.salesInvoices,
    payments.map((row: any) => row.salesInvoiceId).filter(Boolean),
  );
  await partnerIds(
    schema.purchaseInvoices,
    payments.map((row: any) => row.purchaseInvoiceId).filter(Boolean),
  );

  const paymentSuggestions = payments
    .map((payment: any) => {
      const invoiceId = payment.salesInvoiceId || payment.purchaseInvoiceId;
      const invoiceCode = codes.get(invoiceId) ?? null;
      const partnerName = partnerNames.get(invoiceId) ?? null;
      const signed = signedOf(payment);
      return {
        id: payment.id,
        date: payment.date,
        amount: signed,
        reference: payment.reference,
        invoiceCode,
        partnerName,
        ...scoreCandidate(movement, {
          amount: signed,
          date: String(payment.date),
          partnerName,
          codes: [invoiceCode, payment.reference],
        }),
      };
    })
    .filter(
      (row: any) =>
        !search ||
        [row.invoiceCode, row.partnerName, row.reference].some((text) =>
          (text ?? '').toLowerCase().includes(search),
        ),
    )
    .sort(byScore)
    .slice(0, SUGGESTIONS);

  const invoiceSuggestions = [
    ...(await openInvoices(db, inflow ? 'sales' : 'purchase', false)),
    ...(await openInvoices(db, inflow ? 'purchase' : 'sales', true)),
  ]
    .map((invoice) => ({
      ...invoice,
      ...scoreCandidate(movement, {
        amount: invoice.remaining,
        date: String(invoice.date),
        partnerName: invoice.partnerName,
        codes: [invoice.code, invoice.externalRef],
      }),
    }))
    .filter(
      (row) =>
        !search ||
        [row.code, row.partnerName, row.externalRef].some((text) =>
          (text ?? '').toLowerCase().includes(search),
        ),
    )
    .sort(byScore)
    .slice(0, SUGGESTIONS);

  return { payments: paymentSuggestions, invoices: invoiceSuggestions };
}

/** Las facturas emitidas con deuda; `notes`, los abonos con saldo por devolver. */
async function openInvoices(db: any, kind: InvoiceKind, notes: boolean) {
  const table = invoiceTableOf(kind);
  const rows = await db
    .select({ invoice: table, partnerName: schema.businessPartners.name })
    .from(table)
    .innerJoin(schema.businessPartners, eq(table.partnerId, schema.businessPartners.id))
    .where(
      and(
        eq(table.status, 'O'),
        notes ? sql`${table.rectifiesInvoiceId} IS NOT NULL` : isNull(table.rectifiesInvoiceId),
      ),
    )
    .orderBy(desc(table.date))
    .limit(SCANNED);
  const open = rows
    .map((row: any) => ({ ...row, left: remaining(row.invoice) }))
    .filter((row: any) => row.left > 0);
  const docs: any[] = open.length
    ? await hydrate(
        db,
        (kind === 'sales' ? 'SINV' : 'PINV') as any,
        open.map((row: any) => row.invoice.id),
      )
    : [];
  return open.map((row: any) => ({
    id: row.invoice.id as string,
    kind,
    isCreditNote: notes,
    code: docs.find((doc) => doc.id === row.invoice.id)?.code ?? String(row.invoice.docNum),
    externalRef: (row.invoice.externalRef as string | null) ?? null,
    partnerName: row.partnerName as string,
    date: row.invoice.date,
    dueDate: row.invoice.dueDate ?? null,
    remaining: row.left as number,
  }));
}
