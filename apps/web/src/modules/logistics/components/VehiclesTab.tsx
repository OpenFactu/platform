import { logisticsApi } from '../api';
import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Modal, Badge, Loader, useToast } from '@openfactu/ui';
import { Plus, Trash2, Edit2, RotateCcw, Archive } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface Vehicle {
  id: string;
  code: string;
  plate: string;
  brand: string | null;
  model: string | null;
  capacityKg: number | null;
  capacityM3: number | null;
  status: 'active' | 'maintenance' | 'retired';
  defaultDriverEmployeeId: string | null;
  notes: string | null;
  archivedAt: string | null;
}

const STATUS_BADGE: Record<string, any> = {
  active: 'success',
  maintenance: 'warning',
  retired: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  maintenance: 'En taller',
  retired: 'Retirado',
};

export const VehiclesTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<any>({});

  const load = async () => {
    setLoading(true);
    const qs = showArchived ? '?includeArchived=true' : '';
    const [r1, r2] = await Promise.all([
      logisticsApi.get(`/api/logistics/vehicles${qs}`),
      logisticsApi.get('/api/hr/employees').catch(() => []),
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
      toast.error('La matrícula es obligatoria.');
      return;
    }
    const url = editing ? `/api/logistics/vehicles/${editing.id}` : '/api/logistics/vehicles';
    const method = editing ? 'PATCH' : 'POST';
    const res = await logisticsApi.raw(method, url, form);
    const d = res.data;
    if (!res.ok) {
      toast.error(d.error || 'Error');
      return;
    }
    toast.success(editing ? 'Vehículo actualizado' : 'Vehículo creado');
    setShowModal(false);
    load();
  };

  const archive = async (v: Vehicle) => {
    if (!confirm(`¿Archivar vehículo ${v.plate}? Las rutas pasadas conservarán su registro.`))
      return;
    const res = await logisticsApi.raw('DELETE', `/api/logistics/vehicles/${v.id}`);
    if (!res.ok) {
      toast.error('Error al archivar');
      return;
    }
    toast.success('Vehículo archivado');
    load();
  };

  const restore = async (v: Vehicle) => {
    const res = await logisticsApi.raw('POST', `/api/logistics/vehicles/${v.id}/restore`);
    if (!res.ok) {
      toast.error('Error al restaurar');
      return;
    }
    toast.success('Vehículo restaurado');
    load();
  };

  const empMap = new Map(employees.map((e) => [e.id, e] as const));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-600"
          />
          Mostrar archivados
        </label>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={14} /> Nuevo vehículo
        </Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <Card bodyClassName="py-10 text-center text-sm text-slate-500">Sin vehículos.</Card>
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
                  className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 dark:border-slate-800/50 last:border-0 ${
                    archived ? 'opacity-60' : ''
                  }`}
                >
                  <Badge variant={STATUS_BADGE[v.status] || 'neutral'}>
                    {STATUS_LABEL[v.status] || v.status}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[11px] font-mono rounded">
                        {v.code}
                      </code>
                      <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 tracking-wide">
                        {v.plate}
                      </span>
                      {(v.brand || v.model) && (
                        <span className="text-[11px] text-slate-500">
                          {[v.brand, v.model].filter(Boolean).join(' ')}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex gap-3 flex-wrap">
                      {defDriver && (
                        <span>
                          Conductor habitual: {defDriver.firstName} {defDriver.lastName}
                        </span>
                      )}
                      {v.capacityKg != null && <span>{v.capacityKg} kg</span>}
                      {v.capacityM3 != null && <span>{v.capacityM3} m³</span>}
                    </div>
                  </div>
                  {!archived && (
                    <>
                      <button
                        onClick={() => openEdit(v)}
                        className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded"
                        title="Editar"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => archive(v)}
                        className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"
                        title="Archivar"
                      >
                        <Archive size={13} />
                      </button>
                    </>
                  )}
                  {archived && (
                    <button
                      onClick={() => restore(v)}
                      className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded"
                      title="Restaurar"
                    >
                      <RotateCcw size={13} />
                    </button>
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
        title={editing ? 'Editar vehículo' : 'Nuevo vehículo'}
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Matrícula *
              </label>
              <Input
                value={form.plate || ''}
                onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Estado
              </label>
              <select
                value={form.status || 'active'}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
              >
                <option value="active">Activo</option>
                <option value="maintenance">En taller</option>
                <option value="retired">Retirado</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Marca
              </label>
              <Input
                value={form.brand || ''}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Modelo
              </label>
              <Input
                value={form.model || ''}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Capacidad (kg)
              </label>
              <Input
                type="number"
                value={form.capacityKg ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    capacityKg: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Capacidad (m³)
              </label>
              <Input
                type="number"
                step="0.1"
                value={form.capacityM3 ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    capacityM3: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Conductor habitual
            </label>
            <select
              value={form.defaultDriverEmployeeId || ''}
              onChange={(e) =>
                setForm({ ...form, defaultDriverEmployeeId: e.target.value || null })
              }
              className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
            >
              <option value="">— sin asignar —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} {e.code ? `(${e.code})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Notas
            </label>
            <Input
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
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
