/** Lo vencido de la empresa, agrupado por cliente, con el nivel de cada factura. */
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { hydrate } from '../documents/documentChain';
import { nextLevelOf, overdueOf, reachedLevel, toIsoDate, daysBetween } from './overdue';
import { getDunningSettings, type DunningLevel } from './settings';

const round2 = (n: number) => Math.round(n * 100) / 100;

export const todayIso = () => new Date().toISOString().slice(0, 10);

export interface OverdueInvoice {
  id: string;
  code: string;
  date: string;
  dueDate: string;
  total: number;
  overdue: number;
  days: number;
  /** Último nivel con el que se le reclamó. 0 si nunca. */
  sentLevel: number;
  reachedLevel: number;
  nextLevel: number | null;
}

export interface OverdueCustomer {
  partnerId: string;
  name: string;
  email: string | null;
  excluded: boolean;
  total: number;
  /** Lo que ya toca reclamar: ha llegado al menos al primer nivel. */
  claimable: number;
  oldestDays: number;
  /** Con qué nivel saldría la carta. 0 si aún no toca. */
  level: number;
  /** Hay alguna factura que subiría de nivel. */
  needsLetter: boolean;
  lastLetterAt: string | null;
  daysSinceLetter: number | null;
  invoices: OverdueInvoice[];
}

/** El nivel con el que va una factura en la carta: el siguiente o, si no hay, el que tenía. */
export const letterLevelOf = (invoice: OverdueInvoice) =>
  invoice.nextLevel ?? Math.max(invoice.sentLevel, 1);

export async function listOverdue(
  db: any,
  options: { partnerId?: string; today?: string; levels?: DunningLevel[] } = {},
): Promise<OverdueCustomer[]> {
  const today = options.today ?? todayIso();
  const levels = options.levels ?? (await getDunningSettings(db)).levels;
  const table = schema.salesInvoices;
  const partners = schema.businessPartners;

  const rows = await db
    .select({
      id: table.id,
      partnerId: table.partnerId,
      date: table.date,
      dueDate: table.dueDate,
      total: table.total,
      amountPaid: table.amountPaid,
      paymentDueLines: table.paymentDueLines,
      lockedAt: table.lockedAt,
      name: partners.name,
      email: partners.email,
      excluded: partners.dunningExcluded,
    })
    .from(table)
    .innerJoin(partners, eq(table.partnerId, partners.id))
    .where(
      and(
        eq(table.status, 'O'),
        isNull(table.rectifiesInvoiceId),
        ne(table.paymentStatus, 'paid'),
        options.partnerId ? eq(table.partnerId, options.partnerId) : undefined,
      ),
    );

  const overdueRows = rows
    .map((row: any) => ({ row, due: overdueOf(row, today) }))
    .filter((entry: any) => entry.due);
  if (overdueRows.length === 0) return [];

  const ids = overdueRows.map((entry: any) => entry.row.id);
  const line = schema.dunningLetterLines;
  const letter = schema.dunningLetters;
  const sentRows = await db
    .select({ invoiceId: line.invoiceId, level: sql<number>`MAX(${line.level})` })
    .from(line)
    .innerJoin(letter, eq(line.letterId, letter.id))
    .where(and(inArray(line.invoiceId, ids), eq(letter.status, 'sent')))
    .groupBy(line.invoiceId);
  const sentByInvoice = new Map<string, number>(
    sentRows.map((row: any) => [row.invoiceId, Number(row.level)]),
  );
  const lastRows = await db
    .select({ partnerId: letter.partnerId, at: sql<Date>`MAX(${letter.sentAt})` })
    .from(letter)
    .where(eq(letter.status, 'sent'))
    .groupBy(letter.partnerId);
  const lastByPartner = new Map<string, Date>(
    lastRows.map((row: any) => [row.partnerId, new Date(row.at)]),
  );
  const refs = await hydrate(db, 'SINV' as any, ids);
  const codeOf = new Map<string, string>(refs.map((ref: any) => [ref.id, ref.code]));

  const customers = new Map<string, OverdueCustomer>();
  for (const { row, due } of overdueRows) {
    let customer = customers.get(row.partnerId);
    if (!customer) {
      const last = lastByPartner.get(row.partnerId) ?? null;
      customer = {
        partnerId: row.partnerId,
        name: row.name,
        email: row.email ?? null,
        excluded: !!row.excluded,
        total: 0,
        claimable: 0,
        oldestDays: 0,
        level: 0,
        needsLetter: false,
        lastLetterAt: last ? last.toISOString() : null,
        daysSinceLetter: last ? daysBetween(toIsoDate(last), today) : null,
        invoices: [],
      };
      customers.set(row.partnerId, customer);
    }
    const sentLevel = sentByInvoice.get(row.id) ?? 0;
    const invoice: OverdueInvoice = {
      id: row.id,
      code: codeOf.get(row.id) ?? row.id,
      date: toIsoDate(row.date),
      dueDate: due.dueDate,
      total: Number(row.total),
      overdue: due.amount,
      days: due.days,
      sentLevel,
      reachedLevel: reachedLevel(due.days, levels),
      nextLevel: nextLevelOf(due.days, sentLevel, levels),
    };
    customer.invoices.push(invoice);
    customer.total = round2(customer.total + invoice.overdue);
    customer.oldestDays = Math.max(customer.oldestDays, invoice.days);
    if (invoice.reachedLevel >= 1) {
      customer.claimable = round2(customer.claimable + invoice.overdue);
      customer.level = Math.max(customer.level, letterLevelOf(invoice));
    }
    if (invoice.nextLevel !== null) customer.needsLetter = true;
  }

  const list = Array.from(customers.values());
  for (const customer of list) customer.invoices.sort((a, b) => b.days - a.days);
  return list.sort((a, b) => b.total - a.total);
}
