/**
 * Plataformas ajenas — catálogo de ubicaciones logísticas externas
 * (cross-docks, naves alquiladas, hubs compartidos). Las `StagingArea` las
 * referencian vía `platformId` para heredar address/coords.
 */
import { platformsApi } from '../api';
import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  NumberInput,
  Modal,
  Badge,
  Loader,
  Switch,
  useToast,
  usePopup,
} from '@openfactu/ui';
import { Plus, Trash2, Edit2, RotateCcw, Archive, Building2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/shared/http';
import type { Platform } from '../domain/platform';

export const PlatformsTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const [rows, setRows] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Platform | null>(null);
  const [form, setForm] = useState<any>({});

  const load = async () => {
    setLoading(true);
    try {
      const d = await platformsApi.list(showArchived ? { includeArchived: true } : undefined);
      setRows(Array.isArray(d) ? d : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, showArchived]);

  const openCreate = () => {
    setEditing(null);
    setForm({});
    setShowModal(true);
  };
  const openEdit = (p: Platform) => {
    setEditing(p);
    setForm({ ...p });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name) {
      toast.error('El nombre es obligatorio.');
      return;
    }
    try {
      if (editing) await platformsApi.update(editing.id, form);
      else await platformsApi.create(form);
      toast.success(editing ? 'Plataforma actualizada' : 'Plataforma creada');
      setShowModal(false);
      setForm({});
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || 'Error');
    }
  };

  const archive = async (p: Platform) => {
    const ok = await popup.confirm({
      title: 'Archivar plataforma',
      message: `¿Archivar la plataforma "${p.name}"?`,
      tone: 'danger',
      confirmLabel: 'Archivar',
    });
    if (!ok) return;
    await platformsApi.archive(p.id);
    load();
  };
  const restore = async (p: Platform) => {
    await platformsApi.restore(p.id);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {/* Surte efecto al instante (recarga la lista), no es campo de un
            formulario → Switch, que además sí tiene prop `label`. */}
        <Switch checked={showArchived} onChange={setShowArchived} label="Mostrar archivadas" />
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={14} /> Nueva plataforma
        </Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <Card bodyClassName="py-10 text-center text-sm text-slate-500">
          Sin plataformas. Crea una cuando trabajes con un cross-dock, nave alquilada o hub de un
          transportista.
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {rows.map((p) => {
              const archived = !!p.archivedAt;
              return (
                <li
                  key={p.id}
                  className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 dark:border-slate-800/50 last:border-0 ${
                    archived ? 'opacity-60' : ''
                  }`}
                >
                  <Building2 size={16} className="text-slate-400 shrink-0" />
                  <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[11px] font-mono rounded">
                    {p.code}
                  </code>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                        {p.name}
                      </span>
                      {archived && <Badge variant="neutral">Archivada</Badge>}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex gap-3 flex-wrap">
                      {p.address && <span className="truncate max-w-md">{p.address}</span>}
                      {p.openingHours && <span>· {p.openingHours}</span>}
                      {p.contactPhone && <span>· {p.contactPhone}</span>}
                    </div>
                  </div>
                  {!archived ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(p)}
                        title="Editar"
                      >
                        <Edit2 size={13} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => archive(p)}
                        title="Archivar"
                      >
                        <Archive size={13} />
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => restore(p)}
                      title="Restaurar"
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
        title={editing ? 'Editar plataforma' : 'Nueva plataforma'}
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          <Input
            label="Nombre"
            requiredMark
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Mercamadrid — Nave 4"
          />
          <Input
            label="Dirección"
            value={form.address || ''}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Av. de Madrid s/n, 28053 Madrid"
            helperText="Se geolocaliza automáticamente al guardar."
          />
          <div className="grid grid-cols-2 gap-3">
            {/* `lat`/`lng` son doublePrecision en el servidor, así que llegan ya
                numéricas: NumberInput trabaja con ellas sin conversión, y el
                campo vacío se envía como null (emptyValue por defecto). */}
            <NumberInput
              label="Latitud"
              value={form.lat ?? null}
              onChange={(v) => setForm({ ...form, lat: v })}
              precision={6}
              thousandSeparator={false}
              allowNegative
              placeholder="40.3981"
            />
            <NumberInput
              label="Longitud"
              value={form.lng ?? null}
              onChange={(v) => setForm({ ...form, lng: v })}
              precision={6}
              thousandSeparator={false}
              allowNegative
              placeholder="-3.6554"
            />
          </div>
          <Input
            label="Horario"
            value={form.openingHours || ''}
            onChange={(e) => setForm({ ...form, openingHours: e.target.value })}
            placeholder="L-V 8-18, S 8-14"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Contacto"
              value={form.contactName || ''}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              placeholder="Juan Pérez"
            />
            <Input
              label="Teléfono"
              value={form.contactPhone || ''}
              onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              placeholder="+34 600 000 000"
            />
          </div>
          <Input
            label="Email"
            type="email"
            value={form.contactEmail || ''}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
          />
          <Input
            label="Notas"
            value={form.notes || ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
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
