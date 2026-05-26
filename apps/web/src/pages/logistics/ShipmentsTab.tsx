import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, Modal, Badge, Loader, useToast } from '@openfactu/ui';
import { Plus, Trash2, MapPin, Search, ChevronLeft, ChevronRight, Mail } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTabs } from '../../context/TabsContext';
import { useFormat } from '../../hooks/useFormat';
import { RoutePicker } from '../../components/logistics/RoutePicker';
import { MapSearchBox } from '../../components/maps/MapSearchBox';

interface Shipment {
  id: string;
  carrier: string;
  trackingNumber: string | null;
  status: string;
  preparationStatus: string | null;
  driverName: string | null;
  vehiclePlate: string | null;
  destinationAddress: string | null;
  lastLat: number | null;
  lastLng: number | null;
  lastLocationAt: string | null;
  estimatedDelivery: string | null;
  reportToken: string;
  createdAt: string;
}

const STATUS_BADGE: Record<string, any> = {
  pending: 'neutral',
  picking: 'info',
  packed: 'info',
  ready: 'info',
  dispatched: 'info',
  in_transit: 'info',
  out_for_delivery: 'warning',
  postponed: 'warning',
  delivered: 'success',
  exception: 'danger',
  returned: 'danger',
  cancelled: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  picking: 'Preparando',
  packed: 'Empaquetado',
  ready: 'Listo',
  dispatched: 'Despachado',
  in_transit: 'En tránsito',
  out_for_delivery: 'En reparto',
  postponed: 'Aplazado',
  delivered: 'Entregado',
  exception: 'Incidencia',
  returned: 'Devuelto',
  cancelled: 'Cancelado',
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

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export const ShipmentsTab: React.FC = () => {
  const { token, user } = useAuth();
  const { openTab } = useTabs();
  const fmt = useFormat();
  const toast = useToast();

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
  const [routes, setRoutes] = useState<any[]>([]);
  // Almacenes (para el campo returnWarehouseId en pickup_return).
  const [warehouses, setWarehouses] = useState<any[]>([]);
  // Empleados (conductores) y vehículos para los selectores del modal.
  const [employees, setEmployees] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  // Carriers registrados para el selector de transportista.
  const [carriers, setCarriers] = useState<any[]>([]);
  // Modo del select de transportista: propio | <code> | __custom__
  const [carrierMode, setCarrierMode] = useState<string>('propio');

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-tenant-id': user?.tenantId || '',
    }),
    [token, user?.tenantId],
  );

  // Debounce: al teclear `q`, espera 300ms antes de pedir.
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedQ) params.set('q', debouncedQ);
    if (statuses.length) params.set('status', statuses.join(','));
    if (routeId) params.set('routeId', routeId);
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));

    const r = await fetch(`/api/logistics/shipments?${params.toString()}`, { headers });
    const d = await r.json();
    if (Array.isArray(d)) {
      // Compatibilidad con un backend que aún devolviera array plano.
      setRows(d);
      setTotal(d.length);
    } else {
      setRows(Array.isArray(d.rows) ? d.rows : []);
      setTotal(Number(d.total) || 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, debouncedQ, statuses, routeId, fromDate, toDate, page]);

  // Cargar rutas y almacenes una vez (para filtros + selector pickup_return).
  useEffect(() => {
    if (!user?.tenantId) return;
    fetch('/api/logistics/routes', { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRoutes(Array.isArray(d) ? d : []))
      .catch(() => setRoutes([]));
    fetch('/api/warehouses', { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setWarehouses(Array.isArray(d) ? d : []))
      .catch(() => setWarehouses([]));
    fetch('/api/hr/employees', { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) =>
        setEmployees(Array.isArray(d) ? d.filter((e: any) => e.status === 'active') : []),
      )
      .catch(() => setEmployees([]));
    fetch('/api/logistics/vehicles', { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setVehicles(Array.isArray(d) ? d.filter((v: any) => v.status === 'active') : []))
      .catch(() => setVehicles([]));
    fetch('/api/carriers', { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCarriers(Array.isArray(d) ? d.filter((c: any) => c.isActive !== false) : []))
      .catch(() => setCarriers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const create = async () => {
    if (!form.destinationAddress || !String(form.destinationAddress).trim()) {
      toast.error(
        form.kind === 'pickup_return'
          ? 'La dirección de recogida es obligatoria.'
          : 'La dirección de destino es obligatoria.',
      );
      return;
    }
    if (form.kind === 'pickup_return' && !form.returnWarehouseId) {
      toast.error('Selecciona el almacén de destino al devolverlo.');
      return;
    }
    const res = await fetch('/api/logistics/shipments', {
      method: 'POST',
      headers,
      body: JSON.stringify(form),
    });
    const d = await res.json();
    if (!res.ok) {
      toast.error(d.error || 'Error');
      return;
    }
    toast.success(`Envío creado (token ${d.reportToken.slice(0, 8)}…)`);
    setShowModal(false);
    setForm({ carrier: 'propio', status: 'pending', kind: 'delivery' });
    setCarrierMode('propio');
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar envío?')) return;
    await fetch(`/api/logistics/shipments/${id}`, { method: 'DELETE', headers });
    load();
  };

  const resendNotification = async (id: string, status: string) => {
    const r = await fetch(`/api/logistics/shipments/${id}/notify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ stage: status }),
    });
    if (r.ok) toast.success('Email enfilado');
    else toast.error('No se pudo enviar');
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = !!q || statuses.length > 0 || !!routeId || !!fromDate || !!toDate;

  return (
    <div className="space-y-3">
      {/* Barra de filtros */}
      <Card bodyClassName="p-3 space-y-3">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder="Buscar por tracking, dirección o conductor…"
              className="!pl-9"
            />
          </div>
          <div className="flex gap-2 items-center shrink-0">
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setPage(1);
                setFromDate(e.target.value);
              }}
              className="w-[130px]"
            />
            <span className="text-slate-400 text-xs">→</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => {
                setPage(1);
                setToDate(e.target.value);
              }}
              className="w-[130px]"
            />
          </div>
          <Button onClick={() => setShowModal(true)} className="flex items-center gap-2 shrink-0">
            <Plus size={14} /> Nuevo envío
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Estado:
          </div>
          {STATUS_OPTIONS.map((s) => {
            const active = statuses.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={
                  'text-[11px] px-2.5 py-1 rounded-full border transition ' +
                  (active
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-primary')
                }
              >
                {STATUS_LABEL[s]}
              </button>
            );
          })}
          <div className="flex-1 min-w-[180px]">
            <RoutePicker
              value={routeId}
              onChange={(v) => {
                setPage(1);
                setRouteId(v);
              }}
              routes={routes}
              allowEmpty
              placeholder="Todas las rutas"
            />
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-[11px] text-slate-500 hover:text-rose-500 underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </Card>

      {/* Tabla / mensaje vacío */}
      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <Card bodyClassName="py-10 text-center text-sm text-slate-500">
          {hasFilters ? 'Ningún envío coincide con los filtros.' : 'Sin envíos aún.'}
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[780px]">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Estado</th>
                  <th className="px-4 py-2 text-left">Transportista</th>
                  <th className="px-4 py-2 text-left">Conductor</th>
                  <th className="px-4 py-2 text-left">Destino</th>
                  <th className="px-4 py-2 text-left">Última posición</th>
                  <th className="px-4 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const live = isLive(s.lastLocationAt);
                  return (
                    <tr
                      key={s.id}
                      className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 cursor-pointer"
                      onClick={() => openTab(`/logistics/shipments/${s.id}`)}
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={STATUS_BADGE[s.status] || 'neutral'}>
                            {STATUS_LABEL[s.status] || s.status}
                          </Badge>
                          {live && (
                            <span
                              className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
                              title="Reportando posición ahora"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-200">
                        {s.carrier}
                        {s.trackingNumber && (
                          <span className="ml-2 font-mono text-[10px] text-slate-500">
                            {s.trackingNumber}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-200">
                        {s.driverName || '—'}
                        {s.vehiclePlate && (
                          <span className="ml-2 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {s.vehiclePlate}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300 truncate max-w-[280px]">
                        {s.destinationAddress || '—'}
                      </td>
                      <td className="px-4 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                        {s.lastLat != null && s.lastLng != null ? timeAgo(s.lastLocationAt) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openTab(`/logistics/shipments/${s.id}`);
                          }}
                          className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded"
                          title="Ver detalle"
                        >
                          <MapPin size={13} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            resendNotification(s.id, s.status);
                          }}
                          className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded"
                          title="Reenviar notificación al destinatario"
                        >
                          <Mail size={13} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(s.id);
                          }}
                          className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
            <span>
              {total === 0
                ? '0'
                : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)}`}{' '}
              de <b>{total}</b>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="px-2 text-slate-700 dark:text-slate-200">
                Página {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Modal Nuevo envío (sin cambios estructurales) */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Nuevo envío"
        subtitle="Crea un seguimiento. Se genera un token opaco para el reporte de GPS."
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          {/* Tipo de envío — delivery (default) o pickup_return (recogida
               de devolución independiente). */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Tipo
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, kind: 'delivery' })}
                className={
                  'h-10 rounded-lg border text-xs font-bold uppercase tracking-wider transition-colors ' +
                  ((form.kind || 'delivery') === 'delivery'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700')
                }
              >
                📦 Entrega
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, kind: 'pickup_return' })}
                className={
                  'h-10 rounded-lg border text-xs font-bold uppercase tracking-wider transition-colors ' +
                  (form.kind === 'pickup_return'
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700')
                }
              >
                ↩ Recogida de devolución
              </button>
            </div>
            {form.kind === 'pickup_return' && (
              <p className="text-[11px] text-amber-600 mt-1">
                El conductor recogerá la mercancía en la dirección indicada y al confirmarlo se
                creará una entrada de stock en borrador.
              </p>
            )}
          </div>

          {/* ─── Transportista ─── */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Transportista
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Operador
                </label>
                <select
                  value={carrierMode}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCarrierMode(v);
                    if (v === '__custom__') {
                      setForm({ ...form, carrier: '' });
                    } else {
                      setForm({ ...form, carrier: v });
                    }
                  }}
                  className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
                >
                  <option value="propio">Propio (flota interna)</option>
                  {carriers.map((c: any) => (
                    <option key={c.id} value={c.code || c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__custom__">Otro…</option>
                </select>
                {carrierMode === '__custom__' && (
                  <Input
                    className="mt-2"
                    placeholder="Nombre del transportista"
                    value={form.carrier || ''}
                    onChange={(e) => setForm({ ...form, carrier: e.target.value })}
                  />
                )}
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Nº de tracking
                </label>
                <Input
                  value={form.trackingNumber || ''}
                  onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
            </div>
          </div>

          {/* ─── Conductor y vehículo ─── */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Conductor y vehículo
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Conductor
                </label>
                <select
                  value={form.driverEmployeeId || ''}
                  onChange={(e) => {
                    const empId = e.target.value;
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
                  className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
                >
                  <option value="">— seleccionar —</option>
                  {employees.map((emp: any) => {
                    const name = [emp.firstName, emp.lastName].filter(Boolean).join(' ').trim();
                    return (
                      <option key={emp.id} value={emp.id}>
                        {name || emp.code || emp.email || '(sin nombre)'}
                        {emp.code ? ` · ${emp.code}` : ''}
                      </option>
                    );
                  })}
                </select>
                {employees.length === 0 && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    No hay empleados activos. Da de alta en RRHH → Empleados.
                  </p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Vehículo
                </label>
                <select
                  value={form.vehiclePlate || ''}
                  onChange={(e) => {
                    const plate = e.target.value;
                    const v = vehicles.find((x: any) => x.plate === plate);
                    setForm({
                      ...form,
                      vehiclePlate: plate || null,
                      carrier: form.carrier || (v ? 'propio' : form.carrier),
                    });
                  }}
                  className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
                >
                  <option value="">— seleccionar —</option>
                  {vehicles.map((v: any) => (
                    <option key={v.id} value={v.plate}>
                      {v.plate}
                      {v.brand || v.model
                        ? ` · ${[v.brand, v.model].filter(Boolean).join(' ')}`
                        : ''}
                      {v.code ? ` (${v.code})` : ''}
                    </option>
                  ))}
                </select>
                {vehicles.length === 0 && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    No hay vehículos activos. Da de alta en Logística → Vehículos.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ─── Dirección ─── */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              {form.kind === 'pickup_return' ? 'Recogida' : 'Destino'}
            </div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              {form.kind === 'pickup_return' ? 'Dirección de recogida' : 'Dirección de destino'}
              <span className="text-rose-500 ml-0.5">*</span>
            </label>
            <MapSearchBox
              inline
              authHeader={token ? `Bearer ${token}` : undefined}
              tenantId={user?.tenantId || undefined}
              value={form.destinationAddress || ''}
              placeholder={
                form.kind === 'pickup_return'
                  ? 'Dónde recoger (casa del cliente, etc.)'
                  : 'Dónde entregar'
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
                  Almacén de destino al devolverlo
                  <span className="text-rose-500 ml-0.5">*</span>
                </label>
                <select
                  value={form.returnWarehouseId || ''}
                  onChange={(e) => setForm({ ...form, returnWarehouseId: e.target.value || null })}
                  className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
                >
                  <option value="">— seleccionar —</option>
                  {warehouses.map((w: any) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Al confirmar la recogida, se generará una entrada de stock (GoodsReceipt draft)
                  sobre este almacén para que la revises.
                </p>
              </div>
            )}
          </div>

          {/* ─── Destinatario / contacto ─── */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              {form.kind === 'pickup_return'
                ? 'Contacto en el punto de recogida'
                : 'Destinatario (opcional)'}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="Nombre"
                value={form.recipientName || ''}
                onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
              />
              <Input
                placeholder="Teléfono"
                value={form.recipientPhone || ''}
                onChange={(e) => setForm({ ...form, recipientPhone: e.target.value })}
              />
            </div>
            <Input
              className="mt-2"
              placeholder="Email (para recibir notificaciones de tracking)"
              type="email"
              value={form.recipientEmail || ''}
              onChange={(e) => setForm({ ...form, recipientEmail: e.target.value })}
            />
          </div>

          {/* ─── Detalles adicionales ─── */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Detalles adicionales
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Fecha estimada de entrega
                </label>
                <Input
                  type="datetime-local"
                  value={form.estimatedDelivery || ''}
                  onChange={(e) => setForm({ ...form, estimatedDelivery: e.target.value || null })}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Notas internas
                </label>
                <textarea
                  rows={3}
                  value={form.notes || ''}
                  onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
                  placeholder="Instrucciones para el conductor, observaciones, etc."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 py-2 outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={create}>Crear</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
