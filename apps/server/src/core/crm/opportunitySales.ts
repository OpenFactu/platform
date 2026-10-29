/**
 * Ventas de una oportunidad: líneas de interés, presupuesto a partir de ellas
 * y los documentos que han salido de ella.
 */
import crypto from 'crypto';
import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { DocumentEngine } from '../documents/DocumentEngine';
import { DocumentRegistry } from '../documents/DocumentRegistry';
import { pricesForPartner } from '../pricing/effectivePrices';

export interface OpportunityLineInput {
  itemId?: string | null;
  description?: string | null;
  quantity: number | string;
  price?: number | string | null;
  discount?: number | string | null;
}

/** Importe neto de una línea (cantidad × precio − descuento %). */
export function lineNet(l: { quantity: any; price: any; discount?: any }): number {
  const gross = (Number(l.quantity) || 0) * (Number(l.price) || 0);
  return gross * (1 - (Number(l.discount) || 0) / 100);
}

export async function listLines(db: any, opportunityId: string) {
  return db
    .select({
      line: schema.opportunityLines,
      itemCode: schema.items.code,
      itemName: schema.items.name,
    })
    .from(schema.opportunityLines)
    .leftJoin(schema.items, eq(schema.opportunityLines.itemId, schema.items.id))
    .where(eq(schema.opportunityLines.opportunityId, opportunityId))
    .orderBy(asc(schema.opportunityLines.sortOrder))
    .then((rows: any[]) =>
      rows.map((r) => ({ ...r.line, itemCode: r.itemCode, itemName: r.itemName })),
    );
}

/**
 * Sustituye las líneas de la oportunidad. Las que no traen precio toman el de
 * la tarifa del cliente. Si hay líneas, el importe de la oportunidad pasa a
 * ser su suma; sin líneas se respeta el importe tecleado a mano.
 */
export async function replaceLines(
  db: any,
  opportunity: { id: string; partnerId: string | null },
  input: OpportunityLineInput[],
) {
  const missing = input.filter(
    (l) => l.itemId && (l.price === undefined || l.price === null || l.price === ''),
  );
  const prices = await pricesForPartner(
    db,
    opportunity.partnerId,
    missing.map((l) => l.itemId as string),
  );
  const rows = input.map((l, i) => ({
    id: crypto.randomUUID(),
    opportunityId: opportunity.id,
    itemId: l.itemId || null,
    description: l.description || null,
    quantity: String(Number(l.quantity) || 0),
    price: String(
      l.price === undefined || l.price === null || l.price === ''
        ? (prices.get(l.itemId as string) ?? 0)
        : Number(l.price) || 0,
    ),
    discount: String(Math.min(100, Math.max(0, Number(l.discount) || 0))),
    sortOrder: i,
  }));

  await db.transaction(async (tx: any) => {
    await tx
      .delete(schema.opportunityLines)
      .where(eq(schema.opportunityLines.opportunityId, opportunity.id));
    if (rows.length) await tx.insert(schema.opportunityLines).values(rows);
    if (rows.length) {
      const total = rows.reduce((s, r) => s + lineNet(r), 0);
      await tx
        .update(schema.opportunities)
        .set({ amount: total.toFixed(4), updatedAt: new Date() })
        .where(eq(schema.opportunities.id, opportunity.id));
    }
  });
  return listLines(db, opportunity.id);
}

/** Serie y periodo por defecto para un tipo de documento en una fecha. */
async function defaultSeriesAndPeriod(db: any, docType: string, date: string) {
  const periods = await db
    .select()
    .from(schema.accountingPeriods)
    .where(
      and(
        eq(schema.accountingPeriods.status, 'O'),
        lte(schema.accountingPeriods.startDate, new Date(`${date}T23:59:59`)),
      ),
    )
    .orderBy(desc(schema.accountingPeriods.startDate));
  const period =
    periods.find((p: any) => new Date(p.endDate).toISOString().slice(0, 10) >= date) ??
    periods[0] ??
    null;
  if (!period) throw new Error('No hay ningún periodo contable abierto');

  const series = await db
    .select()
    .from(schema.documentSeries)
    .where(eq(schema.documentSeries.docType, docType));
  const pick =
    series.find((s: any) => s.periodId === period.id && s.isDefault) ??
    series.find((s: any) => s.periodId === period.id) ??
    series.find((s: any) => s.isDefault) ??
    series[0];
  if (!pick) throw new Error('No hay ninguna serie de presupuestos configurada');
  return { period, series: pick };
}

/**
 * Crea un presupuesto (SQ) con las líneas de la oportunidad y lo deja
 * enlazado a ella. Las líneas sin artículo no pueden ir a un documento.
 */
export async function createQuoteFromOpportunity(
  db: any,
  ctx: { tenantId: string; user: any },
  opportunity: any,
  opts: { validDays?: number } = {},
): Promise<{ id: string; docNum: number }> {
  if (!opportunity.partnerId)
    throw new Error('Convierte antes el prospecto en cliente para poder presupuestarle');
  const lines = (await listLines(db, opportunity.id)).filter((l: any) => l.itemId);
  if (lines.length === 0)
    throw new Error('Añade al menos un producto con artículo a la oportunidad');

  const itemRows = await db
    .select({ id: schema.items.id, taxGroupId: schema.items.taxGroupId })
    .from(schema.items)
    .where(
      inArray(
        schema.items.id,
        lines.map((l: any) => l.itemId),
      ),
    );
  const taxByItem = new Map(itemRows.map((i: any) => [i.id, i.taxGroupId]));

  const date = new Date().toISOString().slice(0, 10);
  const { period, series } = await defaultSeriesAndPeriod(db, 'SQ', date);
  const validUntil = new Date(Date.now() + (opts.validDays ?? 30) * 86_400_000);
  const config = DocumentRegistry.get('SQ' as any);

  const result = await DocumentEngine.create(
    ctx.tenantId,
    db,
    ctx.user,
    {
      tableName: config.tableName,
      schemaTable: config.schemaTable,
      lineSchemaTable: config.lineSchemaTable,
      batchSchemaTable: config.batchSchemaTable,
      eventPrefix: config.eventPrefix,
      stockAction: config.stockAction,
      closeBaseDocuments: config.closeBaseDocuments,
      initialStatus: config.initialStatus,
      hooks: config.hooks,
    },
    {
      seriesId: series.id,
      periodId: period.id,
      partnerId: opportunity.partnerId,
      date,
      validUntil,
      lines: lines.map((l: any) => ({
        itemId: l.itemId,
        quantity: Number(l.quantity),
        price: Number(l.price),
        discountRate: Number(l.discount) || 0,
        taxGroupId: taxByItem.get(l.itemId) as string,
        description: l.description || undefined,
      })),
    },
  );

  await db
    .update(schema.salesQuotes)
    .set({ opportunityId: opportunity.id })
    .where(eq(schema.salesQuotes.id, result.id));
  return result;
}

const seriesCode = (prefix: string | null, docNum: number) => `${prefix ?? ''}${docNum}`;

/**
 * Documentos que han salido de la oportunidad: sus presupuestos, los pedidos
 * que vienen de ellos y las facturas que los referencian en sus líneas.
 */
export async function opportunityDocuments(db: any, opportunityId: string) {
  const quotes = await db
    .select({
      id: schema.salesQuotes.id,
      docNum: schema.salesQuotes.docNum,
      prefix: schema.documentSeries.prefix,
      date: schema.salesQuotes.date,
      status: schema.salesQuotes.status,
      total: schema.salesQuotes.total,
      validUntil: schema.salesQuotes.validUntil,
    })
    .from(schema.salesQuotes)
    .leftJoin(schema.documentSeries, eq(schema.salesQuotes.seriesId, schema.documentSeries.id))
    .where(eq(schema.salesQuotes.opportunityId, opportunityId))
    .orderBy(desc(schema.salesQuotes.date));
  const quoteIds = quotes.map((q: any) => q.id);

  const orders = quoteIds.length
    ? await db
        .select({
          id: schema.salesOrders.id,
          docNum: schema.salesOrders.docNum,
          prefix: schema.documentSeries.prefix,
          date: schema.salesOrders.date,
          status: schema.salesOrders.status,
          total: schema.salesOrders.total,
        })
        .from(schema.salesOrders)
        .leftJoin(schema.documentSeries, eq(schema.salesOrders.seriesId, schema.documentSeries.id))
        .where(inArray(schema.salesOrders.quoteId, quoteIds))
    : [];
  const baseIds = [...quoteIds, ...orders.map((o: any) => o.id)];

  const invoiceIds = baseIds.length
    ? (
        await db
          .selectDistinct({ id: schema.salesInvoiceLines.invoiceId })
          .from(schema.salesInvoiceLines)
          .where(inArray(schema.salesInvoiceLines.baseId, baseIds))
      ).map((r: any) => r.id)
    : [];
  const invoices = invoiceIds.length
    ? await db
        .select({
          id: schema.salesInvoices.id,
          docNum: schema.salesInvoices.docNum,
          prefix: schema.documentSeries.prefix,
          date: schema.salesInvoices.date,
          status: schema.salesInvoices.status,
          total: schema.salesInvoices.total,
        })
        .from(schema.salesInvoices)
        .leftJoin(
          schema.documentSeries,
          eq(schema.salesInvoices.seriesId, schema.documentSeries.id),
        )
        .where(inArray(schema.salesInvoices.id, invoiceIds))
    : [];

  const tag = (docType: string) => (d: any) => ({
    ...d,
    docType,
    code: seriesCode(d.prefix, d.docNum),
  });
  return [...quotes.map(tag('SQ')), ...orders.map(tag('SO')), ...invoices.map(tag('SINV'))];
}
