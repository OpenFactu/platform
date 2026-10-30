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
  CountUp,
  RollingNumber,
  SegmentedControl,
  EmptyState as UiEmptyState,
} from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { DashboardLoading } from '../components/DashboardLoading';
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
import { useI18n } from '@/i18n/I18nContext';
import { formatDateTime } from '@/i18n/format';
import { intlLocale, t as tNow } from '@/i18n/i18n';

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
  salesInvoice: 'app.docTypes.SINV',
  purchaseInvoice: 'app.docTypes.PINV',
  salesDeliveryNote: 'app.docTypes.SDN',
  purchaseDeliveryNote: 'app.docTypes.PDN',
};
const DOC_TYPE_ICONS: Record<string, any> = {
  salesInvoice: FileText,
  purchaseInvoice: FileText,
  salesDeliveryNote: Truck,
  purchaseDeliveryNote: Truck,
};

const SCOPE_OPTIONS: { value: 'active' | 'all'; label: string }[] = [
  { value: 'active', label: 'home.dashboard.scopeActive' },
  { value: 'all', label: 'home.dashboard.scopeAll' },
];

export const Dashboard: React.FC = () => {
  const { token, user } = useAuth();
  const fmt = useFormat();
  const navigate = useNavigate();
  const { t } = useI18n();
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
        setError(tNow('home.dashboard.loadError'));
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
        month: d.toLocaleDateString(intlLocale(), { month: 'short' }),
        Ventas: m.sales,
        Compras: m.purchases,
      };
    });
    // `t` cambia con el idioma: así se recalculan los nombres de los meses.
  }, [data, t]);

  // Esqueleto con la forma real de la página (cabecera, KPI, gráfico, listas).
  if (loading) return <DashboardLoading />;

  if (error || !data) {
    return (
      <div className="p-12 text-center text-fg-muted">
        {error || t('home.dashboard.noDataAvailable')}
      </div>
    );
  }

  const salesDelta = computeDelta(data.sales.total, data.sales.prevTotal);
  const purchasesDelta = computeDelta(data.purchases.total, data.purchases.prevTotal);

  const periodLabel = data.period
    ? `${data.period.name} · ${fmt.date(data.period.startDate)} – ${fmt.date(data.period.endDate)}`
    : t('home.dashboard.noActivePeriod');

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
        title={t('home.dashboard.title')}
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
              options={SCOPE_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
              value={scope}
              // SegmentedControl emite string; el estado es la unión 'all' | 'active'.
              onChange={(v) => setScope(v as 'all' | 'active')}
              size="sm"
              uppercase
              aria-label={t('home.dashboard.scopeAria')}
            />
            <Badge
              variant="success"
              className="px-2.5 py-1 text-[10px] font-black uppercase flex items-center gap-1.5"
              title={
                liveEvents > 0
                  ? t('home.dashboard.eventsReceived', { count: liveEvents })
                  : t('home.dashboard.liveActive')
              }
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden sm:inline">{t('home.dashboard.live')}</span>
              {liveEvents > 0 && <RollingNumber value={liveEvents} className="opacity-70" />}
            </Badge>
          </div>
        }
      />

      {/* KPIs */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up animate-duration-500 animate-fill-both"
        style={{ animationDelay: '80ms' }}
      >
        <KpiCard
          label={t('home.dashboard.kpiSales')}
          value={data.sales.total}
          subtitle={
            <>
              <CountUp value={data.sales.count} /> {t('home.dashboard.invoices')}
            </>
          }
          delta={salesDelta}
          icon={TrendingUp}
          color="text-emerald-600 dark:text-emerald-300"
          bg="bg-emerald-50 dark:bg-emerald-500/10"
        />
        <KpiCard
          label={t('home.dashboard.kpiPurchases')}
          value={data.purchases.total}
          subtitle={
            <>
              <CountUp value={data.purchases.count} /> {t('home.dashboard.invoices')}
            </>
          }
          delta={purchasesDelta}
          icon={TrendingDown}
          color="text-blue-600 dark:text-blue-300"
          bg="bg-blue-50 dark:bg-blue-500/10"
        />
        <KpiCard
          label={t('home.dashboard.kpiReceivables')}
          value={data.receivables.open}
          subtitle={
            <>
              <CountUp value={data.receivables.openCount} /> {t('home.dashboard.openInvoices')}
            </>
          }
          icon={ArrowDownLeft}
          color="text-indigo-600 dark:text-indigo-300"
          bg="bg-indigo-50 dark:bg-indigo-500/10"
        />
        <KpiCard
          label={t('home.dashboard.kpiPayables')}
          value={data.payables.open}
          subtitle={
            <>
              <CountUp value={data.payables.openCount} /> {t('home.dashboard.openInvoices')}
            </>
          }
          icon={ArrowUpRight}
          color="text-rose-600 dark:text-rose-300"
          bg="bg-rose-50 dark:bg-rose-500/10"
        />
      </div>

      {/* KPIs secundarios: pedidos y albaranes */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-up animate-duration-500 animate-fill-both"
        style={{ animationDelay: '160ms' }}
      >
        <KpiCard
          label={t('home.dashboard.salesOrders')}
          value={data.salesOrders.total}
          subtitle={<CountUp value={data.salesOrders.count} />}
          icon={ShoppingCart}
          color="text-emerald-600 dark:text-emerald-300"
          bg="bg-emerald-50 dark:bg-emerald-500/10"
        />
        <KpiCard
          label={t('home.dashboard.purchaseOrders')}
          value={data.purchaseOrders.total}
          subtitle={<CountUp value={data.purchaseOrders.count} />}
          icon={ShoppingCart}
          color="text-amber-600 dark:text-amber-300"
          bg="bg-amber-50 dark:bg-amber-500/10"
        />
        <KpiCard
          label={t('home.dashboard.salesDn')}
          value={data.salesDeliveryNotes.total}
          subtitle={<CountUp value={data.salesDeliveryNotes.count} />}
          icon={PackageCheck}
          color="text-teal-600 dark:text-teal-300"
          bg="bg-teal-50 dark:bg-teal-500/10"
        />
        <KpiCard
          label={t('home.dashboard.purchaseDn')}
          value={data.purchaseDeliveryNotes.total}
          subtitle={<CountUp value={data.purchaseDeliveryNotes.count} />}
          icon={Inbox}
          color="text-orange-600 dark:text-orange-300"
          bg="bg-orange-50 dark:bg-orange-500/10"
        />
      </div>

      {/* Línea: tendencia mensual + Donut: estado de facturas */}
      <div
        className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-fade-up animate-duration-500 animate-fill-both"
        style={{ animationDelay: '240ms' }}
      >
        <Card
          className="lg:col-span-2"
          title={t('home.dashboard.trendTitle')}
          subtitle={t('home.dashboard.trendSubtitle')}
        >
          <div className="h-72 -ml-2">
            {monthlyData.every((m) => m.Ventas === 0 && m.Compras === 0) ? (
              <EmptyState
                icon={TrendingUp}
                title={t('home.dashboard.noData')}
                hint={t('home.dashboard.noDataHint')}
              />
            ) : (
              <Chart
                type="line"
                data={monthlyData}
                xKey="month"
                series={[
                  { key: 'Ventas', label: t('home.dashboard.seriesSales') },
                  { key: 'Compras', label: t('home.dashboard.seriesPurchases') },
                ]}
                height={288}
                valueFormat={(v) => fmt.money(v)}
                aria-label={t('home.dashboard.trendAria')}
              />
            )}
          </div>
        </Card>

        <Card title={t('home.dashboard.statusTitle')} subtitle={t('home.dashboard.statusSubtitle')}>
          <div className="h-72">
            {data.invoiceStatus.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={t('home.dashboard.noInvoices')}
                hint={t('home.dashboard.noInvoicesHint')}
              />
            ) : (
              <Chart
                type="donut"
                data={data.invoiceStatus}
                xKey="label"
                series={[{ key: 'count' }]}
                height={288}
                aria-label={t('home.dashboard.statusAria')}
              />
            )}
          </div>
        </Card>
      </div>

      {/* Barras: top clientes y proveedores */}
      <div
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-up animate-duration-500 animate-fill-both"
        style={{ animationDelay: '320ms' }}
      >
        <Card
          title={t('home.dashboard.topCustomers')}
          subtitle={t('home.dashboard.topCustomersSubtitle')}
        >
          <div className="h-64">
            {topCustomersBars.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                title={t('home.dashboard.noCustomers')}
                hint={t('home.dashboard.noCustomersHint')}
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
                aria-label={t('home.dashboard.topCustomersAria')}
              />
            )}
          </div>
        </Card>

        <Card
          title={t('home.dashboard.topSuppliers')}
          subtitle={t('home.dashboard.topSuppliersSubtitle')}
        >
          <div className="h-64">
            {topSuppliersBars.length === 0 ? (
              <EmptyState
                icon={Truck}
                title={t('home.dashboard.noSuppliers')}
                hint={t('home.dashboard.noSuppliersHint')}
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
                aria-label={t('home.dashboard.topSuppliersAria')}
              />
            )}
          </div>
        </Card>
      </div>

      {/* Documentos recientes + alertas de stock */}
      <div
        className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-fade-up animate-duration-500 animate-fill-both"
        style={{ animationDelay: '400ms' }}
      >
        <Card
          className="lg:col-span-2"
          title={t('home.dashboard.recentDocs')}
          subtitle={t('home.dashboard.recentDocsSubtitle')}
        >
          {data.recentDocs.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title={t('home.dashboard.noDocs')}
              hint={t('home.dashboard.noDocsHint')}
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
                      <div className="p-2 rounded-xs bg-bg-muted text-fg-muted group-hover/docrow:bg-accent/20 group-hover/docrow:text-accent transition-colors">
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-fg-subtle font-bold uppercase tracking-wide">
                          {DOC_TYPE_LABELS[d.type] ? t(DOC_TYPE_LABELS[d.type]) : d.type}
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
          <Card
            title={t('home.dashboard.lowStock')}
            subtitle={t('home.dashboard.lowStockSubtitle')}
          >
            {data.stockAlerts.lowStock.length === 0 ? (
              <EmptyState
                icon={Package}
                title={t('home.dashboard.noAlerts')}
                hint={t('home.dashboard.noAlertsHint')}
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
                        {t('home.dashboard.min', { value: Number(it.minStock).toFixed(2) })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title={t('home.dashboard.expiring')}
            subtitle={t('home.dashboard.expiringSubtitle')}
          >
            {data.stockAlerts.expiringBatches.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title={t('home.dashboard.noExpiring')}
                hint={t('home.dashboard.noExpiringHint')}
              />
            ) : (
              <ul className="space-y-2">
                {data.stockAlerts.expiringBatches.map((b) => (
                  <li key={b.id} className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <p className="font-bold text-fg-default truncate">{b.itemName}</p>
                      <p className="text-[11px] text-fg-subtle">
                        {t('home.dashboard.batch', { batch: b.batchNum })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-amber-600 dark:text-amber-300">
                        {fmt.date(b.expiryDate)}
                      </p>
                      <p className="text-[11px] text-fg-subtle">
                        {t('home.dashboard.units', { qty: Number(b.quantity).toFixed(2) })}
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
      <div
        className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-fade-up animate-duration-500 animate-fill-both"
        style={{ animationDelay: '480ms' }}
      >
        <Card
          title={t('home.dashboard.topItems')}
          subtitle={t('home.dashboard.topItemsSubtitle')}
          className="lg:col-span-1"
        >
          {!data.topItems || data.topItems.length === 0 ? (
            <EmptyState
              icon={Package}
              title={t('home.dashboard.noSales')}
              hint={t('home.dashboard.noSalesHint')}
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {data.topItems.map((it) => (
                <li key={it.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-fg-default text-sm truncate">{it.name}</p>
                    <p className="text-[11px] font-mono text-fg-subtle">
                      {it.code} · {t('home.dashboard.unitsPlural', { qty: it.qty })}
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
          title={t('home.dashboard.activity')}
          subtitle={t('home.dashboard.activitySubtitle')}
          className="lg:col-span-2"
        >
          {!data.activityFeed || data.activityFeed.length === 0 ? (
            <EmptyState
              icon={Clock}
              title={t('home.dashboard.noActivity')}
              hint={t('home.dashboard.noActivityHint')}
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
                        {formatDateTime(ev.createdAt, {
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
  /** Importe: se anima contando hasta su valor. */
  value: number;
  subtitle: React.ReactNode;
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
  const fmt = useFormat();
  const { t } = useI18n();
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
            <CountUp value={value} format={(v) => fmt.money(v)} />
          </p>
          <p className="text-[10px] sm:text-[11px] text-fg-muted mt-0.5 truncate">{subtitle}</p>
          <p
            className={`text-[10px] sm:text-[11px] font-bold mt-1.5 flex items-center gap-1 truncate ${deltaColor}`}
            title={
              delta == null
                ? t('home.dashboard.noComparison')
                : t('home.dashboard.vsPrevious', { delta: `${delta > 0 ? '+' : ''}${delta}` })
            }
          >
            <DeltaIcon size={11} className="shrink-0" />
            <span className="truncate">
              {delta == null ? (
                t('home.dashboard.noComparison')
              ) : (
                <CountUp
                  value={delta}
                  format={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}%`}
                />
              )}
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
