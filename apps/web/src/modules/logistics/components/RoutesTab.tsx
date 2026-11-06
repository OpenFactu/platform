import { routesApi, shipmentsApi, vehiclesApi } from '../api';
import { employeesApi } from '@/modules/hr/api';
import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Modal,
  Badge,
  EmptyState,
  Progress,
  SearchableSelect,
  Switch,
  Table,
  DatePicker,
  useToast,
  usePopup,
} from '@openfactu/ui';
import type { BadgeProps, RowAction, TableColumn } from '@openfactu/ui';
import {
  AlertTriangle,
  Plus,
  Trash2,
  Edit2,
  Printer,
  RotateCcw,
  MapPin,
  Square,
} from 'lucide-react';
import { RouteMapPlanner } from '../components/RouteMapPlanner';
import { useRouteWarnings } from '../hooks/useRouteWarnings';
import { useAuth } from '@/context/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { openPdf } from '@/utils/downloadPdf';
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
  const fmt = useFormat();
  const showWarnings = useRouteWarnings();
  const [showArchived, setShowArchived] = useState(false);
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
      routesApi.list({ includeArchived: showArchived }).catch(() => []),
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
  }, [user?.tenantId, showArchived]);

  const openCreate = () => {
    setEditing(null);
    setForm({ plannedDate: new Date().toISOString().slice(0, 10) });
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
      showWarnings((d as any)?.warnings);

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
    try {
      const { archived } = await routesApi.remove(id);
      if (archived) toast.success(t('logistics.routes.archived'));
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.common.error'));
    }
  };

  const empMap = new Map(employees.map((e) => [e.id, e] as const));

  const restore = async (id: string) => {
    await routesApi.restore(id);
    load();
  };

  const finish = async (r: Route) => {
    const ok = await popup.confirm({
      title: t('logistics.routes.finishTitle'),
      message: t('logistics.routes.finishMessage', { count: r.stopsOpen || 0 }),
      confirmLabel: t('logistics.routes.finish'),
    });
    if (!ok) return;
    try {
      await routesApi.finish(r.id);
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.common.error'));
    }
  };

  const driverOf = (r: Route) => {
    const employee = r.driverEmployeeId ? empMap.get(r.driverEmployeeId) : null;
    return employee ? `${employee.firstName} ${employee.lastName}` : r.driverName || '—';
  };

  const columns: TableColumn<Route>[] = [
    {
      header: t('logistics.routes.columns.code'),
      cell: (r) => <span className="font-mono text-xs text-fg-default">{r.code}</span>,
    },
    { header: t('logistics.routes.name'), cell: (r) => r.name },
    { header: t('logistics.routes.columns.date'), cell: (r) => fmt.date(r.plannedDate) },
    {
      header: t('logistics.routes.statusLabel'),
      cell: (r) => (
        <Badge variant={STATUS_BADGE[r.status] || 'neutral'}>
          {STATUS_LABELS[r.status] ? t(STATUS_LABELS[r.status]) : r.status}
        </Badge>
      ),
    },
    {
      header: t('logistics.routes.columns.progress'),
      cell: (r) => {
        const total = r.stopsTotal || 0;
        const closed = total - (r.stopsOpen || 0);
        return total === 0 ? (
          <span className="text-xs text-fg-muted">{t('logistics.routes.noStops')}</span>
        ) : (
          <div className="min-w-[120px] space-y-1">
            <div className="text-xs text-fg-muted">
              {t('logistics.routes.stopsProgress', { closed, total })}
            </div>
            <Progress value={Math.round((closed / total) * 100)} size="sm" />
          </div>
        );
      },
    },
    {
      header: t('logistics.routes.columns.driver'),
      cell: (r) => (
        <div>
          <div>{driverOf(r)}</div>
          {r.vehiclePlate && <div className="text-xs text-fg-muted">{r.vehiclePlate}</div>}
          {r.capacityKg != null && (r.loadKg || 0) > r.capacityKg && (
            <div className="flex items-center gap-1 text-xs text-warning">
              <AlertTriangle size={12} />
              {t('logistics.routes.overCapacity', { load: r.loadKg || 0, capacity: r.capacityKg })}
            </div>
          )}
        </div>
      ),
    },
  ];

  const rowActions = (r: Route): RowAction[] => [
    {
      label: t('logistics.routes.sheet'),
      icon: <Printer size={14} />,
      onClick: () => openPdf(`/api/logistics/routes/${r.id}/sheet.pdf`),
    },
    {
      label: t('logistics.common.edit'),
      icon: <Edit2 size={14} />,
      onClick: () => openEdit(r),
    },
    ...(r.status === 'active'
      ? [
          {
            label: t('logistics.routes.finish'),
            icon: <Square size={14} />,
            onClick: () => finish(r),
          },
        ]
      : []),
    r.archivedAt
      ? {
          label: t('logistics.shipmentDetail.restore'),
          icon: <RotateCcw size={14} />,
          onClick: () => restore(r.id),
        }
      : {
          label:
            r.status === 'planned' ? t('logistics.common.delete') : t('logistics.routes.archive'),
          icon: <Trash2 size={14} />,
          destructive: true,
          onClick: () => remove(r.id),
        },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Switch
          checked={showArchived}
          onChange={setShowArchived}
          label={t('logistics.routes.showArchived')}
        />
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={14} /> {t('logistics.routes.new')}
        </Button>
      </div>

      {!loading && rows.length === 0 ? (
        <Card bodyClassName="py-10">
          <EmptyState icon={<MapPin size={28} />} title={t('logistics.routes.empty')} />
        </Card>
      ) : (
        <Card noPadding className="overflow-hidden">
          <Table
            className="max-md:p-3"
            columns={columns}
            data={rows}
            isLoading={loading}
            rowActions={rowActions}
            skeletonRowHeight={24}
          />
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
            <label className="text-[10px] font-bold uppercase tracking-wider text-fg-muted block mb-1">
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
            <p className="text-[11px] text-fg-muted mt-1">{t('logistics.routes.driverHint')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              {/* Vehículos del servidor → SearchableSelect (sin prop `label`). */}
              <label className="text-[10px] font-bold uppercase tracking-wider text-fg-muted block mb-1">
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
                <p className="text-[11px] text-fg-muted mt-1">
                  {t('logistics.routes.registeredPlate')}{' '}
                  <span className="font-mono">{form.vehiclePlate}</span>
                </p>
              )}
            </div>
          </div>
          {!editing && (
            <div className="pt-4 border-t border-border-subtle">
              <div className="text-[10px] font-bold uppercase tracking-wider text-fg-muted mb-2">
                {t('logistics.routes.sketch')}
              </div>
              <RouteMapPlanner selectedIds={plannerIds} onSelectionChange={setPlannerIds} />
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
