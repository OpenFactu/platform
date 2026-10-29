import { eq, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';

/**
 * Catálogo curado de métricas disponibles para widgets de dashboard creados
 * sin código desde la UI. Deliberadamente NO se permite que el usuario escriba
 * SQL/filtros arbitrarios — solo puede elegir una de estas métricas ya
 * validadas, para evitar que un formulario "sin código" se convierta en una
 * vía de consulta arbitraria a la BD.
 */
export interface DashboardMetricDef {
  key: string;
  label: string;
  compute: (tenantDb: any) => Promise<number>;
}

const countAll = (table: any) => async (db: any) => {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return row?.n ?? 0;
};

const countWhereStatus = (table: any, status: string) => async (db: any) => {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(eq(table.status, status));
  return row?.n ?? 0;
};

export const DASHBOARD_METRICS: DashboardMetricDef[] = [
  { key: 'items.count', label: 'Total de artículos', compute: countAll(schema.items) },
  {
    key: 'partners.count',
    label: 'Total de clientes/proveedores',
    compute: countAll(schema.businessPartners),
  },
  {
    key: 'salesOrders.open',
    label: 'Pedidos de venta abiertos',
    compute: countWhereStatus(schema.salesOrders, 'O'),
  },
  {
    key: 'purchaseOrders.open',
    label: 'Pedidos de compra abiertos',
    compute: countWhereStatus(schema.purchaseOrders, 'O'),
  },
  {
    key: 'salesInvoices.draft',
    label: 'Facturas de venta en borrador',
    compute: countWhereStatus(schema.salesInvoices, 'D'),
  },
  {
    key: 'purchaseInvoices.draft',
    label: 'Facturas de compra en borrador',
    compute: countWhereStatus(schema.purchaseInvoices, 'D'),
  },
  {
    key: 'salesDeliveryNotes.count',
    label: 'Albaranes de venta totales',
    compute: countAll(schema.salesDeliveryNotes),
  },
  {
    key: 'purchaseDeliveryNotes.count',
    label: 'Albaranes de compra totales',
    compute: countAll(schema.purchaseDeliveryNotes),
  },
];

// ── CRM ───────────────────────────────────────────────────────────────────
const openOpportunities = (weighted: boolean) => async (db: any) => {
  const o = schema.opportunities;
  const s = schema.opportunityStages;
  const [row] = await db
    .select({
      v: weighted
        ? sql<string>`coalesce(sum(${o.amount} * ${s.probability} / 100.0), 0)`
        : sql<string>`coalesce(sum(${o.amount}), 0)`,
    })
    .from(o)
    .innerJoin(s, eq(o.stageId, s.id))
    .where(eq(s.kind, 'open'));
  return Math.round(Number(row?.v ?? 0) * 100) / 100;
};

DASHBOARD_METRICS.push(
  {
    key: 'crm.openPipeline',
    label: 'CRM · Importe abierto en el embudo',
    compute: openOpportunities(false),
  },
  {
    key: 'crm.weightedForecast',
    label: 'CRM · Previsión ponderada',
    compute: openOpportunities(true),
  },
  {
    key: 'crm.overdueActivities',
    label: 'CRM · Actividades vencidas',
    compute: async (db: any) => {
      const a = schema.crmActivities;
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(a)
        .where(sql`${a.doneAt} is null and ${a.dueAt} < now()`);
      return row?.n ?? 0;
    },
  },
);

export function getMetric(key: string): DashboardMetricDef | undefined {
  return DASHBOARD_METRICS.find((m) => m.key === key);
}
