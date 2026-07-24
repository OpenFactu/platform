import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Loader, useToast, Badge } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Hash, Plus, Trash2, ArrowRightLeft, Save, X, Settings2, Pencil } from 'lucide-react';
import { ContextMenu } from '@/components/common/ContextMenu';
import { useContextMenu } from '@/hooks/useContextMenu';
import { uomApi } from '../api';
import type { Uom as UomEntity } from '../domain/uom';

export const Uom: React.FC = () => {
  const { user } = useAuth();
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
  const [uoms, setUoms] = useState<UomEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRow, setNewRow] = useState<any | null>(null);

  const fetchUoms = async () => {
    setLoading(true);
    try {
      const data = await uomApi.list();
      setUoms(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Error al cargar unidades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchUoms();
  }, [user?.tenantId]);

  const handleCreate = async () => {
    if (!newRow?.name || !newRow?.code) return;
    try {
      await uomApi.create(newRow);
      setNewRow(null);
      fetchUoms();
      toast.success('Unidad creada');
    } catch {
      toast.error('Error al crear');
    }
  };

  const handleUpdate = async (id: string, data: any) => {
    try {
      await uomApi.update(id, data);
      setEditingId(null);
      fetchUoms();
      toast.success('Unidad actualizada');
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar esta unidad?')) return;
    try {
      await uomApi.remove(id);
      fetchUoms();
      toast.success('Unidad eliminada');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const ctxMenu = useContextMenu<any>();
  const buildCtxItems = (u: any) => [
    {
      label: 'Editar',
      icon: <Pencil size={14} />,
      disabled: !canWrite,
      onClick: () => setEditingId(u.id),
    },
    {
      label: 'Eliminar',
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => handleDelete(u.id),
    },
  ];

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-blue-600 rounded-lg text-white">
              <Hash size={20} />
            </span>
            <span className="text-[10px] font-black text-blue-600 dark:text-blue-300 uppercase tracking-[0.2em]">
              Logística / Maestro
            </span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight text-display">
            Unidades de Medida
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            Define las dimensiones y conversiones globales para tus artículos.
          </p>
        </div>
        <Button
          onClick={() => setNewRow({ name: '', code: '', baseValue: '1.0000', baseUomId: null })}
          disabled={!!newRow || !canWrite}
          className="flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
        >
          <Plus size={18} /> Nueva Unidad
        </Button>
      </header>

      <Card className="overflow-hidden border-0" noPadding>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-black text-slate-400 dark:text-slate-500">
              <th className="px-6 py-4">Nombre y Código</th>
              <th className="px-6 py-4">Conversión Logística</th>
              <th className="px-6 py-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {newRow && (
              <tr className="bg-blue-50/30 animate-in zoom-in-95 duration-200">
                <td className="px-4 py-3 space-y-2">
                  <Input
                    placeholder="Nombre (Ej: Paquete)"
                    value={newRow.name}
                    onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
                    className="h-9"
                  />
                  <Input
                    placeholder="Código (Ej: pq)"
                    value={newRow.code}
                    onChange={(e) => setNewRow({ ...newRow, code: e.target.value })}
                    className="h-9 font-mono uppercase"
                  />
                </td>
                <td className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.0001"
                      value={newRow.baseValue}
                      onChange={(e) => setNewRow({ ...newRow, baseValue: e.target.value })}
                      className="h-9 w-24 text-center"
                    />
                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500">de</span>
                    <select
                      value={newRow.baseUomId || ''}
                      onChange={(e) => setNewRow({ ...newRow, baseUomId: e.target.value || null })}
                      className="h-9 bg-white dark:bg-slate-900 border rounded-lg px-2 text-xs"
                    >
                      <option value="">(Unidad Primaria)</option>
                      {uoms.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="px-4 py-3 text-right space-x-2 align-top pt-8">
                  <Button size="sm" onClick={handleCreate}>
                    <Save size={14} className="mr-2" /> Guardar
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setNewRow(null)}>
                    <X size={14} />
                  </Button>
                </td>
              </tr>
            )}

            {uoms.map((u) => (
              <tr
                key={u.id}
                onContextMenu={(e) => ctxMenu.open(e, u)}
                className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group"
              >
                <td className="px-6 py-4">
                  {editingId === u.id ? (
                    <div className="space-y-2">
                      <Input
                        value={u.name}
                        onChange={(e) =>
                          setUoms(
                            uoms.map((x) => (x.id === u.id ? { ...x, name: e.target.value } : x)),
                          )
                        }
                        className="h-9"
                      />
                      <Input
                        value={u.code}
                        onChange={(e) =>
                          setUoms(
                            uoms.map((x) => (x.id === u.id ? { ...x, code: e.target.value } : x)),
                          )
                        }
                        className="h-9 font-mono uppercase"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 rounded-xl flex items-center justify-center text-xs font-black group-hover:bg-blue-600 group-hover:text-white transition-all">
                        {u.code?.toUpperCase().substring(0, 3) || 'UOM'}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight">
                          {u.name}
                        </p>
                        <Badge
                          variant="neutral"
                          className="mt-1 font-mono uppercase tracking-widest text-[9px] bg-slate-100 dark:bg-slate-800"
                        >
                          {u.code || '---'}
                        </Badge>
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  {editingId === u.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.0001"
                        value={u.baseValue}
                        onChange={(e) =>
                          setUoms(
                            uoms.map((x) =>
                              x.id === u.id ? { ...x, baseValue: e.target.value } : x,
                            ),
                          )
                        }
                        className="h-9 w-24 text-center"
                      />
                      <ArrowRightLeft size={12} className="text-slate-300 dark:text-slate-600" />
                      <select
                        value={u.baseUomId || ''}
                        onChange={(e) =>
                          setUoms(
                            uoms.map((x) =>
                              x.id === u.id ? { ...x, baseUomId: e.target.value || null } : x,
                            ),
                          )
                        }
                        className="h-9 bg-white dark:bg-slate-900 border rounded-lg px-2 text-xs"
                      >
                        <option value="">(Unidad Primaria)</option>
                        {uoms
                          .filter((x) => x.id !== u.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name} ({x.code})
                            </option>
                          ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      {!u.baseUomId ? (
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-100 dark:border-emerald-500/20">
                          <Settings2 size={12} />
                          <span className="text-[10px] font-black uppercase tracking-widest">
                            Unidad Base
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-bold text-xs">
                          <span className="text-slate-900 dark:text-slate-100">1 {u.code}</span>
                          <ArrowRightLeft
                            size={10}
                            className="text-slate-300 dark:text-slate-600"
                          />
                          <span className="text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-100 dark:border-blue-500/20">
                            {u.baseValue} {uoms.find((x) => x.id === u.baseUomId)?.code}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-right space-x-1">
                  {editingId === u.id ? (
                    <>
                      <Button size="sm" onClick={() => handleUpdate(u.id, u)}>
                        <Save size={14} className="mr-2" /> Aplicar
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
                        <X size={14} />
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => canWrite && setEditingId(u.id)}
                        disabled={!canWrite}
                        className={`p-2 transition-all rounded-xl ${canWrite ? 'text-slate-300 dark:text-slate-600 hover:text-blue-500 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10' : 'text-slate-100 cursor-not-allowed grayscale'}`}
                      >
                        <Plus size={16} className="rotate-45" />
                      </button>
                      <button
                        onClick={() => canDelete && handleDelete(u.id)}
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
