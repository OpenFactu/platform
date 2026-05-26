/**
 * Plataformas ajenas — catálogo de ubicaciones logísticas externas
 * (cross-docks, naves alquiladas, hubs compartidos). Las `StagingArea` las
 * referencian vía `platformId` para heredar address/coords.
 */
import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Modal, Badge, Loader, useToast } from '@openfactu/ui';
import { Plus, Trash2, Edit2, RotateCcw, Archive, Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface Platform {
  id: string;
  code: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  openingHours: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  archivedAt: string | null;
}

export const PlatformsTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Platform | null>(null);
  const [form, setForm] = useState<any>({});

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  const load = async () => {
    setLoading(true);
    const qs = showArchived ? '?includeArchived=true' : '';
    const res = await fetch(`/api/logistics/platforms${qs}`, { headers });
    const d = res.ok ? await res.json() : [];
    setRows(Array.isArray(d) ? d : []);
    setLoading(false);
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
    const url = editing ? `/api/logistics/platforms/${editing.id}` : '/api/logistics/platforms';
    const method = editing ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers, body: JSON.stringify(form) });
    const d = await res.json();
    if (!res.ok) {
      toast.error(d.error || 'Error');
      return;
    }
    toast.success(editing ? 'Plataforma actualizada' : 'Plataforma creada');
    setShowModal(false);
    setForm({});
    load();
  };

  const archive = async (p: Platform) => {
    if (!confirm(`¿Archivar plataforma ${p.name}?`)) return;
    await fetch(`/api/logistics/platforms/${p.id}`, { method: 'DELETE', headers });
    load();
  };
  const restore = async (p: Platform) => {
    await fetch(`/api/logistics/platforms/${p.id}/restore`, { method: 'POST', headers });
    load();
  };

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
          Mostrar archivadas
        </label>
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
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded"
                        title="Editar"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => archive(p)}
                        className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"
                        title="Archivar"
                      >
                        <Archive size={13} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => restore(p)}
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
        title={editing ? 'Editar plataforma' : 'Nueva plataforma'}
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Nombre *
            </label>
            <Input
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Mercamadrid — Nave 4"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Dirección
            </label>
            <Input
              value={form.address || ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Av. de Madrid s/n, 28053 Madrid"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Se geolocaliza automáticamente al guardar.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Latitud
              </label>
              <Input
                type="number"
                step="0.000001"
                value={form.lat ?? ''}
                onChange={(e) =>
                  setForm({ ...form, lat: e.target.value === '' ? null : Number(e.target.value) })
                }
                placeholder="40.3981"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Longitud
              </label>
              <Input
                type="number"
                step="0.000001"
                value={form.lng ?? ''}
                onChange={(e) =>
                  setForm({ ...form, lng: e.target.value === '' ? null : Number(e.target.value) })
                }
                placeholder="-3.6554"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Horario
            </label>
            <Input
              value={form.openingHours || ''}
              onChange={(e) => setForm({ ...form, openingHours: e.target.value })}
              placeholder="L-V 8-18, S 8-14"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Contacto
              </label>
              <Input
                value={form.contactName || ''}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                placeholder="Juan Pérez"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Teléfono
              </label>
              <Input
                value={form.contactPhone || ''}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                placeholder="+34 600 000 000"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Email
            </label>
            <Input
              type="email"
              value={form.contactEmail || ''}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            />
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
