import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Loader,
  useToast,
  usePopup,
  Badge,
  useContextMenu,
  SearchableSelect,
} from '@openfactu/ui';
import type { ContextMenuItem } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Hash, Plus, Trash2, ArrowRightLeft, Save, X, Settings2, Pencil } from 'lucide-react';
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
  const popup = usePopup();
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
    const ok = await popup.confirm({
      title: 'Eliminar unidad',
      message: '¿Seguro que deseas eliminar esta unidad de medida?',
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await uomApi.remove(id);
      fetchUoms();
      toast.success('Unidad eliminada');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  /** Opciones del selector "de qué unidad convierte" — `excludeId` evita que
   *  una unidad se elija como su propia base. */
  const uomOptions = (excludeId?: string) =>
    uoms
      .filter((x) => !excludeId || x.id !== excludeId)
      .map((x) => ({ value: x.id, label: x.name, secondaryLabel: x.code }));

  const { contextMenu, openContextMenu } = useContextMenu();
  const buildCtxItems = (u: any): ContextMenuItem[] => [
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
          <h1 className="text-4xl font-black text-fg-default tracking-tight text-display">
            Unidades de Medida
          </h1>
          <p className="text-fg-muted font-medium">
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
            <tr className="bg-bg-muted border-b border-border-subtle text-[10px] uppercase font-black text-fg-subtle">
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
                    <span className="text-xs font-bold text-fg-subtle">de</span>
                    <SearchableSelect
                      options={uomOptions()}
                      value={newRow.baseUomId || ''}
                      onChange={(v) => setNewRow({ ...newRow, baseUomId: v || null })}
                      clearable
                      placeholder="(Unidad Primaria)"
                    />
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
                onContextMenu={(e) => {
                  // openContextMenu solo hace preventDefault: mantenemos el
                  // stopPropagation que traía el hook local para no disparar
                  // menús de contenedores superiores.
                  e.stopPropagation();
                  openContextMenu(e, buildCtxItems(u));
                }}
                className="hover:bg-bg-hover transition-colors group"
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
                        <p className="font-bold text-fg-default text-sm leading-tight">{u.name}</p>
                        <Badge
                          variant="neutral"
                          className="mt-1 font-mono uppercase tracking-widest text-[9px] bg-bg-muted"
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
                      <ArrowRightLeft size={12} className="text-fg-subtle" />
                      <SearchableSelect
                        options={uomOptions(u.id)}
                        value={u.baseUomId || ''}
                        onChange={(v) =>
                          setUoms(
                            uoms.map((x) => (x.id === u.id ? { ...x, baseUomId: v || null } : x)),
                          )
                        }
                        clearable
                        placeholder="(Unidad Primaria)"
                      />
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
                        <div className="flex items-center gap-2 text-fg-muted font-bold text-xs">
                          <span className="text-fg-default">1 {u.code}</span>
                          <ArrowRightLeft size={10} className="text-fg-subtle" />
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(u.id)}
                        disabled={!canWrite}
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(u.id)}
                        disabled={!canDelete}
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {contextMenu}
    </div>
  );
};
