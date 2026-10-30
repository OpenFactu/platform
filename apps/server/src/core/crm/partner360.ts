/**
 * Vista 360 de un cliente para el CRM: cifras de ventas y una línea de tiempo
 * que mezcla actividades, oportunidades y documentos.
 *
 * Cada bloque de documentos solo se incluye si quien pregunta puede ver ese
 * tipo de documento (`canRead(path)`): el CRM no puede ser una puerta trasera
 * a las facturas.
 */
import { and, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';

type CanRead = (path: string) => boolean;

const VALID_INVOICE = ['O', 'C'];

export interface PartnerSummary {
  revenue12m: number | null;
  pendingReceivable: number | null;
  lastPurchaseAt: string | null;
  openQuotes: { count: number; amount: number } | null;
  openOpportunities: { count: number; amount: number };
}

export async function partnerSummary(
  db: any,
  partnerId: string,
  canRead: CanRead,
): Promise<PartnerSummary> {
  const out: PartnerSummary = {
    revenue12m: null,
    pendingReceivable: null,
    lastPurchaseAt: null,
    openQuotes: null,
    openOpportunities: { count: 0, amount: 0 },
  };

  if (canRead('/sales/invoices')) {
    const since = new Date(Date.now() - 365 * 86_400_000);
    const inv = schema.salesInvoices;
    const [row] = await db
      .select({
        revenue: sql<string>`coalesce(sum(case when ${inv.date} >= ${since} then ${inv.subtotal} else 0 end), 0)`,
        pending: sql<string>`coalesce(sum(case when ${inv.paymentStatus} <> 'paid' then ${inv.total} - ${inv.amountPaid} else 0 end), 0)`,
        last: sql<Date | null>`max(${inv.date})`,
      })
      .from(inv)
      .where(and(eq(inv.partnerId, partnerId), inArray(inv.status, VALID_INVOICE)));
    out.revenue12m = Number(row?.revenue ?? 0);
    out.pendingReceivable = Number(row?.pending ?? 0);
    out.lastPurchaseAt = row?.last ? new Date(row.last).toISOString() : null;
  }

  if (canRead('/sales/quotes')) {
    const [row] = await db
      .select({
        n: sql<number>`count(*)::int`,
        amount: sql<string>`coalesce(sum(${schema.salesQuotes.total}), 0)`,
      })
      .from(schema.salesQuotes)
      .where(and(eq(schema.salesQuotes.partnerId, partnerId), eq(schema.salesQuotes.status, 'O')));
    out.openQuotes = { count: row?.n ?? 0, amount: Number(row?.amount ?? 0) };
  }

  const [opp] = await db
    .select({
      n: sql<number>`count(*)::int`,
      amount: sql<string>`coalesce(sum(${schema.opportunities.amount}), 0)`,
    })
    .from(schema.opportunities)
    .innerJoin(
      schema.opportunityStages,
      eq(schema.opportunities.stageId, schema.opportunityStages.id),
    )
    .where(
      and(eq(schema.opportunities.partnerId, partnerId), eq(schema.opportunityStages.kind, 'open')),
    );
  out.openOpportunities = { count: opp?.n ?? 0, amount: Number(opp?.amount ?? 0) };
  return out;
}

export type TimelineKind = 'activity' | 'opportunity' | 'SQ' | 'SO' | 'SINV';

export interface TimelineEntry {
  kind: TimelineKind;
  id: string;
  at: string;
  title: string;
  detail?: string | null;
  status?: string | null;
  amount?: number | null;
  /** Para actividades: tipo (call, meeting…) y si está hecha. */
  activityType?: string;
  done?: boolean;
}

/**
 * Línea de tiempo del cliente, más reciente primero. `before` pagina: devuelve
 * lo anterior a esa fecha. Cada fuente aporta como mucho `limit` entradas y se
 * recorta al final, así que la página siempre es coherente.
 */
export async function partnerTimeline(
  db: any,
  partnerId: string,
  canRead: CanRead,
  opts: { limit?: number; before?: Date } = {},
): Promise<TimelineEntry[]> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const before = opts.before ?? new Date(Date.now() + 365 * 86_400_000);
  const entries: TimelineEntry[] = [];

  const a = schema.crmActivities;
  const activities = await db
    .select()
    .from(a)
    .where(
      and(
        eq(a.partnerId, partnerId),
        sql`coalesce(${a.doneAt}, ${a.dueAt}, ${a.createdAt}) < ${before}`,
      ),
    )
    .orderBy(desc(sql`coalesce(${a.doneAt}, ${a.dueAt}, ${a.createdAt})`))
    .limit(limit);
  for (const r of activities) {
    entries.push({
      kind: 'activity',
      id: r.id,
      at: new Date(r.doneAt ?? r.dueAt ?? r.createdAt).toISOString(),
      title: r.subject,
      detail: r.body,
      activityType: r.type,
      done: !!r.doneAt,
    });
  }

  const o = schema.opportunities;
  const opps = await db
    .select({
      id: o.id,
      title: o.title,
      amount: o.amount,
      createdAt: o.createdAt,
      closedAt: o.closedAt,
      stageName: schema.opportunityStages.name,
      stageKind: schema.opportunityStages.kind,
    })
    .from(o)
    .innerJoin(schema.opportunityStages, eq(o.stageId, schema.opportunityStages.id))
    .where(
      and(eq(o.partnerId, partnerId), sql`coalesce(${o.closedAt}, ${o.createdAt}) < ${before}`),
    )
    .orderBy(desc(sql`coalesce(${o.closedAt}, ${o.createdAt})`))
    .limit(limit);
  for (const r of opps) {
    entries.push({
      kind: 'opportunity',
      id: r.id,
      at: new Date(r.closedAt ?? r.createdAt).toISOString(),
      title: r.title,
      status: r.stageName,
      detail: r.stageKind,
      amount: Number(r.amount),
    });
  }

  const docSources: Array<{ kind: TimelineKind; path: string; table: any }> = [
    { kind: 'SQ', path: '/sales/quotes', table: schema.salesQuotes },
    { kind: 'SO', path: '/sales-orders', table: schema.salesOrders },
    { kind: 'SINV', path: '/sales/invoices', table: schema.salesInvoices },
  ];
  for (const src of docSources) {
    if (!canRead(src.path)) continue;
    const t = src.table;
    const rows = await db
      .select({
        id: t.id,
        docNum: t.docNum,
        prefix: schema.documentSeries.prefix,
        date: t.date,
        status: t.status,
        total: t.total,
      })
      .from(t)
      .leftJoin(schema.documentSeries, eq(t.seriesId, schema.documentSeries.id))
      .where(and(eq(t.partnerId, partnerId), ne(t.status, 'X'), sql`${t.date} < ${before}`))
      .orderBy(desc(t.date))
      .limit(limit);
    for (const r of rows) {
      entries.push({
        kind: src.kind,
        id: r.id,
        at: new Date(r.date).toISOString(),
        title: `${r.prefix ?? ''}${r.docNum}`,
        status: r.status,
        amount: Number(r.total),
      });
    }
  }

  return entries.sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, limit);
}

/**
 * Clientes «dormidos»: compraban con regularidad (al menos `minInvoices`
 * facturas) y llevan más de `days` días sin hacerlo. Se ignoran los que no
 * compran desde hace más del triple: esos ya no son habituales.
 */
export async function findDormantPartners(
  db: any,
  days: number,
  minInvoices = 3,
): Promise<Array<{ partnerId: string; lastAt: Date; count: number }>> {
  const inv = schema.salesInvoices;
  const now = Date.now();
  const rows = await db
    .select({
      partnerId: inv.partnerId,
      lastAt: sql<Date>`max(${inv.date})`,
      count: sql<number>`count(*)::int`,
    })
    .from(inv)
    .where(
      and(inArray(inv.status, VALID_INVOICE), gte(inv.date, new Date(now - 3 * days * 86_400_000))),
    )
    .groupBy(inv.partnerId)
    .having(
      sql`count(*) >= ${minInvoices} and max(${inv.date}) < ${new Date(now - days * 86_400_000)}`,
    )
    .limit(50);
  return rows.map((r: any) => ({ ...r, lastAt: new Date(r.lastAt) }));
}
