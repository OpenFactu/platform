/**
 * Remesas: vencimientos de facturas agrupados para cobrarlos o pagarlos de una vez.
 *
 * Borrador, generada y cerrada. El fichero lo genera alguien y lo sube al banco: aquí no sale nada
 * solo. Al cerrar se crean los cobros; una devolución los deshace y reabre la deuda. Mientras no se
 * cierra, lo metido en una remesa queda reservado para que no entre en otra.
 */
import crypto from 'crypto';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { hydrate } from '../documents/documentChain';
import { statusError } from '../documents/documentRules';
import type { InvoiceKind } from '../documents/paymentStatusRecalc';
import { toIsoDate, unpaidInstallments } from '../dunning/overdue';
import { nextLogisticsCode } from '../logistics/logisticsCodes';
import { BATCH_SOURCE, registerPayment, reversePayment } from '../payments/paymentService';
import { BankFormats, type BatchForExport, type BatchKind } from './bankFormats';

const batches = schema.paymentBatches;
const batchLines = schema.paymentBatchLines;

const toCents = (amount: number) => Math.round(amount * 100);

const isKind = (kind: unknown): kind is BatchKind => kind === 'collection' || kind === 'payment';
const invoiceKindOf = (kind: BatchKind): InvoiceKind =>
  kind === 'collection' ? 'sales' : 'purchase';
const invoiceTableOf = (kind: BatchKind): any =>
  kind === 'collection' ? schema.salesInvoices : schema.purchaseInvoices;
const invoiceColumnOf = (kind: BatchKind): any =>
  kind === 'collection' ? batchLines.salesInvoiceId : batchLines.purchaseInvoiceId;

/** Lo que está en remesas todavía sin cerrar, por factura. */
async function reservedByInvoice(db: any, kind: BatchKind, invoiceIds?: string[]) {
  const column = invoiceColumnOf(kind);
  const rows = await db
    .select({ invoiceId: column, value: sql<string>`SUM(${batchLines.amount})` })
    .from(batchLines)
    .innerJoin(batches, eq(batchLines.batchId, batches.id))
    .where(
      and(
        inArray(batches.status, ['draft', 'generated']),
        eq(batchLines.status, 'open'),
        ...(invoiceIds ? [inArray(column, invoiceIds)] : []),
      ),
    )
    .groupBy(column);
  return new Map<string, number>(rows.map((row: any) => [row.invoiceId, Number(row.value)]));
}

/** Los vencimientos que se pueden meter en una remesa: con deuda y sin reservar. */
export async function batchCandidates(db: any, query: { kind?: unknown; until?: unknown }) {
  if (!isKind(query.kind)) throw statusError(400, 'Di si la remesa es de cobro o de pago.');
  const kind = query.kind;
  const table = invoiceTableOf(kind);
  const rows = await db
    .select({ invoice: table, partner: schema.businessPartners })
    .from(table)
    .innerJoin(schema.businessPartners, eq(table.partnerId, schema.businessPartners.id))
    .where(
      and(
        eq(table.status, 'O'),
        isNull(table.rectifiesInvoiceId),
        sql`COALESCE(${table.amountPaid}, 0) < ${table.total}`,
      ),
    )
    .orderBy(asc(table.date));
  const reserved = await reservedByInvoice(db, kind);
  const until = query.until ? String(query.until).slice(0, 10) : null;
  const dues = rows.flatMap((row: any) =>
    unpaidInstallments({
      ...row.invoice,
      // Lo reservado se trata como cobrado: cubre primero el plazo más antiguo.
      amountPaid: Number(row.invoice.amountPaid ?? 0) + (reserved.get(row.invoice.id) ?? 0),
    })
      .filter((due) => !until || due.date <= until)
      .map((due) => ({ ...row, due })),
  );
  const docs: any[] = dues.length
    ? await hydrate(db, (kind === 'collection' ? 'SINV' : 'PINV') as any, [
        ...new Set<string>(dues.map((row: any) => row.invoice.id)),
      ])
    : [];
  return dues.map(({ invoice, partner, due }: any) => ({
    invoiceId: invoice.id as string,
    code: docs.find((doc) => doc.id === invoice.id)?.code ?? String(invoice.docNum),
    partnerId: partner.id as string,
    partnerName: partner.name as string,
    dueDate: due.date as string,
    amount: due.amount as number,
    iban: (partner.iban as string | null) ?? null,
    mandateRef: (partner.mandateRef as string | null) ?? null,
    problems: [
      ...(partner.iban ? [] : ['noIban']),
      ...(kind === 'collection' && !partner.mandateRef ? ['noMandate'] : []),
    ],
  }));
}

export interface BatchInput {
  kind?: unknown;
  bankAccountId?: string;
  chargeDate?: string;
  notes?: string;
  lines?: Array<{ invoiceId?: string; dueDate?: string; amount?: unknown }>;
}

const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);

/** La crea en borrador. Con las facturas bloqueadas, para que dos no reserven la misma deuda. */
export async function createBatch(ctx: { db: any; user?: any }, input: BatchInput) {
  if (!isKind(input?.kind)) throw statusError(400, 'Di si la remesa es de cobro o de pago.');
  const kind = input.kind;
  if (!isDate(input.chargeDate)) throw statusError(400, 'Indica la fecha de cargo.');
  const chargeDate = input.chargeDate.slice(0, 10);
  const wanted = Array.isArray(input.lines) ? input.lines : [];
  if (wanted.length === 0) throw statusError(400, 'Elige al menos un vencimiento.');

  return ctx.db.transaction(async (tx: any) => {
    const [account] = await tx
      .select({
        id: schema.companyBankAccounts.id,
        isActive: schema.companyBankAccounts.isActive,
      })
      .from(schema.companyBankAccounts)
      .where(eq(schema.companyBankAccounts.id, String(input.bankAccountId ?? '')));
    if (!account) throw statusError(400, 'Esa cuenta del banco no existe.');
    if (!account.isActive) throw statusError(400, 'Esa cuenta del banco está desactivada.');

    const table = invoiceTableOf(kind);
    const invoiceIds = [...new Set(wanted.map((line) => String(line.invoiceId ?? '')))].sort();
    const invoices = await tx
      .select()
      .from(table)
      .where(inArray(table.id, invoiceIds))
      .orderBy(asc(table.id))
      .for('update');
    const reserved = await reservedByInvoice(tx, kind, invoiceIds);
    const docs: any[] = invoices.length
      ? await hydrate(
          tx,
          (kind === 'collection' ? 'SINV' : 'PINV') as any,
          invoices.map((invoice: any) => invoice.id),
        )
      : [];
    const partners = invoices.length
      ? await tx
          .select()
          .from(schema.businessPartners)
          .where(
            inArray(
              schema.businessPartners.id,
              invoices.map((invoice: any) => invoice.partnerId),
            ),
          )
      : [];

    const taken = new Map<string, number>();
    let total = 0;
    const rows = wanted.map((line) => {
      const invoice = invoices.find((row: any) => row.id === line.invoiceId);
      if (!invoice) throw statusError(400, 'Esa factura no es de este tipo de remesa.');
      if (invoice.status !== 'O' || invoice.rectifiesInvoiceId) {
        throw statusError(409, 'Solo entran facturas emitidas.');
      }
      if (!isDate(line.dueDate)) throw statusError(400, 'Falta el vencimiento de una línea.');
      const cents = toCents(Number(line.amount));
      if (!(cents > 0)) throw statusError(400, 'El importe tiene que ser mayor que cero.');
      const code = docs.find((doc) => doc.id === invoice.id)?.code ?? String(invoice.docNum);
      const left =
        toCents(Number(invoice.total)) -
        toCents(Number(invoice.amountPaid ?? 0)) -
        toCents(reserved.get(invoice.id) ?? 0) -
        (taken.get(invoice.id) ?? 0);
      if (cents > left) {
        throw statusError(
          409,
          `De la factura ${code} solo quedan ${(Math.max(0, left) / 100).toFixed(2)} sin reservar.`,
        );
      }
      taken.set(invoice.id, (taken.get(invoice.id) ?? 0) + cents);
      total += cents;
      const partner = partners.find((row: any) => row.id === invoice.partnerId);
      return {
        id: crypto.randomUUID(),
        salesInvoiceId: kind === 'collection' ? invoice.id : null,
        purchaseInvoiceId: kind === 'payment' ? invoice.id : null,
        partnerId: invoice.partnerId,
        dueDate: line.dueDate.slice(0, 10),
        amount: String(cents / 100),
        iban: partner?.iban ?? null,
        swift: partner?.bankSwift ?? null,
        mandateRef: partner?.mandateRef ?? null,
        mandateDate: partner?.mandateDate ?? null,
      };
    });

    const id = crypto.randomUUID();
    const code = await nextLogisticsCode(tx, 'REM');
    await tx.insert(batches).values({
      id,
      code,
      kind,
      bankAccountId: account.id,
      chargeDate,
      total: String(total / 100),
      notes: input.notes?.trim() || null,
      createdBy: ctx.user?.id ?? null,
    });
    await tx.insert(batchLines).values(rows.map((row) => ({ ...row, batchId: id })));
    return { id, code };
  });
}

export async function listBatches(db: any) {
  const rows = await db
    .select({
      batch: batches,
      accountName: schema.companyBankAccounts.name,
    })
    .from(batches)
    .leftJoin(schema.companyBankAccounts, eq(batches.bankAccountId, schema.companyBankAccounts.id))
    .orderBy(desc(batches.createdAt));
  const counts = await db
    .select({ batchId: batchLines.batchId, value: count() })
    .from(batchLines)
    .groupBy(batchLines.batchId);
  return rows.map(({ batch, accountName }: any) => {
    // El contenido del fichero no viaja en el listado.
    const { fileContent: _file, ...rest } = batch;
    return {
      ...rest,
      accountName,
      lineCount: Number(counts.find((row: any) => row.batchId === batch.id)?.value ?? 0),
    };
  });
}

export async function batchDetail(db: any, id: string) {
  const [row] = await db
    .select({ batch: batches, accountName: schema.companyBankAccounts.name })
    .from(batches)
    .leftJoin(schema.companyBankAccounts, eq(batches.bankAccountId, schema.companyBankAccounts.id))
    .where(eq(batches.id, id));
  if (!row) throw statusError(404, 'Remesa no encontrada');
  const lines = await db
    .select({ line: batchLines, partnerName: schema.businessPartners.name })
    .from(batchLines)
    .innerJoin(schema.businessPartners, eq(batchLines.partnerId, schema.businessPartners.id))
    .where(eq(batchLines.batchId, id))
    .orderBy(asc(batchLines.dueDate));
  const codes = await lineInvoiceCodes(
    db,
    lines.map((item: any) => item.line),
  );
  const { fileContent: _file, ...batch } = row.batch;
  return {
    ...batch,
    accountName: row.accountName,
    lines: lines.map(({ line, partnerName }: any) => ({
      ...line,
      partnerName,
      invoiceCode: codes.get(line.salesInvoiceId || line.purchaseInvoiceId) ?? null,
    })),
  };
}

async function lineInvoiceCodes(db: any, lines: any[]) {
  const sales = lines.map((line) => line.salesInvoiceId).filter(Boolean);
  const purchases = lines.map((line) => line.purchaseInvoiceId).filter(Boolean);
  const docs: any[] = [
    ...(sales.length ? await hydrate(db, 'SINV' as any, sales) : []),
    ...(purchases.length ? await hydrate(db, 'PINV' as any, purchases) : []),
  ];
  return new Map<string, string>(docs.map((doc) => [doc.id, doc.code]));
}

async function lockBatch(tx: any, id: string) {
  const [batch] = await tx.select().from(batches).where(eq(batches.id, id)).for('update');
  if (!batch) throw statusError(404, 'Remesa no encontrada');
  return batch;
}

/** Hasta que se cierra, el banco no la ha cobrado: se puede tirar y la deuda queda libre. */
export async function deleteBatch(ctx: { db: any }, id: string) {
  return ctx.db.transaction(async (tx: any) => {
    const batch = await lockBatch(tx, id);
    if (batch.status === 'closed') {
      throw statusError(409, 'Una remesa cerrada no se borra: anota sus devoluciones.');
    }
    await tx.delete(batches).where(eq(batches.id, id));
    return { success: true, code: batch.code };
  });
}

async function companyOf(db: any) {
  const rows = await db
    .select()
    .from(schema.systemConfigs)
    .where(
      inArray(schema.systemConfigs.key, [
        'company_name',
        'companyName',
        'company_tax_id',
        'companyTaxId',
      ]),
    );
  const value = (...keys: string[]) =>
    keys.map((key) => rows.find((row: any) => row.key === key)?.value).find(Boolean) ?? null;
  return {
    name: value('company_name', 'companyName') ?? '',
    taxId: value('company_tax_id', 'companyTaxId'),
  };
}

async function batchForExport(tx: any, batch: any): Promise<BatchForExport> {
  const [account] = await tx
    .select({
      account: schema.companyBankAccounts,
      currencyCode: schema.currencies.code,
    })
    .from(schema.companyBankAccounts)
    .leftJoin(schema.currencies, eq(schema.companyBankAccounts.currencyId, schema.currencies.id))
    .where(eq(schema.companyBankAccounts.id, batch.bankAccountId));
  const lines = await tx
    .select({
      line: batchLines,
      partnerName: schema.businessPartners.name,
      partnerTaxId: schema.businessPartners.nif,
    })
    .from(batchLines)
    .innerJoin(schema.businessPartners, eq(batchLines.partnerId, schema.businessPartners.id))
    .where(eq(batchLines.batchId, batch.id))
    .orderBy(asc(batchLines.dueDate));
  const codes = await lineInvoiceCodes(
    tx,
    lines.map((row: any) => row.line),
  );
  return {
    code: batch.code,
    kind: batch.kind,
    chargeDate: toIsoDate(batch.chargeDate),
    total: Number(batch.total),
    createdAt: new Date().toISOString(),
    company: await companyOf(tx),
    account: {
      name: account.account.name,
      iban: account.account.iban,
      swift: account.account.swift,
      bankName: account.account.bankName,
      creditorId: account.account.creditorId,
      currencyCode: account.currencyCode,
    },
    lines: lines.map(({ line, partnerName, partnerTaxId }: any) => ({
      id: line.id,
      partnerName,
      partnerTaxId: partnerTaxId ?? null,
      iban: line.iban,
      swift: line.swift,
      mandateRef: line.mandateRef,
      mandateDate: line.mandateDate ? toIsoDate(line.mandateDate) : null,
      amount: Number(line.amount),
      dueDate: toIsoDate(line.dueDate),
      invoiceCode: codes.get(line.salesInvoiceId || line.purchaseInvoiceId) ?? '',
    })),
  };
}

/**
 * Hasta generar el fichero vale lo que diga la ficha: arreglar un mandato tiene que servir sin
 * rehacer la remesa. Lo generado se guarda tal cual y ya no cambia.
 */
async function refreshPartnerData(tx: any, batchId: string) {
  const lines = await tx
    .select({ id: batchLines.id, partnerId: batchLines.partnerId })
    .from(batchLines)
    .where(eq(batchLines.batchId, batchId));
  const partners = await tx
    .select()
    .from(schema.businessPartners)
    .where(
      inArray(schema.businessPartners.id, [
        ...new Set<string>(lines.map((line: any) => line.partnerId)),
      ]),
    );
  for (const line of lines) {
    const partner = partners.find((row: any) => row.id === line.partnerId);
    await tx
      .update(batchLines)
      .set({
        iban: partner?.iban ?? null,
        swift: partner?.bankSwift ?? null,
        mandateRef: partner?.mandateRef ?? null,
        mandateDate: partner?.mandateDate ?? null,
      })
      .where(eq(batchLines.id, line.id));
  }
}

/** Genera el fichero para el banco. No cobra nada: eso es al cerrar. */
export async function generateBatch(
  ctx: { db: any; tenantId?: string },
  id: string,
  input: { exporterId?: string },
) {
  return ctx.db.transaction(async (tx: any) => {
    const batch = await lockBatch(tx, id);
    if (batch.status === 'closed') throw statusError(409, 'Esta remesa ya está cerrada.');
    const exporter = BankFormats.exportersFor(ctx.tenantId, batch.kind).find(
      (candidate) => candidate.id === input?.exporterId,
    );
    if (!exporter) throw statusError(400, 'Ese formato de remesa no está disponible.');
    await refreshPartnerData(tx, id);
    const payload = await batchForExport(tx, batch);
    const missing = exporter.validate?.(payload) ?? [];
    if (missing.length > 0) throw statusError(409, missing.join(' '));
    const file = exporter.generate(payload);
    await tx
      .update(batches)
      .set({
        status: 'generated',
        exporterId: exporter.id,
        fileName: file.fileName,
        fileType: file.contentType,
        fileContent: file.content,
        generatedAt: new Date(),
      })
      .where(eq(batches.id, id));
    return { id, code: batch.code, status: 'generated', fileName: file.fileName };
  });
}

/** El fichero tal como se generó: el que se haya subido al banco. */
export async function batchFile(db: any, id: string) {
  const [batch] = await db
    .select({
      fileName: batches.fileName,
      fileType: batches.fileType,
      fileContent: batches.fileContent,
    })
    .from(batches)
    .where(eq(batches.id, id));
  if (!batch?.fileContent) throw statusError(404, 'Esta remesa todavía no tiene fichero.');
  return batch;
}

/** El banco la ha aceptado: se crean los cobros, en la fecha de cargo y por su cuenta. */
export async function closeBatch(ctx: { db: any; user?: any }, id: string) {
  return ctx.db.transaction(async (tx: any) => {
    const batch = await lockBatch(tx, id);
    if (batch.status === 'closed') throw statusError(409, 'Esta remesa ya está cerrada.');
    if (batch.status !== 'generated') throw statusError(409, 'Genera antes el fichero.');
    const lines = await tx
      .select()
      .from(batchLines)
      .where(eq(batchLines.batchId, id))
      .orderBy(asc(batchLines.salesInvoiceId), asc(batchLines.purchaseInvoiceId));
    const codes = await lineInvoiceCodes(tx, lines);
    for (const line of lines) {
      const invoiceId = line.salesInvoiceId || line.purchaseInvoiceId;
      let payment;
      try {
        payment = await registerPayment(
          tx,
          {
            kind: invoiceKindOf(batch.kind),
            invoiceId,
            date: toIsoDate(batch.chargeDate),
            amount: Number(line.amount),
            reference: batch.code,
            bankAccountId: batch.bankAccountId,
            source: BATCH_SOURCE,
            sourceRef: line.id,
          },
          ctx.user?.id,
        );
      } catch (error: any) {
        // Cerrar es todo o nada: se dice qué factura lo ha impedido.
        error.message = `Factura ${codes.get(invoiceId) ?? ''}: ${error.message}`;
        throw error;
      }
      await tx.update(batchLines).set({ paymentId: payment.id }).where(eq(batchLines.id, line.id));
    }
    await tx
      .update(batches)
      .set({ status: 'closed', closedAt: new Date() })
      .where(eq(batches.id, id));
    return { id, code: batch.code, status: 'closed' };
  });
}

/** El banco devolvió un cargo: se deshace su cobro y la deuda vuelve a estar abierta. */
export async function returnBatchLine(
  ctx: { db: any; user?: any },
  batchId: string,
  lineId: string,
  input: { reason?: string },
) {
  const reason = String(input?.reason ?? '').trim();
  if (!reason) throw statusError(400, 'Indica el motivo de la devolución.');
  return ctx.db.transaction(async (tx: any) => {
    const batch = await lockBatch(tx, batchId);
    if (batch.status !== 'closed') {
      throw statusError(409, 'Solo se devuelve lo de una remesa cerrada.');
    }
    const [line] = await tx
      .select()
      .from(batchLines)
      .where(and(eq(batchLines.id, lineId), eq(batchLines.batchId, batchId)))
      .for('update');
    if (!line) throw statusError(404, 'Esa línea no es de esta remesa.');
    if (line.status === 'returned') throw statusError(409, 'Esta línea ya está devuelta.');
    await tx
      .update(batchLines)
      .set({ status: 'returned', returnedAt: new Date(), returnReason: reason, paymentId: null })
      .where(eq(batchLines.id, lineId));
    if (line.paymentId) {
      // El banco suele devolver días después, con el ingreso de la remesa ya conciliado. Ese dinero
      // entró de verdad: el movimiento sigue explicado, ahora por el asiento del cobro.
      const [entry] = await tx
        .select({ id: schema.journalEntries.id })
        .from(schema.journalEntries)
        .where(
          and(
            eq(schema.journalEntries.source, 'payment'),
            eq(schema.journalEntries.sourceDocumentId, line.paymentId),
            eq(schema.journalEntries.status, 'posted'),
          ),
        );
      await tx
        .update(schema.bankMatches)
        .set({ paymentId: null, journalEntryId: entry?.id ?? null })
        .where(eq(schema.bankMatches.paymentId, line.paymentId));
      await reversePayment(tx, line.paymentId, ctx.user?.id, { fromOrigin: true });
    }
    return { success: true, amount: Number(line.amount) };
  });
}
