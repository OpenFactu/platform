import { routesApi, shipmentsApi, vehiclesApi } from '../api';
import { employeesApi } from '@/modules/hr/api';
import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Modal,
  Badge,
  Loader,
  Select,
  SearchableSelect,
  DatePicker,
  useToast,
  usePopup,
} from '@openfactu/ui';
import type { BadgeProps } from '@openfactu/ui';
import { Plus, Trash2, Edit2, CheckCircle2 } from 'lucide-react';
import { RouteMapPlanner } from '../components/RouteMapPlanner';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import type { Route, RouteVehicleOption } from '../domain/route';
import type { Employee } from '@/modules/hr/domain/employee';

const STATUS_BADGE: Record<string, BadgeProps['variant']> = {
  planned: 'neutral',
  active: 'info',
  completed: 'success',
  cancelled: 'error',
};

// Estados de ruta en un solo sitio: el desplegable deriva sus opciones de aquí.
const STATUS_LABELS: Record<string, string> = {
  planned: 'logistics.routes.status.planned',
  active: 'logistics.routes.status.active',
  completed: 'logistics.routes.status.completed',
  cancelled: 'logistics.routes.status.cancelled',
};

export const RoutesTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const { t } = useI18n();
  const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({
    value,
    label: t(label),
  }));
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
      toast.error(t('logistics.routes.required'));
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

      toast.success(editing ? t('logistics.routes.updated') : t('logistics.routes.created'));
      setShowModal(false);
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.common.error'));
    }
  };

  const remove = async (id: string) => {
    const ok = await popup.confirm({
      title: t('logistics.routes.deleteTitle'),
      message: t('logistics.routes.deleteMessage'),
      tone: 'danger',
      confirmLabel: t('logistics.common.delete'),
    });
    if (!ok) return;
    await routesApi.remove(id);
    load();
  };

  const empMap = new Map(employees.map((e) => [e.id, e] as const));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={14} /> {t('logistics.routes.new')}
        </Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <Card bodyClassName="py-10 text-center text-sm text-slate-500">
          {t('logistics.routes.empty')}
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {rows.map((r) => {
              const isDone = r.status === 'completed';
              return (
                <li
                  key={r.id}
                  className={
                    'flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle last:border-0 ' +
                    (isDone
                      ? 'bg-emerald-50/60 dark:bg-emerald-500/5 border-l-4 border-l-emerald-500 dark:border-l-emerald-400 pl-3'
                      : '')
                  }
                >
                  {isDone ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[11px] font-bold shadow-sm">
                      <CheckCircle2 size={12} strokeWidth={3} />
                      {t('logistics.routes.status.completed')}
                    </span>
                  ) : (
                    <Badge variant={STATUS_BADGE[r.status] || 'neutral'}>
                      {STATUS_LABELS[r.status] ? t(STATUS_LABELS[r.status]) : r.status}
                    </Badge>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code
                        className={
                          'px-1.5 py-0.5 text-[11px] font-mono rounded ' +
                          (isDone
                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                            : 'bg-bg-muted')
                        }
                      >
                        {r.code}
                      </code>
                      <span
                        className={
                          'font-semibold text-sm ' +
                          (isDone
                            ? 'text-fg-muted line-through decoration-emerald-500/40'
                            : 'text-fg-default')
                        }
                      >
                        {r.name}
                      </span>
                      <span className="text-[11px] text-slate-500">{r.plannedDate}</span>
                    </div>
                    <div className="text-[11px] text-fg-muted mt-0.5">
                      {t('logistics.routes.driver')}{' '}
                      {r.driverEmployeeId && empMap.get(r.driverEmployeeId)
                        ? `${empMap.get(r.driverEmployeeId)!.firstName} ${empMap.get(r.driverEmployeeId)!.lastName}`
                        : r.driverName || '—'}
                      {r.vehiclePlate && <> · {r.vehiclePlate}</>}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(r)}
                    title={t('logistics.common.edit')}
                  >
                    <Edit2 size={13} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(r.id)}
                    title={t('logistics.common.delete')}
                  >
                    <Trash2 size={13} />
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? t('logistics.routes.editTitle') : t('logistics.routes.new')}
        maxWidth={editing ? 'lg' : '5xl'}
      >
        <div className="space-y-3 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t('logistics.routes.name')}
              requiredMark
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {/* `plannedDate` se guarda como 'YYYY-MM-DD' y el vacío es '', no
                null: se normaliza en los dos sentidos. Obligatorio, pero la
                validación ya vive en `save()` (no hay <form> nativo). */}
            <DatePicker
              label={t('logistics.routes.plannedDate')}
              value={(form.plannedDate || '').slice(0, 10) || null}
              onChange={(v) => setForm({ ...form, plannedDate: v ?? '' })}
              clearable
            />
          </div>
          <div>
            {/* Empleados vienen del servidor y pueden ser muchos →
                SearchableSelect (no tiene prop `label`). */}
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              {t('logistics.routes.driverEmployee')}
            </label>
            <SearchableSelect
              options={employees
                .filter((e) => e.status === 'active')
                .map((e) => ({
                  value: e.id,
                  label: `${e.firstName} ${e.lastName}`,
                  secondaryLabel:
                    [e.code, !e.userId ? t('logistics.routes.noUser') : null]
                      .filter(Boolean)
                      .join(' · ') || undefined,
                }))}
              value={form.driverEmployeeId || ''}
              onChange={(v) => {
                const emp = employees.find((x) => x.id === v);
                setForm({
                  ...form,
                  driverEmployeeId: v || null,
                  driverName: emp ? `${emp.firstName} ${emp.lastName}` : null,
                  driverPhone: emp?.phone || null,
                });
              }}
              placeholder={t('logistics.routes.unassigned')}
              clearable
            />
            <p className="text-[11px] text-slate-500 mt-1">{t('logistics.routes.driverHint')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              {/* Vehículos del servidor → SearchableSelect (sin prop `label`). */}
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                {t('logistics.routes.vehicle')}
              </label>
              <SearchableSelect
                options={[
                  ...vehicles.map((v) => ({
                    value: v.id,
                    label: v.plate,
                    secondaryLabel: [v.brand, v.model].filter(Boolean).join(' ') || undefined,
                  })),
                  // Si la ruta tiene un vehicleId que ya no aparece en la lista
                  // (archivado), lo dejamos visible como opción histórica.
                  ...(form.vehicleId &&
                  !vehicles.some((v: RouteVehicleOption) => v.id === form.vehicleId)
                    ? [
                        {
                          value: form.vehicleId as string,
                          label: (form.vehiclePlate || form.vehicleId) as string,
                          secondaryLabel: t('logistics.routes.archived'),
                        },
                      ]
                    : []),
                ]}
                value={form.vehicleId || ''}
                onChange={(val) => {
                  const vid = val || null;
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
                placeholder={t('logistics.routes.unassigned')}
                clearable
              />
              {form.vehiclePlate && (
                <p className="text-[11px] text-slate-500 mt-1">
                  {t('logistics.routes.registeredPlate')}{' '}
                  <span className="font-mono">{form.vehiclePlate}</span>
                </p>
              )}
            </div>
            {/* Lista estática y corta → Select (sí tiene prop `label`). */}
            <Select
              label={t('logistics.routes.statusLabel')}
              options={STATUS_OPTIONS}
              value={form.status || 'planned'}
              onChange={(v) => setForm({ ...form, status: v })}
            />
          </div>
          {!editing && (
            <div className="pt-4 border-t border-border-subtle">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                {t('logistics.routes.sketch')}
              </div>
              <RouteMapPlanner
                token={token || ''}
                tenantId={user?.tenantId || ''}
                selectedIds={plannerIds}
                onSelectionChange={setPlannerIds}
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {t('logistics.common.cancel')}
            </Button>
            <Button onClick={save}>
              {editing ? t('logistics.common.save') : t('logistics.common.create')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
