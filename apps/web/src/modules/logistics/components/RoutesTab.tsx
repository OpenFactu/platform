import { routesApi, shipmentsApi, vehiclesApi } from '../api';
import { employeesApi } from '@/modules/hr/api';
import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Modal, Badge, Loader, useToast } from '@openfactu/ui';
import { Plus, Trash2, Edit2, CheckCircle2 } from 'lucide-react';
import { RouteMapPlanner } from '../components/RouteMapPlanner';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/shared/http';
import type { Route, RouteVehicleOption } from '../domain/route';
import type { Employee } from '@/modules/hr/domain/employee';

const STATUS_BADGE: Record<string, any> = {
  planned: 'neutral',
  active: 'info',
  completed: 'success',
  cancelled: 'danger',
};

export const RoutesTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Route[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<RouteVehicleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Route | null>(null);
  const [form, setForm] = useState<any>({});
  const [plannerIds, setPlannerIds] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    const [r1, r2, r3] = await Promise.all([
      routesApi.list().catch(() => []),
      employeesApi.list().catch(() => []),
      vehiclesApi.list().catch(() => []),
    ]);
    setRows(Array.isArray(r1) ? r1 : []);
    setEmployees(Array.isArray(r2) ? r2 : []);
    setVehicles(Array.isArray(r3) ? r3 : []);
    setLoading(false);
  };
  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ plannedDate: new Date().toISOString().slice(0, 10), status: 'planned' });
    setPlannerIds([]);
    setShowModal(true);
  };
  const openEdit = (r: Route) => {
    setEditing(r);
    setForm({ ...r });
    setPlannerIds([]);
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name || !form.plannedDate) {
      toast.error('Nombre y fecha son obligatorios');
      return;
    }
    try {
      const d = editing ? await routesApi.update(editing.id, form) : await routesApi.create(form);

      // Al crear una ruta nueva, insertamos las paradas del planner respetando el orden.
      if (!editing && plannerIds.length > 0) {
        const routeId = d.id;
        const shipments = await shipmentsApi.listUnrouted().catch(() => []);
        const byId = new Map(
          Array.isArray(shipments) ? shipments.map((s) => [s.id, s] as const) : [],
        );
        // Creadas en serie para garantizar el orden de inserción / sequence.
        for (let i = 0; i < plannerIds.length; i++) {
          const s = byId.get(plannerIds[i]);
          if (!s) continue;
          await routesApi.createStop(routeId, {
            sequence: i + 1,
            shipmentId: s.id,
            address: s.destinationAddress,
            lat: s.destinationLat,
            lng: s.destinationLng,
          });
        }
      }

      toast.success(editing ? 'Ruta actualizada' : 'Ruta creada');
      setShowModal(false);
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || 'Error');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar ruta? También sus paradas.')) return;
    await routesApi.remove(id);
    load();
  };

  const empMap = new Map(employees.map((e) => [e.id, e] as const));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={14} /> Nueva ruta
        </Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <Card bodyClassName="py-10 text-center text-sm text-slate-500">Sin rutas.</Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {rows.map((r) => {
              const isDone = r.status === 'completed';
              return (
                <li
                  key={r.id}
                  className={
                    'flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 dark:border-slate-800/50 last:border-0 ' +
                    (isDone
                      ? 'bg-emerald-50/60 dark:bg-emerald-500/5 border-l-4 border-l-emerald-500 dark:border-l-emerald-400 pl-3'
                      : '')
                  }
                >
                  {isDone ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[11px] font-bold shadow-sm">
                      <CheckCircle2 size={12} strokeWidth={3} />
                      Completada
                    </span>
                  ) : (
                    <Badge variant={STATUS_BADGE[r.status] || 'neutral'}>{r.status}</Badge>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code
                        className={
                          'px-1.5 py-0.5 text-[11px] font-mono rounded ' +
                          (isDone
                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                            : 'bg-slate-100 dark:bg-slate-800')
                        }
                      >
                        {r.code}
                      </code>
                      <span
                        className={
                          'font-semibold text-sm ' +
                          (isDone
                            ? 'text-slate-500 dark:text-slate-400 line-through decoration-emerald-500/40'
                            : 'text-slate-800 dark:text-slate-100')
                        }
                      >
                        {r.name}
                      </span>
                      <span className="text-[11px] text-slate-500">{r.plannedDate}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Conductor:{' '}
                      {r.driverEmployeeId && empMap.get(r.driverEmployeeId)
                        ? `${empMap.get(r.driverEmployeeId)!.firstName} ${empMap.get(r.driverEmployeeId)!.lastName}`
                        : r.driverName || '—'}
                      {r.vehiclePlate && <> · {r.vehiclePlate}</>}
                    </div>
                  </div>
                  <button
                    onClick={() => openEdit(r)}
                    className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded"
                    title="Editar"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={() => remove(r.id)}
                    className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"
                    title="Eliminar"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Editar ruta' : 'Nueva ruta'}
        maxWidth={editing ? 'lg' : '5xl'}
      >
        <div className="space-y-3 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Nombre<span className="text-rose-500 ml-0.5">*</span>
              </label>
              <Input
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Fecha prevista<span className="text-rose-500 ml-0.5">*</span>
              </label>
              <Input
                type="date"
                value={form.plannedDate || ''}
                onChange={(e) => setForm({ ...form, plannedDate: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Conductor (empleado)
            </label>
            <select
              value={form.driverEmployeeId || ''}
              onChange={(e) => {
                const emp = employees.find((x) => x.id === e.target.value);
                setForm({
                  ...form,
                  driverEmployeeId: e.target.value || null,
                  driverName: emp ? `${emp.firstName} ${emp.lastName}` : null,
                  driverPhone: emp?.phone || null,
                });
              }}
              className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
            >
              <option value="">— sin asignar —</option>
              {employees
                .filter((e) => e.status === 'active')
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName} {e.code ? `(${e.code})` : ''}
                    {!e.userId ? '  sin usuario' : ''}
                  </option>
                ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Aparecen todos los empleados activos. Los marcados con ⚠ no tienen cuenta de usuario y
              no podrán loguearse en la app del repartidor.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Vehículo
              </label>
              <select
                value={form.vehicleId || ''}
                onChange={(e) => {
                  const vid = e.target.value || null;
                  const v = vehicles.find((x) => x.id === vid);
                  setForm((prev: any) => {
                    const next: any = { ...prev, vehicleId: vid };
                    // Snapshot de la matrícula siempre que haya vehículo.
                    next.vehiclePlate = v?.plate ?? null;
                    // Si el vehículo tiene conductor habitual y la ruta no lo
                    // tiene asignado todavía, lo prefijamos.
                    if (v?.defaultDriverEmployeeId && !prev.driverEmployeeId) {
                      const emp = employees.find((x) => x.id === v.defaultDriverEmployeeId);
                      next.driverEmployeeId = v.defaultDriverEmployeeId;
                      next.driverName = emp ? `${emp.firstName} ${emp.lastName}` : null;
                      next.driverPhone = emp?.phone || null;
                    }
                    return next;
                  });
                }}
                className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
              >
                <option value="">— sin asignar —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate}
                    {(v.brand || v.model) && ` · ${[v.brand, v.model].filter(Boolean).join(' ')}`}
                  </option>
                ))}
                {/* Si la ruta tiene un vehicleId que ya no aparece en la lista
                    (archivado), lo dejamos visible como opción histórica. */}
                {form.vehicleId && !vehicles.some((v) => v.id === form.vehicleId) && (
                  <option value={form.vehicleId}>
                    {form.vehiclePlate || form.vehicleId} · (archivado)
                  </option>
                )}
              </select>
              {form.vehiclePlate && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Matrícula registrada: <span className="font-mono">{form.vehiclePlate}</span>
                </p>
              )}
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Estado
              </label>
              <select
                value={form.status || 'planned'}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
              >
                <option value="planned">Planeada</option>
                <option value="active">Activa</option>
                <option value="completed">Completada</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>
          </div>
          {!editing && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Croquis — envíos sin ruta
              </div>
              <RouteMapPlanner
                token={token || ''}
                tenantId={user?.tenantId || ''}
                selectedIds={plannerIds}
                onSelectionChange={setPlannerIds}
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>{editing ? 'Guardar' : 'Crear'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
