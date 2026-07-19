import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Loader, useToast, Badge } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Network, Plus, Trash2, Save, X, UserCheck, ShoppingBag, Pencil } from 'lucide-react';
import { ContextMenu } from '../components/common/ContextMenu';
import { useContextMenu } from '../hooks/useContextMenu';

export const PartnerGroups: React.FC = () => {
  const { token, user } = useAuth();
  const location = useLocation();
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.write;
  const canDelete =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.delete;
  const toast = useToast();
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRow, setNewRow] = useState<any | null>(null);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/partnerGroups', {
        headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' },
      });
      const data = await res.json();
      setGroups(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Error al cargar grupos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchGroups();
  }, [user?.tenantId]);

  const handleCreate = async () => {
    if (!newRow?.code || !newRow?.name) return;
    try {
      const res = await fetch('/api/partnerGroups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-tenant-id': user?.tenantId || '',
        },
        body: JSON.stringify({
          ...newRow,
          code: newRow.code.toUpperCase(),
          codePrefix: newRow.codePrefix?.trim().toUpperCase() || null,
        }),
      });
      if (res.ok) {
        setNewRow(null);
        fetchGroups();
        toast.success('Grupo creado');
      }
    } catch {
      toast.error('Error al crear');
    }
  };

  const handleUpdate = async (id: string, data: any) => {
    try {
      const res = await fetch(`/api/partnerGroups/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-tenant-id': user?.tenantId || '',
        },
        body: JSON.stringify({
          ...data,
          code: data.code.toUpperCase(),
          codePrefix: data.codePrefix?.trim().toUpperCase() || null,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        fetchGroups();
        toast.success('Grupo actualizado');
      }
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este grupo?')) return;
    try {
      const res = await fetch(`/api/partnerGroups/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' },
      });
      if (res.ok) {
        fetchGroups();
        toast.success('Grupo eliminado');
      }
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const ctxMenu = useContextMenu<any>();
  const buildCtxItems = (g: any) => [
    {
      label: 'Editar',
      icon: <Pencil size={14} />,
      disabled: !canWrite,
      onClick: () => setEditingId(g.id),
    },
    {
      label: 'Eliminar',
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => handleDelete(g.id),
    },
  ];

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-blue-600 rounded-lg text-white">
              <Network size={20} />
            </span>
            <span className="text-[10px] font-black text-blue-600 dark:text-blue-300 uppercase tracking-[0.2em]">
              CRM / Estructura
            </span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight text-display">
            Grupos de Socios
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            Clasifica tus interlocutores comerciales para segmentación y tarifas.
          </p>
        </div>
        <Button
          onClick={() =>
            setNewRow({ code: '', name: '', codePrefix: '', isCustomer: false, isVendor: false })
          }
          disabled={!!newRow || !canWrite}
          className="flex items-center gap-2 disabled:opacity-50 disabled:grayscale transition-all"
        >
          <Plus size={18} /> Nuevo Grupo
        </Button>
      </header>

      <Card className="overflow-hidden border-0" noPadding>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-black text-slate-400 dark:text-slate-500">
              <th className="px-6 py-4">Identificación</th>
              <th className="px-6 py-4">Codificación</th>
              <th className="px-6 py-4 text-center">Tipología</th>
              <th className="px-6 py-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {newRow && (
              <tr className="bg-blue-50/30 animate-in zoom-in-95 duration-200">
                <td className="px-4 py-3 space-y-2">
                  <Input
                    placeholder="Cód (Ej: VIP)"
                    value={newRow.code}
                    onChange={(e) => setNewRow({ ...newRow, code: e.target.value })}
                    className="h-9"
                  />
                  <Input
                    placeholder="Nombre del Grupo"
                    value={newRow.name}
                    onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
                    className="h-9"
                  />
                </td>
                <td className="px-4 py-3">
                  <Input
                    placeholder="Prefijo (Ej: V)"
                    value={newRow.codePrefix}
                    onChange={(e) => setNewRow({ ...newRow, codePrefix: e.target.value })}
                    className="h-10 uppercase font-mono text-center"
                    maxLength={5}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-2 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newRow.isCustomer}
                        onChange={(e) => setNewRow({ ...newRow, isCustomer: e.target.checked })}
                        className="rounded text-blue-600 dark:text-blue-300"
                      />
                      <span>Cliente</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newRow.isVendor}
                        onChange={(e) => setNewRow({ ...newRow, isVendor: e.target.checked })}
                        className="rounded text-blue-600 dark:text-blue-300"
                      />
                      <span>Proveedor</span>
                    </label>
                  </div>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <Button size="sm" onClick={handleCreate}>
                    <Save size={14} className="mr-2" /> Guardar
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setNewRow(null)}>
                    <X size={14} />
                  </Button>
                </td>
              </tr>
            )}

            {groups.map((g) => (
              <tr
                key={g.id}
                onContextMenu={(e) => ctxMenu.open(e, g)}
                className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group"
              >
                <td className="px-6 py-4">
                  {editingId === g.id ? (
                    <div className="space-y-2">
                      <Input
                        value={g.code}
                        onChange={(e) =>
                          setGroups(
                            groups.map((x) => (x.id === g.id ? { ...x, code: e.target.value } : x)),
                          )
                        }
                        className="h-9"
                      />
                      <Input
                        value={g.name}
                        onChange={(e) =>
                          setGroups(
                            groups.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)),
                          )
                        }
                        className="h-9"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 rounded-xl flex items-center justify-center font-black group-hover:bg-blue-600 group-hover:text-white transition-all text-xs">
                        {g.code?.substring(0, 2).toUpperCase() || '??'}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight">
                          {g.name}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
                          {g.code}
                        </p>
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-center">
                  {editingId === g.id ? (
                    <Input
                      value={g.codePrefix || ''}
                      onChange={(e) =>
                        setGroups(
                          groups.map((x) =>
                            x.id === g.id ? { ...x, codePrefix: e.target.value } : x,
                          ),
                        )
                      }
                      className="h-10 uppercase font-mono text-center"
                      maxLength={5}
                    />
                  ) : g.codePrefix ? (
                    <Badge
                      variant="neutral"
                      className="font-mono tracking-widest text-[10px] bg-slate-100 dark:bg-slate-800"
                    >
                      {g.codePrefix}-XXX
                    </Badge>
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600 italic text-[10px]">
                      Sin Prefijo
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {editingId === g.id ? (
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={g.isCustomer}
                          onChange={(e) =>
                            setGroups(
                              groups.map((x) =>
                                x.id === g.id ? { ...x, isCustomer: e.target.checked } : x,
                              ),
                            )
                          }
                          className="rounded text-blue-600 dark:text-blue-300"
                        />
                        <span>Cliente</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={g.isVendor}
                          onChange={(e) =>
                            setGroups(
                              groups.map((x) =>
                                x.id === g.id ? { ...x, isVendor: e.target.checked } : x,
                              ),
                            )
                          }
                          className="rounded text-blue-600 dark:text-blue-300"
                        />
                        <span>Proveedor</span>
                      </label>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      {g.isCustomer && (
                        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-100 dark:border-emerald-500/20 w-full justify-center">
                          <UserCheck size={10} />
                          <span className="text-[9px] font-black uppercase">Cliente</span>
                        </div>
                      )}
                      {g.isVendor && (
                        <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-100 dark:border-amber-500/20 w-full justify-center">
                          <ShoppingBag size={10} />
                          <span className="text-[9px] font-black uppercase">Proveedor</span>
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-right space-x-1">
                  {editingId === g.id ? (
                    <>
                      <Button size="sm" onClick={() => handleUpdate(g.id, g)}>
                        <Save size={14} className="mr-2" /> Aplicar
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
                        <X size={14} />
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => canWrite && setEditingId(g.id)}
                        disabled={!canWrite}
                        className={`p-2 transition-all rounded-xl ${canWrite ? 'text-slate-300 dark:text-slate-600 hover:text-blue-500 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10' : 'text-slate-100 cursor-not-allowed grayscale'}`}
                      >
                        <Plus size={16} className="rotate-45" />
                      </button>
                      <button
                        onClick={() => canDelete && handleDelete(g.id)}
                        disabled={!canDelete}
                        className={`p-2 transition-all rounded-xl ${canDelete ? 'text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10' : 'text-slate-100 cursor-not-allowed grayscale'}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {ctxMenu.state && (
        <ContextMenu
          x={ctxMenu.state.x}
          y={ctxMenu.state.y}
          items={buildCtxItems(ctxMenu.state.data)}
          onClose={ctxMenu.close}
        />
      )}
    </div>
  );
};
