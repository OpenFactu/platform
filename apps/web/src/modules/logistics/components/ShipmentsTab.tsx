import { carriersApi, routesApi, shipmentsApi, vehiclesApi } from '../api';
import { warehousesApi } from '@/modules/inventory/api';
import { employeesApi } from '@/modules/hr/api';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Modal,
  Badge,
  useToast,
  usePopup,
  DatePicker,
  SearchableSelect,
  Textarea,
  EmptyState,
  Table,
} from '@openfactu/ui';
import type { BadgeProps, RowAction, TableColumn } from '@openfactu/ui';
import { Plus, Trash2, MapPin, Search, Mail, Truck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTabs } from '@/context/TabsContext';
import { useFormat } from '@/hooks/useFormat';
import { RoutePicker } from '../components/RoutePicker';
import { MapSearchBox } from './maps/MapSearchBox';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import type { TranslateVars } from '@/i18n/i18n';
import type { Carrier } from '../domain/carrier';
import type { Route } from '../domain/route';
import type { Shipment } from '../domain/shipment';
import type { Vehicle } from '../domain/vehicle';
import type { Warehouse } from '@/modules/inventory/domain/warehouse';
import type { Employee } from '@/modules/hr/domain/employee';

const STATUS_BADGE: Record<string, BadgeProps['variant']> = {
  pending: 'neutral',
  picking: 'info',
  packed: 'info',
  ready: 'info',
  dispatched: 'info',
  in_transit: 'info',
  out_for_delivery: 'warning',
  postponed: 'warning',
  delivered: 'success',
  exception: 'error',
  returned: 'error',
  cancelled: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'logistics.status.shipment.pending',
  picking: 'logistics.status.shipment.picking',
  packed: 'logistics.status.shipment.packed',
  ready: 'logistics.status.shipment.ready',
  dispatched: 'logistics.status.shipment.dispatched',
  in_transit: 'logistics.status.shipment.in_transit',
  out_for_delivery: 'logistics.status.shipment.out_for_delivery',
  postponed: 'logistics.status.shipment.postponed',
  delivered: 'logistics.status.shipment.delivered',
  exception: 'logistics.status.shipment.exception',
  returned: 'logistics.status.shipment.returned',
  cancelled: 'logistics.status.shipment.cancelled',
};

const STATUS_OPTIONS: Array<keyof typeof STATUS_LABEL> = [
  'pending',
  'picking',
  'packed',
  'ready',
  'dispatched',
  'in_transit',
  'out_for_delivery',
  'postponed',
  'delivered',
  'exception',
  'returned',
  'cancelled',
];

const PAGE_SIZE = 50;

/** ¿La última posición se reportó en los últimos 10 min? → chip "en vivo". */
function isLive(lastLocationAt: string | null): boolean {
  if (!lastLocationAt) return false;
  return Date.now() - new Date(lastLocationAt).getTime() < 10 * 60 * 1000;
}

function timeAgo(iso: string | null, t: (path: string, vars?: TranslateVars) => string): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return t('logistics.shipments.timeAgo.now');
  if (m < 60) return t('logistics.shipments.timeAgo.minutes', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('logistics.shipments.timeAgo.hours', { n: h });
  return t('logistics.shipments.timeAgo.days', { n: Math.floor(h / 24) });
}

export const ShipmentsTab: React.FC = () => {
  const { token, user } = useAuth();
  const { openTab } = useTabs();
  const fmt = useFormat();
  const toast = useToast();
  const popup = usePopup();
  const { t } = useI18n();

  const [rows, setRows] = useState<Shipment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>({ carrier: 'propio', status: 'pending' });

  // Filtros + paginación.
  const [q, setQ] = useState('');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [routeId, setRouteId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  // Rutas disponibles para el RoutePicker del filtro.
  const [routes, setRoutes] = useState<Route[]>([]);
  // Almacenes (para el campo returnWarehouseId en pickup_return).
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  // Empleados (conductores) y vehículos para los selectores del modal.
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  // Carriers registrados para el selector de transportista.
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  // Modo del select de transportista: propio | <code> | __custom__
  const [carrierMode, setCarrierMode] = useState<string>('propio');

  // Debounce: al teclear `q`, espera 300ms antes de pedir.
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const load = async () => {
    setLoading(true);
    try {
      const d = await shipmentsApi.list({
        q: debouncedQ || undefined,
        status: statuses.length ? statuses.join(',') : undefined,
        routeId: routeId || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      if (Array.isArray(d)) {
        // Compatibilidad con un backend que aún devolviera array plano.
        setRows(d);
        setTotal(d.length);
      } else {
        setRows(Array.isArray(d.rows) ? d.rows : []);
        setTotal(Number(d.total) || 0);
      }
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, debouncedQ, statuses, routeId, fromDate, toDate, page]);

  // Cargar rutas y almacenes una vez (para filtros + selector pickup_return).
  useEffect(() => {
    if (!user?.tenantId) return;
    routesApi
      .list()
      .then((d) => setRoutes(Array.isArray(d) ? d : []))
      .catch(() => setRoutes([]));
    warehousesApi
      .list()
      .then((d) => setWarehouses(Array.isArray(d) ? d : []))
      .catch(() => setWarehouses([]));
    employeesApi
      .list()
      .then((d) => setEmployees(Array.isArray(d) ? d.filter((e) => e.status === 'active') : []))
      .catch(() => setEmployees([]));
    vehiclesApi
      .list()
      .then((d) => setVehicles(Array.isArray(d) ? d.filter((v) => v.status === 'active') : []))
      .catch(() => setVehicles([]));
    carriersApi
      .list()
      .then((d) => setCarriers(Array.isArray(d) ? d.filter((c) => c.isActive !== false) : []))
      .catch(() => setCarriers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const create = async () => {
    if (!form.destinationAddress || !String(form.destinationAddress).trim()) {
      toast.error(
        form.kind === 'pickup_return'
          ? t('logistics.shipments.pickupAddressRequired')
          : t('logistics.shipments.destinationAddressRequired'),
      );
      return;
    }
    if (form.kind === 'pickup_return' && !form.returnWarehouseId) {
      toast.error(t('logistics.shipments.returnWarehouseRequired'));
      return;
    }
    try {
      const d = await shipmentsApi.create(form);
      toast.success(t('logistics.shipments.created', { token: d.reportToken.slice(0, 8) }));
      setShowModal(false);
      setForm({ carrier: 'propio', status: 'pending', kind: 'delivery' });
      setCarrierMode('propio');
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.common.error'));
    }
  };

  const remove = async (id: string) => {
    const ok = await popup.confirm({
      title: t('logistics.shipments.deleteTitle'),
      message: t('logistics.shipments.deleteMessage'),
      tone: 'danger',
      confirmLabel: t('logistics.common.delete'),
    });
    if (!ok) return;
    await shipmentsApi.remove(id);
    load();
  };

  const resendNotification = async (id: string, status: string) => {
    try {
      await shipmentsApi.notify(id, { stage: status });
      toast.success(t('logistics.shipments.emailQueued'));
    } catch {
      toast.error(t('logistics.shipments.sendError'));
    }
  };

  const toggleStatus = (s: string) => {
    setPage(1);
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const clearFilters = () => {
    setQ('');
    setStatuses([]);
    setRouteId('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const hasFilters = !!q || statuses.length > 0 || !!routeId || !!fromDate || !!toDate;

  // Opciones de los selectores: una vez por render en lugar de una por <option>.
  const carrierOptions = useMemo(
    () => [
      { value: 'propio', label: t('logistics.shipments.ownFleet') },
      ...carriers.map((c: any) => ({ value: c.code || c.id, label: c.name })),
      { value: '__custom__', label: t('logistics.shipments.otherCarrier') },
    ],
    [carriers, t],
  );

  const driverOptions = useMemo(
    () =>
      employees.map((emp: any) => ({
        value: emp.id,
        label:
          [emp.firstName, emp.lastName].filter(Boolean).join(' ').trim() ||
          emp.code ||
          emp.email ||
          t('logistics.shipments.noName'),
        secondaryLabel: emp.code || undefined,
      })),
    [employees, t],
  );

  const vehicleOptions = useMemo(
    () =>
      vehicles.map((v: any) => ({
        value: v.plate,
        label: v.plate,
        secondaryLabel:
          [[v.brand, v.model].filter(Boolean).join(' '), v.code ? `(${v.code})` : '']
            .filter(Boolean)
            .join(' ') || undefined,
      })),
    [vehicles],
  );

  const warehouseOptions = useMemo(
    () => warehouses.map((w: any) => ({ value: w.id, label: w.name })),
    [warehouses],
  );

  const columns: TableColumn<Shipment>[] = [
    {
      header: t('logistics.shipments.columns.status'),
      cell: (s) => (
        <div className="flex items-center gap-1.5">
          <Badge variant={STATUS_BADGE[s.status] || 'neutral'}>
            {STATUS_LABEL[s.status] ? t(STATUS_LABEL[s.status]) : s.status}
          </Badge>
          {isLive(s.lastLocationAt) && (
            <span
              className="inline-block w-2 h-2 rounded-full bg-success animate-pulse"
              title={t('logistics.shipments.liveHint')}
            />
          )}
        </div>
      ),
    },
    {
      header: t('logistics.shipments.columns.carrier'),
      cell: (s) => (
        <>
          {s.carrier}
          {s.trackingNumber && (
            <span className="ml-2 font-mono text-[10px] text-fg-muted">{s.trackingNumber}</span>
          )}
        </>
      ),
      sortable: true,
      sortAccessor: (s) => s.carrier,
    },
    {
      header: t('logistics.shipments.columns.driver'),
      cell: (s) => (
        <>
          {s.driverName || '—'}
          {s.vehiclePlate && (
            <span className="ml-2 text-[10px] font-mono bg-bg-muted px-1.5 py-0.5 rounded">
              {s.vehiclePlate}
            </span>
          )}
        </>
      ),
      sortable: true,
      sortAccessor: (s) => s.driverName || '',
    },
    {
      header: t('logistics.shipments.columns.destination'),
      cell: (s) => s.destinationAddress || '—',
      className: 'truncate max-w-[280px]',
    },
    {
      header: t('logistics.shipments.columns.lastPosition'),
      cell: (s) => (s.lastLat != null && s.lastLng != null ? timeAgo(s.lastLocationAt, t) : '—'),
      className: 'text-[11px] text-fg-muted',
    },
  ];

  // Los tres botones de la antigua columna «Acciones» pasan al menú ⋯ (y al
  // click derecho) que ofrece la Table.
  const rowActions = (s: Shipment): RowAction[] => [
    {
      label: t('logistics.shipments.actions.view'),
      icon: <MapPin size={14} />,
      onClick: () => openTab(`/logistics/shipments/${s.id}`),
    },
    {
      label: t('logistics.shipments.actions.resend'),
      icon: <Mail size={14} />,
      onClick: () => resendNotification(s.id, s.status),
    },
    {
      label: t('logistics.shipments.deleteTitle'),
      icon: <Trash2 size={14} />,
      destructive: true,
      onClick: () => remove(s.id),
    },
  ];

  return (
    <div className="space-y-3">
      {/* Barra de filtros */}
      <Card bodyClassName="p-3 space-y-3">
        <div className="flex flex-col md:flex-row gap-2">
          <Input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder={t('logistics.shipments.searchPlaceholder')}
            leftIcon={<Search size={14} />}
            containerClassName="flex-1"
          />
          <div className="flex gap-2 items-center shrink-0">
            <DatePicker
              value={fromDate || null}
              onChange={(v) => {
                setPage(1);
                setFromDate(v ?? '');
              }}
              clearable
              className="w-[130px]"
            />
            <span className="text-slate-400 text-xs">→</span>
            <DatePicker
              value={toDate || null}
              onChange={(v) => {
                setPage(1);
                setToDate(v ?? '');
              }}
              clearable
              className="w-[130px]"
            />
          </div>
          <Button onClick={() => setShowModal(true)} className="flex items-center gap-2 shrink-0">
            <Plus size={14} /> {t('logistics.shipments.new')}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {t('logistics.shipments.statusFilter')}
          </div>
          {STATUS_OPTIONS.map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={statuses.includes(s) ? 'primary' : 'outline'}
              onClick={() => toggleStatus(s)}
            >
              {t(STATUS_LABEL[s])}
            </Button>
          ))}
          <div className="flex-1 min-w-[180px]">
            <RoutePicker
              value={routeId}
              onChange={(v) => {
                setPage(1);
                setRouteId(v);
              }}
              routes={routes}
              allowEmpty
              placeholder={t('logistics.shipments.allRoutes')}
            />
          </div>
          {hasFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              {t('logistics.shipments.clearFilters')}
            </Button>
          )}
        </div>
      </Card>

      {/* Tabla / mensaje vacío */}
      {!loading && rows.length === 0 ? (
        <Card bodyClassName="py-10">
          <EmptyState
            icon={<Truck size={28} />}
            title={
              hasFilters ? t('logistics.shipments.emptyFiltered') : t('logistics.shipments.empty')
            }
            hint={
              hasFilters
                ? t('logistics.shipments.emptyFilteredHint')
                : t('logistics.shipments.emptyHint')
            }
            action={
              hasFilters ? (
                <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>
                  {t('logistics.shipments.clearFilters')}
                </Button>
              ) : (
                <Button type="button" size="sm" onClick={() => setShowModal(true)}>
                  <Plus size={14} className="mr-1" /> {t('logistics.shipments.new')}
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden" noPadding>
          {/* Paginación de servidor: `rows` es solo la página actual, así que
              se le pasa el `total` real para que calcule las páginas. */}
          <Table
            className="max-md:p-3"
            columns={columns}
            data={rows}
            isLoading={loading}
            rowActions={rowActions}
            onRowClick={(s) => openTab(`/logistics/shipments/${s.id}`)}
            skeletonRowHeight={24}
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total,
              onPageChange: setPage,
              pageSizeOptions: [],
            }}
          />
        </Card>
      )}

      {/* Modal Nuevo envío (sin cambios estructurales) */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={t('logistics.shipments.new')}
        subtitle={t('logistics.shipments.modal.subtitle')}
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          {/* Tipo de envío — delivery (default) o pickup_return (recogida
               de devolución independiente). */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              {t('logistics.shipments.modal.type')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                type="button"
                variant={(form.kind || 'delivery') === 'delivery' ? 'primary' : 'outline'}
                onClick={() => setForm({ ...form, kind: 'delivery' })}
                className="h-10 w-full"
              >
                📦 {t('logistics.shipments.modal.delivery')}
              </Button>
              {/* `accent` para la recogida: la acción excepcional se distingue
                  de la entrega normal igual que hacía el ámbar de antes. */}
              <Button
                type="button"
                variant={form.kind === 'pickup_return' ? 'accent' : 'outline'}
                onClick={() => setForm({ ...form, kind: 'pickup_return' })}
                className="h-10 w-full"
              >
                ↩ {t('logistics.shipments.modal.pickupReturn')}
              </Button>
            </div>
            {form.kind === 'pickup_return' && (
              <p className="text-[11px] text-amber-600 mt-1">
                {t('logistics.shipments.modal.pickupHint')}
              </p>
            )}
          </div>

          {/* ─── Transportista ─── */}
          <div className="border-t border-border-subtle pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              {t('logistics.shipments.modal.carrier')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  {t('logistics.shipments.modal.operator')}
                </label>
                <SearchableSelect
                  options={carrierOptions}
                  value={carrierMode}
                  onChange={(v) => {
                    setCarrierMode(v);
                    if (v === '__custom__') {
                      setForm({ ...form, carrier: '' });
                    } else {
                      setForm({ ...form, carrier: v });
                    }
                  }}
                />

                {carrierMode === '__custom__' && (
                  <Input
                    className="mt-2"
                    placeholder={t('logistics.shipments.modal.carrierName')}
                    value={form.carrier || ''}
                    onChange={(e) => setForm({ ...form, carrier: e.target.value })}
                  />
                )}
              </div>
              <div>
                <Input
                  label={t('logistics.shipments.modal.trackingNumber')}
                  value={form.trackingNumber || ''}
                  onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })}
                  placeholder={t('logistics.shipments.modal.optional')}
                />
              </div>
            </div>
          </div>

          {/* ─── Conductor y vehículo ─── */}
          <div className="border-t border-border-subtle pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              {t('logistics.shipments.modal.driverAndVehicle')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  {t('logistics.shipments.modal.driver')}
                </label>
                <SearchableSelect
                  options={driverOptions}
                  value={form.driverEmployeeId || ''}
                  onChange={(empId) => {
                    const emp = employees.find((x: any) => x.id === empId);
                    setForm({
                      ...form,
                      driverEmployeeId: empId || null,
                      driverName: emp
                        ? [emp.firstName, emp.lastName].filter(Boolean).join(' ').trim() || null
                        : null,
                      driverPhone: emp?.phone || form.driverPhone || null,
                    });
                  }}
                  clearable
                  placeholder={t('logistics.common.selectPlaceholder')}
                />
                {employees.length === 0 && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    {t('logistics.shipments.modal.noEmployees')}
                  </p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  {t('logistics.shipments.modal.vehicle')}
                </label>
                <SearchableSelect
                  options={vehicleOptions}
                  value={form.vehiclePlate || ''}
                  onChange={(plate) => {
                    const v = vehicles.find((x: any) => x.plate === plate);
                    setForm({
                      ...form,
                      vehiclePlate: plate || null,
                      carrier: form.carrier || (v ? 'propio' : form.carrier),
                    });
                  }}
                  clearable
                  placeholder={t('logistics.common.selectPlaceholder')}
                />
                {vehicles.length === 0 && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    {t('logistics.shipments.modal.noVehicles')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ─── Dirección ─── */}
          <div className="border-t border-border-subtle pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              {form.kind === 'pickup_return'
                ? t('logistics.shipments.modal.pickup')
                : t('logistics.shipments.modal.destination')}
            </div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              {form.kind === 'pickup_return'
                ? t('logistics.shipments.modal.pickupAddress')
                : t('logistics.shipments.modal.destinationAddress')}
              <span className="text-rose-500 ml-0.5">*</span>
            </label>
            <MapSearchBox
              inline
              authHeader={token ? `Bearer ${token}` : undefined}
              tenantId={user?.tenantId || undefined}
              value={form.destinationAddress || ''}
              placeholder={
                form.kind === 'pickup_return'
                  ? t('logistics.shipments.modal.pickupPlaceholder')
                  : t('logistics.shipments.modal.destinationPlaceholder')
              }
              onTextChange={(v) =>
                setForm((f: any) => ({
                  ...f,
                  destinationAddress: v,
                  // Al teclear libre se invalidan las coords previas; sólo
                  // se rellenan al elegir una sugerencia geocodificada.
                  destinationLat: null,
                  destinationLng: null,
                }))
              }
              onSelect={(s) =>
                setForm((f: any) => ({
                  ...f,
                  destinationAddress: s.label,
                  destinationLat: s.lat,
                  destinationLng: s.lng,
                }))
              }
            />
            {form.destinationLat != null && form.destinationLng != null && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                📍 {Number(form.destinationLat).toFixed(5)},{' '}
                {Number(form.destinationLng).toFixed(5)}
              </p>
            )}

            {/* Pickup return: almacén destino de la mercancía recogida. */}
            {form.kind === 'pickup_return' && (
              <div className="mt-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  {t('logistics.shipments.modal.returnWarehouse')}
                  <span className="text-rose-500 ml-0.5">*</span>
                </label>
                {/* Obligatorio, pero el aviso ya lo da `create()` con toast —
                    SearchableSelect no tiene `required`. */}
                <SearchableSelect
                  options={warehouseOptions}
                  value={form.returnWarehouseId || ''}
                  onChange={(v) => setForm({ ...form, returnWarehouseId: v || null })}
                  placeholder={t('logistics.common.selectPlaceholder')}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {t('logistics.shipments.modal.returnWarehouseHint')}
                </p>
              </div>
            )}
          </div>

          {/* ─── Destinatario / contacto ─── */}
          <div className="border-t border-border-subtle pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              {form.kind === 'pickup_return'
                ? t('logistics.shipments.modal.pickupContact')
                : t('logistics.shipments.modal.recipient')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                placeholder={t('logistics.shipments.modal.name')}
                value={form.recipientName || ''}
                onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
              />
              <Input
                placeholder={t('logistics.shipments.modal.phone')}
                value={form.recipientPhone || ''}
                onChange={(e) => setForm({ ...form, recipientPhone: e.target.value })}
              />
            </div>
            <Input
              className="mt-2"
              placeholder={t('logistics.shipments.modal.emailPlaceholder')}
              type="email"
              value={form.recipientEmail || ''}
              onChange={(e) => setForm({ ...form, recipientEmail: e.target.value })}
            />
          </div>

          {/* ─── Detalles adicionales ─── */}
          <div className="border-t border-border-subtle pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              {t('logistics.shipments.modal.additionalDetails')}
            </div>
            <div className="grid grid-cols-1 gap-3">
              {/* datetime-local: la librería no tiene selector de fecha+hora,
                  así que se queda como Input nativo. */}
              <Input
                label={t('logistics.shipments.modal.estimatedDelivery')}
                type="datetime-local"
                value={form.estimatedDelivery || ''}
                onChange={(e) => setForm({ ...form, estimatedDelivery: e.target.value || null })}
              />
              <Textarea
                label={t('logistics.shipments.modal.internalNotes')}
                rows={3}
                value={form.notes || ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
                placeholder={t('logistics.shipments.modal.notesPlaceholder')}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {t('logistics.common.cancel')}
            </Button>
            <Button onClick={create}>{t('logistics.common.create')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
