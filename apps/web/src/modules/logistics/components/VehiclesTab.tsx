import { vehiclesApi } from '../api';
import { employeesApi } from '@/modules/hr/api';
import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  NumberInput,
  Modal,
  Badge,
  Loader,
  Select,
  SearchableSelect,
  Switch,
  useToast,
  usePopup,
} from '@openfactu/ui';
import type { BadgeProps } from '@openfactu/ui';
import { Plus, Trash2, Edit2, RotateCcw, Archive } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import type { Vehicle } from '../domain/vehicle';
import type { Employee } from '@/modules/hr/domain/employee';

const STATUS_BADGE: Record<string, BadgeProps['variant']> = {
  active: 'success',
  maintenance: 'warning',
  retired: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'logistics.vehicles.status.active',
  maintenance: 'logistics.vehicles.status.maintenance',
  retired: 'logistics.vehicles.status.retired',
};

export const VehiclesTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const { t } = useI18n();
  // El desplegable de estado deriva sus opciones de las etiquetas de arriba.
  const STATUS_OPTIONS = Object.entries(STATUS_LABEL).map(([value, label]) => ({
    value,
    label: t(label),
  }));
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<any>({});

  const load = async () => {
    setLoading(true);
    const [r1, r2] = await Promise.all([
      vehiclesApi.list(showArchived ? { includeArchived: true } : undefined).catch(() => []),
      employeesApi.list().catch(() => []),
    ]);
    setRows(Array.isArray(r1) ? r1 : []);
    setEmployees(Array.isArray(r2) ? r2 : []);
    setLoading(false);
  };
  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, showArchived]);

  const openCreate = () => {
    setEditing(null);
    setForm({ status: 'active' });
    setShowModal(true);
  };
  const openEdit = (v: Vehicle) => {
    setEditing(v);
    setForm({ ...v });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.plate) {
      toast.error(t('logistics.vehicles.plateRequired'));
      return;
    }
    try {
      if (editing) await vehiclesApi.update(editing.id, form);
      else await vehiclesApi.create(form);
      toast.success(editing ? t('logistics.vehicles.updated') : t('logistics.vehicles.created'));
      setShowModal(false);
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.common.error'));
    }
  };

  const archive = async (v: Vehicle) => {
    const ok = await popup.confirm({
      title: t('logistics.vehicles.archiveTitle'),
      message: t('logistics.vehicles.archiveMessage', { plate: v.plate }),
      tone: 'danger',
      confirmLabel: t('logistics.vehicles.archive'),
    });
    if (!ok) return;
    try {
      await vehiclesApi.archive(v.id);
      toast.success(t('logistics.vehicles.archived'));
      load();
    } catch {
      toast.error(t('logistics.vehicles.archiveError'));
    }
  };

  const restore = async (v: Vehicle) => {
    try {
      await vehiclesApi.restore(v.id);
      toast.success(t('logistics.vehicles.restored'));
      load();
    } catch {
      toast.error(t('logistics.vehicles.restoreError'));
    }
  };

  const empMap = new Map(employees.map((e) => [e.id, e] as const));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {/* Recarga la lista al instante, no es campo de formulario → Switch. */}
        <Switch
          checked={showArchived}
          onChange={setShowArchived}
          label={t('logistics.vehicles.showArchived')}
        />
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={14} /> {t('logistics.vehicles.new')}
        </Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <Card bodyClassName="py-10 text-center text-sm text-slate-500">
          {t('logistics.vehicles.empty')}
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {rows.map((v) => {
              const defDriver = v.defaultDriverEmployeeId
                ? empMap.get(v.defaultDriverEmployeeId)
                : null;
              const archived = !!v.archivedAt;
              return (
                <li
                  key={v.id}
                  className={`flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle last:border-0 ${
                    archived ? 'opacity-60' : ''
                  }`}
                >
                  <Badge variant={STATUS_BADGE[v.status] || 'neutral'}>
                    {STATUS_LABEL[v.status] ? t(STATUS_LABEL[v.status]) : v.status}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="px-1.5 py-0.5 bg-bg-muted text-[11px] font-mono rounded">
                        {v.code}
                      </code>
                      <span className="font-semibold text-sm text-fg-default tracking-wide">
                        {v.plate}
                      </span>
                      {(v.brand || v.model) && (
                        <span className="text-[11px] text-slate-500">
                          {[v.brand, v.model].filter(Boolean).join(' ')}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-fg-muted mt-0.5 flex gap-3 flex-wrap">
                      {defDriver && (
                        <span>
                          {t('logistics.vehicles.defaultDriverLabel')} {defDriver.firstName}{' '}
                          {defDriver.lastName}
                        </span>
                      )}
                      {v.capacityKg != null && <span>{v.capacityKg} kg</span>}
                      {v.capacityM3 != null && <span>{v.capacityM3} m³</span>}
                    </div>
                  </div>
                  {!archived && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(v)}
                        title={t('logistics.common.edit')}
                      >
                        <Edit2 size={13} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => archive(v)}
                        title={t('logistics.vehicles.archive')}
                      >
                        <Archive size={13} />
                      </Button>
                    </>
                  )}
                  {archived && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => restore(v)}
                      title={t('logistics.vehicles.restore')}
                    >
                      <RotateCcw size={13} />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? t('logistics.vehicles.editTitle') : t('logistics.vehicles.new')}
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t('logistics.vehicles.plate')}
              requiredMark
              value={form.plate || ''}
              onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })}
            />
            {/* Lista estática y corta → Select (sí tiene prop `label`). */}
            <Select
              label={t('logistics.vehicles.statusLabel')}
              options={STATUS_OPTIONS}
              value={form.status || 'active'}
              onChange={(v) => setForm({ ...form, status: v })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t('logistics.vehicles.brand')}
              value={form.brand || ''}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
            />
            <Input
              label={t('logistics.vehicles.model')}
              value={form.model || ''}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Capacidades son doublePrecision en el servidor: llegan como
                number y se envían como number. El campo vacío sigue siendo
                null (emptyValue por defecto). */}
            <NumberInput
              label={t('logistics.vehicles.capacityKg')}
              value={form.capacityKg ?? null}
              onChange={(v) => setForm({ ...form, capacityKg: v })}
              precision={2}
              min={0}
            />
            <NumberInput
              label={t('logistics.vehicles.capacityM3')}
              value={form.capacityM3 ?? null}
              onChange={(v) => setForm({ ...form, capacityM3: v })}
              precision={2}
              min={0}
            />
          </div>
          <div>
            {/* Empleados del servidor → SearchableSelect (sin prop `label`). */}
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              {t('logistics.vehicles.defaultDriver')}
            </label>
            <SearchableSelect
              options={employees.map((e) => ({
                value: e.id,
                label: `${e.firstName} ${e.lastName}`,
                secondaryLabel: e.code || undefined,
              }))}
              value={form.defaultDriverEmployeeId || ''}
              onChange={(v) => setForm({ ...form, defaultDriverEmployeeId: v || null })}
              placeholder={t('logistics.vehicles.unassigned')}
              clearable
            />
          </div>
          <Input
            label={t('logistics.vehicles.notes')}
            value={form.notes || ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
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
