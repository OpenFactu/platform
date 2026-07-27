import { coreApi } from '@/shared/api';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Slot } from '@/components/Slot';
import { DashboardPluginWidgets } from '@/components/plugins/DashboardPluginWidgets';
import { UserDashboardWidgets } from '@/components/dashboard/UserDashboardWidgets';
import {
  Card,
  Badge,
  PageHeader,
  SkeletonPage,
  SegmentedControl,
  EmptyState as UiEmptyState,
} from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import {
  TrendingUp,
  TrendingDown,
  Package,
  AlertTriangle,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  ShoppingCart,
  ChevronRight,
  CalendarDays,
  Truck,
  FileText,
  PackageCheck,
  Inbox,
} from 'lucide-react';
import { Chart } from '@openfactu/ui/charts';

interface DashboardSummary {
  period: { id: string; code: string; name: string; startDate: string; endDate: string } | null;
  periodFilter: boolean;
  sales: { total: number; count: number; prevTotal: number; prevCount: number };
  purchases: { total: number; count: number; prevTotal: number; prevCount: number };
  salesOrders: { total: number; count: number };
  purchaseOrders: { total: number; count: number };
  salesDeliveryNotes: { total: number; count: number };
  purchaseDeliveryNotes: { total: number; count: number };
  receivables: { open: number; openCount: number };
  payables: { open: number; openCount: number };
  stockAlerts: {
    lowStock: { id: string; code: string; name: string; stock: number; minStock: number }[];
    expiringBatches: {
      id: string;
      batchNum: string;
      itemName: string;
      expiryDate: string;
      quantity: number;
    }[];
  };
  recentDocs: {
    type: string;
    route: string;
    id: string;
    code: string;
    date: string;
    total: number;
    partnerName: string;
    createdAt: string;
  }[];
  topPartners: {
    customers: { id: string; name: string; total: number }[];
    suppliers: { id: string; name: string; total: number }[];
  };
  topItems: { id: string; code: string; name: string; qty: number; total: number }[];
  activityFeed: {
    type: string;
    createdAt: string;
    label: string;
    amount?: number;
    link?: string;
  }[];
  monthlyTrend: { month: string; sales: number; purchases: number }[];
  invoiceStatus: { status: string; label: string; count: number }[];
}

const computeDelta = (current: number, previous: number) => {
  if (!previous) return null;
  const pct = ((current - previous) / previous) * 100;
  return Math.round(pct * 10) / 10;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  salesInvoice: 'Factura venta',
  purchaseInvoice: 'Factura compra',
  salesDeliveryNote: 'Albarán venta',
  purchaseDeliveryNote: 'Albarán compra',
};
const DOC_TYPE_ICONS: Record<string, any> = {
  salesInvoice: FileText,
  purchaseInvoice: FileText,
  salesDeliveryNote: Truck,
  purchaseDeliveryNote: Truck,
};

const SCOPE_OPTIONS: { value: 'active' | 'all'; label: string }[] = [
  { value: 'active', label: 'Periodo activo' },
  { value: 'all', label: 'Histórico' },
];

export const Dashboard: React.FC = () => {
  const { token, user } = useAuth();
  const fmt = useFormat();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Filtro de período (con toggle on/off): 'active' = período abierto | 'all' = global.
  const [scope, setScope] = useState<'active' | 'all'>('active');
  const [liveEvents, setLiveEvents] = useState(0);
  // IDs (createdAt strings) de elementos del feed que llegaron en esta sesión;
  // se usan para animarlos de entrada y destacarlos brevemente.
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevFeedRef = useRef<Set<string>>(new Set());

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!user?.tenantId) return;
      if (!opts?.silent) setLoading(true);
      try {
        const res = await coreApi.raw('GET', `/api/dashboard/summary?period=${scope}`);
        if (!res.ok) throw new Error('http');
        const json = res.data;
        // Respuesta defensiva: si el server devolvió un payload parcial
        // (reinicio en caliente, error a medias), mejor mostrar el estado de
        // error que reventar el render con un undefined.
        if (!json || typeof json !== 'object' || !json.sales || !json.receivables) {
          throw new Error('payload');
        }
        setData({
          ...json,
          monthlyTrend: Array.isArray(json.monthlyTrend) ? json.monthlyTrend : [],
          invoiceStatus: Array.isArray(json.invoiceStatus) ? json.invoiceStatus : [],
          recentDocs: Array.isArray(json.recentDocs) ? json.recentDocs : [],
          activityFeed: Array.isArray(json.activityFeed) ? json.activityFeed : [],
          topItems: Array.isArray(json.topItems) ? json.topItems : [],
          topPartners: {
            customers: json.topPartners?.customers ?? [],
            suppliers: json.topPartners?.suppliers ?? [],
          },
          stockAlerts: {
            lowStock: json.stockAlerts?.lowStock ?? [],
            expiringBatches: json.stockAlerts?.expiringBatches ?? [],
          },
        });
        setError(null);
      } catch {
        setError('No se pudo cargar el resumen');
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [user?.tenantId, token, scope],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Detectar entradas nuevas en activityFeed (comparando con la tanda anterior).
  useEffect(() => {
    if (!data?.activityFeed) return;
    const current = new Set(data.activityFeed.map((f) => `${f.type}|${f.createdAt}`));
    const prev = prevFeedRef.current;
    if (prev.size > 0) {
      const nuevos = new Set<string>();
      for (const k of current) if (!prev.has(k)) nuevos.add(k);
      if (nuevos.size > 0) {
        setFreshIds((existing) => new Set([...existing, ...nuevos]));
        // Quitar la marca "fresh" tras 6s para que el pulse pare.
        setTimeout(() => {
          setFreshIds((existing) => {
            const next = new Set(existing);
            for (const k of nuevos) next.delete(k);
            return next;
          });
        }, 6000);
      }
    }
    prevFeedRef.current = current;
  }, [data?.activityFeed]);

  // Refetch silencioso con debounce al llegar eventos realtime.
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      load({ silent: true });
    }, 500);
  }, [load]);

  // Los eventos realtime solo refrescan el dashboard y el contador en vivo.
  // Las notificaciones visibles al usuario las gestiona la campana (bell),
  // que las lee de la tabla `Notification` (server-side).
  const handleEvent = useCallback(() => {
    setLiveEvents((n) => n + 1);
    scheduleRefetch();
  }, [scheduleRefetch]);

  useRealtimeEvents({
    'salesInvoice.created': handleEvent,
    'purchaseInvoice.created': handleEvent,
    'salesOrder.created': handleEvent,
    'purchaseOrder.created': handleEvent,
    'salesDeliveryNote.created': handleEvent,
    'purchaseDeliveryNote.created': handleEvent,
    'payment.created': handleEvent,
    'journalEntry.posted': handleEvent,
  });

  const monthlyData = useMemo(() => {
    if (!data?.monthlyTrend) return [];
    return data.monthlyTrend.map((m) => {
      const [y, mo] = m.month.split('-');
      const d = new Date(Number(y), Number(mo) - 1, 1);
      return {
        month: d.toLocaleDateString('es-ES', { month: 'short' }),
        Ventas: m.sales,
        Compras: m.purchases,
      };
    });
  }, [data]);

  // DashboardSkeleton está deprecado (se va en la v0.5) y además traía su propio
  // `p-8 max-w-7xl mx-auto`, que no es el contenedor de esta página. SkeletonPage
  // se ajusta al layout real: cabecera, las 8 tarjetas KPI de las dos filas y los
  // bloques de contenido.
  if (loading)
    return (
      <div className="p-4 w-full space-y-6">
        <SkeletonPage header kpis={8} columns={12} blocks={4} />
      </div>
    );

  if (error || !data) {
    return <div className="p-12 text-center text-fg-muted">{error || 'Sin datos disponibles'}</div>;
  }

  const salesDelta = computeDelta(data.sales.total, data.sales.prevTotal);
  const purchasesDelta = computeDelta(data.purchases.total, data.purchases.prevTotal);

  const periodLabel = data.period
    ? `${data.period.name} · ${fmt.date(data.period.startDate)} – ${fmt.date(data.period.endDate)}`
    : 'Sin periodo activo';

  const topCustomersBars = data.topPartners.customers.map((c) => ({
    name: c.name.length > 18 ? c.name.slice(0, 16) + '…' : c.name,
    total: c.total,
  }));
  const topSuppliersBars = data.topPartners.suppliers.map((s) => ({
    name: s.name.length > 18 ? s.name.slice(0, 16) + '…' : s.name,
    total: s.total,
  }));

  return (
    <div className="p-4 w-full space-y-6 duration-500">
      <PageHeader
        title="Business Overview"
        subtitle={
          <span className="flex items-center gap-2">
            <CalendarDays size={14} className="text-fg-subtle" />
            {periodLabel}
          </span>
        }
        size="md"
        actions={
          <div className="flex items-center gap-2">
            {/* Toggle filtro de período: es un filtro de lo que se está viendo, no
                un cambio de vista, así que va con SegmentedControl (grupo de radio). */}
            <SegmentedControl
              options={SCOPE_OPTIONS}
              value={scope}
              // SegmentedControl emite string; el estado es la unión 'all' | 'active'.
              onChange={(v) => setScope(v as 'all' | 'active')}
              size="sm"
              uppercase
              aria-label="Ámbito del periodo"
            />
            <Badge
              variant="success"
              className="px-2.5 py-1 text-[10px] font-black uppercase flex items-center gap-1.5"
              title={liveEvents > 0 ? `${liveEvents} eventos recibidos` : 'Canal en vivo activo'}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden sm:inline">En vivo</span>
              {liveEvents > 0 && <span className="opacity-70">{liveEvents}</span>}
            </Badge>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Ventas del periodo"
          value={fmt.money(data.sales.total)}
          subtitle={`${data.sales.count} facturas`}
          delta={salesDelta}
          icon={TrendingUp}
          color="text-emerald-600 dark:text-emerald-300"
          bg="bg-emerald-50 dark:bg-emerald-500/10"
        />
        <KpiCard
          label="Compras del periodo"
          value={fmt.money(data.purchases.total)}
          subtitle={`${data.purchases.count} facturas`}
          delta={purchasesDelta}
          icon={TrendingDown}
          color="text-blue-600 dark:text-blue-300"
          bg="bg-blue-50 dark:bg-blue-500/10"
        />
        <KpiCard
          label="Cobros pendientes"
          value={fmt.money(data.receivables.open)}
          subtitle={`${data.receivables.openCount} facturas abiertas`}
          icon={ArrowDownLeft}
          color="text-indigo-600 dark:text-indigo-300"
          bg="bg-indigo-50 dark:bg-indigo-500/10"
        />
        <KpiCard
          label="Pagos pendientes"
          value={fmt.money(data.payables.open)}
          subtitle={`${data.payables.openCount} facturas abiertas`}
          icon={ArrowUpRight}
          color="text-rose-600 dark:text-rose-300"
          bg="bg-rose-50 dark:bg-rose-500/10"
        />
      </div>

      {/* KPIs secundarios: pedidos y albaranes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Pedidos venta"
          value={fmt.money(data.salesOrders.total)}
          subtitle={`${data.salesOrders.count}`}
          icon={ShoppingCart}
          color="text-emerald-600 dark:text-emerald-300"
          bg="bg-emerald-50 dark:bg-emerald-500/10"
        />
        <KpiCard
          label="Pedidos compra"
          value={fmt.money(data.purchaseOrders.total)}
          subtitle={`${data.purchaseOrders.count}`}
          icon={ShoppingCart}
          color="text-amber-600 dark:text-amber-300"
          bg="bg-amber-50 dark:bg-amber-500/10"
        />
        <KpiCard
          label="Albaranes venta"
          value={fmt.money(data.salesDeliveryNotes.total)}
          subtitle={`${data.salesDeliveryNotes.count}`}
          icon={PackageCheck}
          color="text-teal-600 dark:text-teal-300"
          bg="bg-teal-50 dark:bg-teal-500/10"
        />
        <KpiCard
          label="Albaranes compra"
          value={fmt.money(data.purchaseDeliveryNotes.total)}
          subtitle={`${data.purchaseDeliveryNotes.count}`}
          icon={Inbox}
          color="text-orange-600 dark:text-orange-300"
          bg="bg-orange-50 dark:bg-orange-500/10"
        />
      </div>

      {/* Línea: tendencia mensual + Donut: estado de facturas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card
          className="lg:col-span-2"
          title="Tendencia 12 meses"
          subtitle="Ventas vs compras facturadas."
        >
          <div className="h-72 -ml-2">
            {monthlyData.every((m) => m.Ventas === 0 && m.Compras === 0) ? (
              <EmptyState
                icon={TrendingUp}
                title="Sin datos"
                hint="Aún no hay facturas para mostrar."
              />
            ) : (
              <Chart
                type="line"
                data={monthlyData}
                xKey="month"
                series={[{ key: 'Ventas' }, { key: 'Compras' }]}
                height={288}
                valueFormat={(v) => fmt.money(v)}
                aria-label="Tendencia mensual de ventas y compras"
              />
            )}
          </div>
        </Card>

        <Card title="Estado de facturas" subtitle="Distribución global.">
          <div className="h-72">
            {data.invoiceStatus.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Sin facturas"
                hint="Todavía no hay facturas registradas."
              />
            ) : (
              <Chart
                type="donut"
                data={data.invoiceStatus}
                xKey="label"
                series={[{ key: 'count' }]}
                height={288}
                aria-label="Distribución de facturas por estado"
              />
            )}
          </div>
        </Card>
      </div>

      {/* Barras: top clientes y proveedores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Top clientes" subtitle="Mayor facturación del periodo.">
          <div className="h-64">
            {topCustomersBars.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                title="Sin clientes"
                hint="Aún no hay facturación de clientes."
              />
            ) : (
              <Chart
                type="bar"
                layout="vertical"
                data={topCustomersBars}
                xKey="name"
                series={[{ key: 'total' }]}
                height={288}
                valueFormat={(v) => fmt.money(v)}
                aria-label="Top clientes por facturación"
              />
            )}
          </div>
        </Card>

        <Card title="Top proveedores" subtitle="Mayor compra del periodo.">
          <div className="h-64">
            {topSuppliersBars.length === 0 ? (
              <EmptyState
                icon={Truck}
                title="Sin proveedores"
                hint="Aún no hay facturación de proveedores."
              />
            ) : (
              <Chart
                type="bar"
                layout="vertical"
                data={topSuppliersBars}
                xKey="name"
                series={[{ key: 'total' }]}
                height={288}
                valueFormat={(v) => fmt.money(v)}
                aria-label="Top proveedores por facturación"
              />
            )}
          </div>
        </Card>
      </div>

      {/* Documentos recientes + alertas de stock */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card
          className="lg:col-span-2"
          title="Documentos recientes"
          subtitle="Últimas facturas y albaranes registrados."
        >
          {data.recentDocs.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Sin documentos"
              hint="Crea una factura o un albarán para verlo aquí."
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {data.recentDocs.map((d) => {
                const Icon = DOC_TYPE_ICONS[d.type] || FileText;
                return (
                  <li key={`${d.type}-${d.id}`}>
                    <button
                      onClick={() => navigate(d.route)}
                      className="w-full flex items-center gap-4 py-3 hover:bg-accent/5 dark:hover:bg-accent/10 rounded-xs px-2 transition-colors text-left group/docrow"
                    >
                      <div className="p-2 rounded-xs bg-line-2 dark:bg-ink-700 text-ink-700 dark:text-slate-300 group-hover/docrow:bg-accent/20 group-hover/docrow:text-accent transition-colors">
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-fg-subtle font-bold uppercase tracking-wide">
                          {DOC_TYPE_LABELS[d.type] || d.type}
                        </p>
                        <p className="text-sm font-bold text-fg-default truncate">{d.code}</p>
                        <p className="text-xs text-fg-muted truncate">{d.partnerName || '—'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-fg-default">{fmt.money(d.total)}</p>
                        <p className="text-[11px] text-fg-subtle">{fmt.date(d.date)}</p>
                      </div>
                      <ChevronRight size={14} className="text-fg-subtle" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Stock crítico" subtitle="Artículos por debajo del mínimo.">
            {data.stockAlerts.lowStock.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Sin alertas"
                hint="Todos los stocks están en orden."
              />
            ) : (
              <ul className="space-y-2">
                {data.stockAlerts.lowStock.map((it) => (
                  <li key={it.id} className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <p className="font-bold text-fg-default truncate">{it.name}</p>
                      <p className="text-[11px] text-fg-subtle">{it.code}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-rose-600 dark:text-rose-300">
                        {Number(it.stock).toFixed(2)}
                      </p>
                      <p className="text-[11px] text-fg-subtle">
                        min {Number(it.minStock).toFixed(2)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Lotes próximos a caducar" subtitle="Próximos 30 días.">
            {data.stockAlerts.expiringBatches.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title="Sin caducidades"
                hint="Ningún lote a punto de caducar."
              />
            ) : (
              <ul className="space-y-2">
                {data.stockAlerts.expiringBatches.map((b) => (
                  <li key={b.id} className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <p className="font-bold text-fg-default truncate">{b.itemName}</p>
                      <p className="text-[11px] text-fg-subtle">Lote {b.batchNum}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-amber-600 dark:text-amber-300">
                        {fmt.date(b.expiryDate)}
                      </p>
                      <p className="text-[11px] text-fg-subtle">
                        {Number(b.quantity).toFixed(2)} ud
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Top artículos + Feed actividad en vivo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Top artículos" subtitle="Más vendidos del periodo." className="lg:col-span-1">
          {!data.topItems || data.topItems.length === 0 ? (
            <EmptyState icon={Package} title="Sin ventas" hint="Aún no hay líneas facturadas." />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {data.topItems.map((it) => (
                <li key={it.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-fg-default text-sm truncate">{it.name}</p>
                    <p className="text-[11px] font-mono text-fg-subtle">
                      {it.code} · {it.qty} uds
                    </p>
                  </div>
                  <span className="font-black tabular-nums text-emerald-600 dark:text-emerald-400 text-sm">
                    {fmt.money(it.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Actividad en vivo"
          subtitle="Eventos recientes. Se actualiza en tiempo real."
          className="lg:col-span-2"
        >
          {!data.activityFeed || data.activityFeed.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Sin actividad"
              hint="Los movimientos aparecerán aquí."
            />
          ) : (
            <ul className="divide-y divide-border-subtle max-h-96 overflow-y-auto overflow-x-hidden scrollbar-hide">
              {data.activityFeed.map((ev, i) => {
                const id = `${ev.type}|${ev.createdAt}`;
                const isFresh = freshIds.has(id);
                return (
                  <li
                    key={`${id}-${i}`}
                    className={`relative py-2 flex items-center gap-3 min-w-0 hover:bg-bg-hover px-2 -mx-2 rounded-md cursor-pointer transition-colors ${
                      isFresh
                        ? 'bg-blue-50 dark:bg-blue-500/10 animate-in slide-in-from-top-2 fade-in duration-500'
                        : ''
                    }`}
                    onClick={() => ev.link && navigate(ev.link)}
                  >
                    <div
                      className={`flex-shrink-0 w-2 h-2 rounded-full ${
                        isFresh ? 'bg-emerald-400 animate-pulse' : 'bg-blue-400'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-fg-body truncate">
                        {ev.label}
                        {isFresh && (
                          <span className="ml-2 text-[9px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded">
                            nuevo
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] font-mono text-fg-subtle">
                        {new Date(ev.createdAt).toLocaleString('es-ES', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    {ev.amount != null && (
                      <span className="flex-shrink-0 font-bold tabular-nums text-xs text-fg-body">
                        {fmt.money(ev.amount)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Widgets: creados desde código (plugins) o sin código (Ajustes → Widgets de dashboard) */}
      <UserDashboardWidgets />
      <DashboardPluginWidgets />

      <Slot name="dashboard:main:bottom" />
    </div>
  );
};

interface KpiCardProps {
  label: string;
  value: string;
  subtitle: string;
  delta?: number | null;
  icon: any;
  color: string;
  bg: string;
}

const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  subtitle,
  delta,
  icon: Icon,
  color,
  bg,
}) => {
  const deltaColor =
    delta == null
      ? 'text-fg-subtle'
      : delta >= 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-rose-600 dark:text-rose-400';
  const DeltaIcon = delta == null ? Clock : delta >= 0 ? ArrowUpRight : ArrowDownLeft;
  return (
    <Card className="relative group transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] sm:text-[10px] font-black uppercase text-fg-subtle tracking-wider leading-tight mb-1.5 line-clamp-1">
            {label}
          </p>
          <p className="text-lg sm:text-2xl font-black text-fg-default tracking-tight truncate tabular-nums">
            {value}
          </p>
          <p className="text-[10px] sm:text-[11px] text-fg-muted mt-0.5 truncate">{subtitle}</p>
          <p
            className={`text-[10px] sm:text-[11px] font-bold mt-1.5 flex items-center gap-1 truncate ${deltaColor}`}
            title={
              delta == null ? 'sin comparativa' : `${delta > 0 ? '+' : ''}${delta}% vs anterior`
            }
          >
            <DeltaIcon size={11} className="shrink-0" />
            <span className="truncate">
              {delta == null ? 'sin comparativa' : `${delta > 0 ? '+' : ''}${delta}%`}
            </span>
          </p>
        </div>
        <div
          className={`hidden sm:flex p-2.5 rounded-xs ${bg} ${color} shadow-inner items-center justify-center shrink-0`}
        >
          <Icon size={18} />
        </div>
      </div>
    </Card>
  );
};

// Adaptador sobre el EmptyState de @openfactu/ui: los ~10 llamantes de este
// archivo pasan el icono como componente (icon={Package}) y la librería lo
// espera ya como elemento. Así se quita el estado vacío pintado a mano sin
// tocar cada uso.
const EmptyState: React.FC<{ icon: any; title: string; hint: string }> = ({
  icon: Icon,
  title,
  hint,
}) => <UiEmptyState icon={<Icon size={18} />} title={title} hint={hint} className="h-full" />;
