import { Router } from 'express';
import { eq, sql, and, gte, lte, desc, asc, lt } from 'drizzle-orm';
import * as schema from '../db/schema';

const router = Router();

/**
 * Caché in-memory por tenant+scope. TTL bajo (10s) para que el dashboard no
 * tire queries pesadas si múltiples clientes lo consultan o si los eventos
 * realtime dispararan refetch de muchos widgets. Se invalida explícitamente
 * vía `invalidateDashboardCache(tenantId)` desde los endpoints que mutan
 * datos relevantes.
 */
interface CacheEntry {
  data: any;
  expires: number;
}
const cache = new Map<string, CacheEntry>();
const TTL_MS = 10_000;

function cacheKey(tenantId: string, scope: string) {
  return `${tenantId}:${scope}`;
}

export function invalidateDashboardCache(tenantId?: string) {
  if (!tenantId) {
    cache.clear();
    return;
  }
  for (const k of cache.keys()) if (k.startsWith(`${tenantId}:`)) cache.delete(k);
}

router.get('/summary', async (req: any, res) => {
  try {
    const db = req.tenantClient;
    // Filtro opcional: ?period=active (default) | all | <periodId>
    const scope = (req.query.period as string) || 'active';
    const tenantId = req.tenantId || '';

    // Caché — solo aplica si el cliente no pide skipCache
    if (tenantId && !req.query.noCache) {
      const hit = cache.get(cacheKey(tenantId, scope));
      if (hit && hit.expires > Date.now()) {
        return res.json(hit.data);
      }
    }

    // 1. Periodo de referencia. Por defecto: período abierto más reciente.
    //    Con ?period=all → no filtra por período (globales).
    //    Con ?period=<uuid> → fija ese período.
    const periodFilterActive = scope !== 'all';
    let period: any = null;
    if (scope && scope !== 'active' && scope !== 'all') {
      const [p] = await db
        .select()
        .from(schema.accountingPeriods)
        .where(eq(schema.accountingPeriods.id, scope));
      period = p;
    }
    if (!period && periodFilterActive) {
      const [activePeriod] = await db
        .select()
        .from(schema.accountingPeriods)
        .where(eq(schema.accountingPeriods.status, 'O'))
        .orderBy(desc(schema.accountingPeriods.startDate))
        .limit(1);
      period = activePeriod;
      if (!period) {
        const [latest] = await db
          .select()
          .from(schema.accountingPeriods)
          .orderBy(desc(schema.accountingPeriods.startDate))
          .limit(1);
        period = latest;
      }
    }

    if (!period && periodFilterActive) {
      return res.json({
        period: null,
        sales: { total: 0, count: 0, prevTotal: 0, prevCount: 0 },
        purchases: { total: 0, count: 0, prevTotal: 0, prevCount: 0 },
        stockAlerts: { lowStock: [], expiringBatches: [] },
        recentDocs: [],
        topPartners: { customers: [], suppliers: [] },
        receivables: { open: 0, openCount: 0 },
        payables: { open: 0, openCount: 0 },
        salesOrders: { total: 0, count: 0 },
        purchaseOrders: { total: 0, count: 0 },
        salesDeliveryNotes: { total: 0, count: 0 },
        purchaseDeliveryNotes: { total: 0, count: 0 },
        topItems: [],
        activityFeed: [],
      });
    }

    // 2. Periodo anterior (para comparativa). Solo aplica si filtramos por periodo.
    const prevPeriodRows = period
      ? await db
          .select()
          .from(schema.accountingPeriods)
          .where(lt(schema.accountingPeriods.startDate, period.startDate))
          .orderBy(desc(schema.accountingPeriods.startDate))
          .limit(1)
      : [];
    const prevPeriod = prevPeriodRows[0];

    // 3. Totales por tipo de documento (actual + anterior)
    const aggDocs = async (table: any, periodId?: string) => {
      const q = db
        .select({
          total: sql<string>`COALESCE(SUM(${table.total}), 0)`,
          count: sql<string>`COUNT(*)`,
        })
        .from(table);
      const [row] = await (periodId ? q.where(eq(table.periodId, periodId)) : q);
      return { total: Number(row?.total || 0), count: Number(row?.count || 0) };
    };

    const pid = period?.id;
    const sales = await aggDocs(schema.salesInvoices, pid);
    const purchases = await aggDocs(schema.purchaseInvoices, pid);
    const salesOrders = await aggDocs(schema.salesOrders, pid);
    const purchaseOrders = await aggDocs(schema.purchaseOrders, pid);
    const salesDeliveryNotes = await aggDocs(schema.salesDeliveryNotes, pid);
    const purchaseDeliveryNotes = await aggDocs(schema.purchaseDeliveryNotes, pid);
    const prevSales = prevPeriod
      ? await aggDocs(schema.salesInvoices, prevPeriod.id)
      : { total: 0, count: 0 };
    const prevPurchases = prevPeriod
      ? await aggDocs(schema.purchaseInvoices, prevPeriod.id)
      : { total: 0, count: 0 };

    // 4. Cobros / pagos pendientes (status 'O' open en facturas)
    const aggOpen = async (table: any) => {
      const [row] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${table.total}), 0)`,
          count: sql<string>`COUNT(*)`,
        })
        .from(table)
        .where(eq(table.status, 'O'));
      return { open: Number(row?.total || 0), openCount: Number(row?.count || 0) };
    };

    const receivables = await aggOpen(schema.salesInvoices);
    const payables = await aggOpen(schema.purchaseInvoices);

    // 5. Stock crítico
    const lowStock = await db
      .select({
        id: schema.items.id,
        code: schema.items.code,
        name: schema.items.name,
        stock: schema.items.stock,
        minStock: schema.items.minStock,
      })
      .from(schema.items)
      .where(
        and(
          sql`${schema.items.minStock} > 0`,
          sql`${schema.items.stock} < ${schema.items.minStock}`,
        ),
      )
      .orderBy(asc(schema.items.stock))
      .limit(10);

    // 6. Lotes próximos a caducar (próximos 30 días)
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 30);

    const expiringBatches = await db
      .select({
        id: schema.itemBatches.id,
        batchNum: schema.itemBatches.batchNum,
        itemName: schema.items.name,
        expiryDate: schema.itemBatches.expiryDate,
        quantity: schema.itemBatches.quantity,
      })
      .from(schema.itemBatches)
      .leftJoin(schema.items, eq(schema.itemBatches.itemId, schema.items.id))
      .where(
        and(
          sql`${schema.itemBatches.expiryDate} IS NOT NULL`,
          lte(schema.itemBatches.expiryDate, horizon),
          gte(schema.itemBatches.expiryDate, new Date()),
        ),
      )
      .orderBy(asc(schema.itemBatches.expiryDate))
      .limit(10);

    // 7. Documentos recientes (mezclando 4 tipos)
    const fetchRecent = async (table: any, type: string, route: string) => {
      const rows = await db
        .select({
          id: table.id,
          docNum: table.docNum,
          date: table.date,
          total: table.total,
          partnerId: table.partnerId,
          prefix: schema.documentSeries.prefix,
          periodCode: schema.accountingPeriods.code,
          partnerName: schema.businessPartners.name,
          createdAt: table.createdAt,
        })
        .from(table)
        .leftJoin(schema.documentSeries, eq(table.seriesId, schema.documentSeries.id))
        .leftJoin(schema.accountingPeriods, eq(table.periodId, schema.accountingPeriods.id))
        .leftJoin(schema.businessPartners, eq(table.partnerId, schema.businessPartners.id))
        .orderBy(desc(table.createdAt))
        .limit(5);
      return rows.map((r: any) => ({
        type,
        route,
        id: r.id,
        code: `${r.prefix || ''}-${r.periodCode || ''}-${String(r.docNum).padStart(6, '0')}`,
        date: r.date,
        total: Number(r.total),
        partnerName: r.partnerName || '',
        createdAt: r.createdAt,
      }));
    };

    const [recSI, recPI, recSDN, recPDN] = await Promise.all([
      fetchRecent(schema.salesInvoices, 'salesInvoice', '/sales/invoices'),
      fetchRecent(schema.purchaseInvoices, 'purchaseInvoice', '/purchases/invoices'),
      fetchRecent(schema.salesDeliveryNotes, 'salesDeliveryNote', '/sales/delivery-notes'),
      fetchRecent(
        schema.purchaseDeliveryNotes,
        'purchaseDeliveryNote',
        '/purchases/delivery-notes',
      ),
    ]);

    const recentDocs = [...recSI, ...recPI, ...recSDN, ...recPDN]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    // 8. Top partners (clientes / proveedores) del periodo
    const topPartners = async (table: any) => {
      const q = db
        .select({
          id: schema.businessPartners.id,
          name: schema.businessPartners.name,
          total: sql<string>`COALESCE(SUM(${table.total}), 0)`,
        })
        .from(table)
        .leftJoin(schema.businessPartners, eq(table.partnerId, schema.businessPartners.id));
      const rows = await (period?.id ? q.where(eq(table.periodId, period.id)) : q)
        .groupBy(schema.businessPartners.id, schema.businessPartners.name)
        .orderBy(sql`COALESCE(SUM(${table.total}), 0) DESC`)
        .limit(5);
      return rows
        .filter((r: any) => r.id)
        .map((r: any) => ({ id: r.id, name: r.name, total: Number(r.total) }));
    };

    const customers = await topPartners(schema.salesInvoices);
    const suppliers = await topPartners(schema.purchaseInvoices);

    // 8b. Top artículos del período (por facturación de venta).
    const topItems = await (async () => {
      const rows = await db
        .select({
          id: schema.items.id,
          code: schema.items.code,
          name: schema.items.name,
          qty: sql<string>`COALESCE(SUM(${schema.salesInvoiceLines.quantity}), 0)`,
          total: sql<string>`COALESCE(SUM(${schema.salesInvoiceLines.lineTotal}), 0)`,
        })
        .from(schema.salesInvoiceLines)
        .leftJoin(
          schema.salesInvoices,
          eq(schema.salesInvoiceLines.invoiceId, schema.salesInvoices.id),
        )
        .leftJoin(schema.items, eq(schema.salesInvoiceLines.itemId, schema.items.id))
        .where(pid ? eq(schema.salesInvoices.periodId, pid) : sql`TRUE`)
        .groupBy(schema.items.id, schema.items.code, schema.items.name)
        .orderBy(sql`COALESCE(SUM(${schema.salesInvoiceLines.lineTotal}), 0) DESC`)
        .limit(5);
      return rows
        .filter((r: any) => r.id)
        .map((r: any) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          qty: Number(r.qty),
          total: Number(r.total),
        }));
    })();

    // 8c. Activity feed — últimos 20 eventos mezclados (docs creados + pagos).
    const activityFeed = await (async () => {
      const items: Array<{
        type: string;
        createdAt: string;
        label: string;
        amount?: number;
        link?: string;
      }> = [];
      const push = (type: string, createdAt: any, label: string, amount?: number, link?: string) =>
        items.push({ type, createdAt, label, amount, link });
      const grabDocs = async (
        table: any,
        type: string,
        link: string,
        partnerLabel: (p: string) => string,
      ) => {
        const rows = await db
          .select({
            id: table.id,
            docNum: table.docNum,
            total: table.total,
            createdAt: table.createdAt,
            partnerName: schema.businessPartners.name,
            prefix: schema.documentSeries.prefix,
            periodCode: schema.accountingPeriods.code,
          })
          .from(table)
          .leftJoin(schema.businessPartners, eq(table.partnerId, schema.businessPartners.id))
          .leftJoin(schema.documentSeries, eq(table.seriesId, schema.documentSeries.id))
          .leftJoin(schema.accountingPeriods, eq(table.periodId, schema.accountingPeriods.id))
          .orderBy(desc(table.createdAt))
          .limit(8);
        for (const r of rows as any[]) {
          const code = `${r.prefix || ''}-${r.periodCode || ''}-${String(r.docNum).padStart(6, '0')}`;
          push(
            type,
            r.createdAt,
            `${partnerLabel(r.partnerName || '')} · ${code}`,
            Number(r.total),
            `${link}/${r.id}`,
          );
        }
      };
      await Promise.all([
        grabDocs(
          schema.salesInvoices,
          'salesInvoice',
          '/sales/invoices',
          (p) => `Factura venta a ${p || '—'}`,
        ),
        grabDocs(
          schema.purchaseInvoices,
          'purchaseInvoice',
          '/purchases/invoices',
          (p) => `Factura compra de ${p || '—'}`,
        ),
        grabDocs(
          schema.salesOrders,
          'salesOrder',
          '/sales-orders',
          (p) => `Pedido venta de ${p || '—'}`,
        ),
        grabDocs(
          schema.purchaseOrders,
          'purchaseOrder',
          '/purchase-orders',
          (p) => `Pedido compra a ${p || '—'}`,
        ),
        grabDocs(
          schema.salesDeliveryNotes,
          'salesDeliveryNote',
          '/sales/delivery-notes',
          (p) => `Albarán venta a ${p || '—'}`,
        ),
        grabDocs(
          schema.purchaseDeliveryNotes,
          'purchaseDeliveryNote',
          '/purchases/delivery-notes',
          (p) => `Albarán compra de ${p || '—'}`,
        ),
      ]);

      // Pagos recientes
      const pays = await db
        .select({
          id: schema.payments.id,
          amount: schema.payments.amount,
          createdAt: schema.payments.createdAt,
          salesInvoiceId: schema.payments.salesInvoiceId,
          purchaseInvoiceId: schema.payments.purchaseInvoiceId,
        })
        .from(schema.payments)
        .orderBy(desc(schema.payments.createdAt))
        .limit(8);
      for (const p of pays as any[]) {
        const kind = p.salesInvoiceId ? 'Cobro' : 'Pago';
        push('payment', p.createdAt, kind, Number(p.amount));
      }

      return items
        .filter((i) => i.createdAt)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 20);
    })();

    // 9. Tendencia mensual de ventas y compras (últimos 12 meses)
    const monthlyTrend = await (async () => {
      const sales12 = await db.execute(sql`
        SELECT
          to_char(date_trunc('month', "date"), 'YYYY-MM') AS month,
          COALESCE(SUM("total"), 0)::float AS total
        FROM ${schema.salesInvoices}
        WHERE "date" >= date_trunc('month', CURRENT_DATE) - interval '11 months'
        GROUP BY 1
        ORDER BY 1
      `);
      const purchases12 = await db.execute(sql`
        SELECT
          to_char(date_trunc('month', "date"), 'YYYY-MM') AS month,
          COALESCE(SUM("total"), 0)::float AS total
        FROM ${schema.purchaseInvoices}
        WHERE "date" >= date_trunc('month', CURRENT_DATE) - interval '11 months'
        GROUP BY 1
        ORDER BY 1
      `);

      // Construir 12 meses contiguos rellenando con 0
      const now = new Date();
      const months: { month: string; sales: number; purchases: number }[] = [];
      const salesMap = new Map<string, number>(
        (sales12.rows || []).map((r: any) => [r.month, Number(r.total)]),
      );
      const purchasesMap = new Map<string, number>(
        (purchases12.rows || []).map((r: any) => [r.month, Number(r.total)]),
      );
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        months.push({
          month: key,
          sales: salesMap.get(key) || 0,
          purchases: purchasesMap.get(key) || 0,
        });
      }
      return months;
    })();

    // 10. Distribución de facturas por estado (ventas + compras combinadas)
    const invoiceStatus = await (async () => {
      const aggByStatus = async (table: any) => {
        const rows = await db
          .select({
            status: table.status,
            count: sql<string>`COUNT(*)`,
          })
          .from(table)
          .groupBy(table.status);
        return rows;
      };
      const salesByStatus = await aggByStatus(schema.salesInvoices);
      const purchasesByStatus = await aggByStatus(schema.purchaseInvoices);
      const merged: Record<string, number> = {};
      for (const r of [...salesByStatus, ...purchasesByStatus]) {
        const key = (r as any).status || 'unknown';
        merged[key] = (merged[key] || 0) + Number((r as any).count);
      }
      const STATUS_LABELS: Record<string, string> = {
        O: 'Abiertas',
        C: 'Cerradas',
        P: 'Parcial',
        X: 'Anuladas',
      };
      return Object.entries(merged).map(([status, count]) => ({
        status,
        label: STATUS_LABELS[status] || status,
        count,
      }));
    })();

    const payload = {
      period: period
        ? {
            id: period.id,
            code: period.code,
            name: period.name,
            startDate: period.startDate,
            endDate: period.endDate,
          }
        : null,
      periodFilter: periodFilterActive,
      sales: { ...sales, prevTotal: prevSales.total, prevCount: prevSales.count },
      purchases: { ...purchases, prevTotal: prevPurchases.total, prevCount: prevPurchases.count },
      salesOrders,
      purchaseOrders,
      salesDeliveryNotes,
      purchaseDeliveryNotes,
      stockAlerts: { lowStock, expiringBatches },
      recentDocs,
      topPartners: { customers, suppliers },
      topItems,
      activityFeed,
      receivables,
      payables,
      monthlyTrend,
      invoiceStatus,
    };

    if (tenantId) {
      cache.set(cacheKey(tenantId, scope), { data: payload, expires: Date.now() + TTL_MS });
    }
    res.json(payload);
  } catch (error: any) {
    console.error('[Dashboard] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
