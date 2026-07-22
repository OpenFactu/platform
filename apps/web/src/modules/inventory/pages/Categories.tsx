import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Loader, useToast, Badge } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { Layers, Plus, Trash2, Save, X, Network, Pencil } from 'lucide-react';
import { ContextMenu } from '../../../components/common/ContextMenu';
import { useContextMenu } from '../../../hooks/useContextMenu';
import { categoriesApi } from '../api';
import type { Category } from '../domain/category';

export const Categories: React.FC = () => {
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRow, setNewRow] = useState<any | null>(null);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const data = await categoriesApi.list();
      setCategories(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Error al cargar categorías');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchCategories();
  }, [user?.tenantId]);

  const handleCreate = async () => {
    if (!newRow?.name) return;
    try {
      await categoriesApi.create({
        ...newRow,
        codePrefix: newRow.codePrefix?.trim().toUpperCase() || null,
        parentId: newRow.parentId || null,
      });
      setNewRow(null);
      fetchCategories();
      toast.success('Categoría creada');
    } catch {
      toast.error('Error al crear');
    }
  };

  const handleUpdate = async (id: string, data: any) => {
    try {
      await categoriesApi.update(id, {
        ...data,
        codePrefix: data.codePrefix?.trim().toUpperCase() || null,
        parentId: data.parentId || null,
      });
      setEditingId(null);
      fetchCategories();
      toast.success('Categoría actualizada');
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar esta categoría?')) return;
    try {
      await categoriesApi.remove(id);
      fetchCategories();
      toast.success('Categoría eliminada');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const ctxMenu = useContextMenu<any>();
  const buildCtxItems = (c: any) => [
    {
      label: 'Editar',
      icon: <Pencil size={14} />,
      disabled: !canWrite,
      onClick: () => setEditingId(c.id),
    },
    {
      label: 'Eliminar',
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => handleDelete(c.id),
    },
  ];

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-blue-600 rounded-lg text-white">
              <Layers size={20} />
            </span>
            <span className="text-[10px] font-black text-blue-600 dark:text-blue-300 uppercase tracking-[0.2em]">
              Logística / Clasificación
            </span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight text-display">
            Categorías
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            Clasifica tus artículos y establece secuencias de códigos por familia.
          </p>
        </div>
        <Button
          onClick={() => setNewRow({ name: '', codePrefix: '', parentId: '' })}
          disabled={!!newRow || !canWrite}
          className="flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
        >
          <Plus size={18} /> Nueva Categoría
        </Button>
      </header>

      <Card className="overflow-hidden border-0" noPadding>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-black text-slate-400 dark:text-slate-500">
              <th className="px-6 py-4">Información Básica</th>
              <th className="px-6 py-4">Prefijo Autogeneral</th>
              <th className="px-6 py-4">Estructura</th>
              <th className="px-6 py-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {newRow && (
              <tr className="bg-blue-50/30 animate-in zoom-in-95 duration-200">
                <td className="px-4 py-3">
                  <Input
                    placeholder="Nombre (Ej: Procesadores)"
                    value={newRow.name}
                    onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
                    className="h-9 text-sm"
                  />
                </td>
                <td className="px-4 py-3">
                  <Input
                    placeholder="Ej: CPU"
                    value={newRow.codePrefix}
                    onChange={(e) => setNewRow({ ...newRow, codePrefix: e.target.value })}
                    className="h-9 uppercase font-mono text-sm"
                    maxLength={5}
                  />
                </td>
                <td className="px-4 py-3">
                  <select
                    value={newRow.parentId || ''}
                    onChange={(e) => setNewRow({ ...newRow, parentId: e.target.value || null })}
                    className="h-9 w-full bg-white dark:bg-slate-900 border rounded-lg px-2 text-xs focus:ring-2 focus:ring-blue-500/20 outline-none"
                  >
                    <option value="">-- Sin Padre --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-right space-x-1">
                  <Button size="sm" onClick={handleCreate}>
                    <Save size={14} className="mr-2" /> Guardar
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setNewRow(null)}>
                    <X size={14} />
                  </Button>
                </td>
              </tr>
            )}

            {categories.map((c) => (
              <tr
                key={c.id}
                onContextMenu={(e) => ctxMenu.open(e, c)}
                className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group"
              >
                <td className="px-6 py-3">
                  {editingId === c.id ? (
                    <Input
                      value={c.name}
                      onChange={(e) =>
                        setCategories(
                          categories.map((x) =>
                            x.id === c.id ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                      className="h-9 text-sm"
                    />
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 rounded-lg flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                        <Layers size={16} />
                      </div>
                      <p className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight">
                        {c.name}
                      </p>
                    </div>
                  )}
                </td>
                <td className="px-6 py-3">
                  {editingId === c.id ? (
                    <Input
                      value={c.codePrefix || ''}
                      onChange={(e) =>
                        setCategories(
                          categories.map((x) =>
                            x.id === c.id ? { ...x, codePrefix: e.target.value } : x,
                          ),
                        )
                      }
                      className="h-9 uppercase font-mono text-sm"
                      maxLength={5}
                    />
                  ) : c.codePrefix ? (
                    <Badge
                      variant="neutral"
                      className="font-mono tracking-widest text-[10px] bg-slate-100 dark:bg-slate-800"
                    >
                      {c.codePrefix}-XXX
                    </Badge>
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600 italic text-[10px]">
                      Sin Prefijo
                    </span>
                  )}
                </td>
                <td className="px-6 py-3">
                  {editingId === c.id ? (
                    <select
                      value={c.parentId || ''}
                      onChange={(e) =>
                        setCategories(
                          categories.map((x) =>
                            x.id === c.id ? { ...x, parentId: e.target.value || null } : x,
                          ),
                        )
                      }
                      className="h-9 w-full bg-white dark:bg-slate-900 border rounded-lg px-2 text-xs focus:ring-2 focus:ring-blue-500/20 outline-none"
                    >
                      <option value="">-- Sin Padre --</option>
                      {categories
                        .filter((x) => x.id !== c.id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-semibold">
                      <Network size={12} className="text-slate-300 dark:text-slate-600" />
                      {categories.find((p) => p.id === c.parentId)?.name || (
                        <span className="text-slate-300 dark:text-slate-600 italic">Rizoma</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-6 py-3 text-right space-x-1">
                  {editingId === c.id ? (
                    <>
                      <Button size="sm" onClick={() => handleUpdate(c.id, c)}>
                        <Save size={14} className="mr-2" /> Aplicar
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
                        <X size={14} />
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => canWrite && setEditingId(c.id)}
                        disabled={!canWrite}
                        className={`p-2 transition-all rounded-xl ${canWrite ? 'text-slate-300 dark:text-slate-600 hover:text-blue-500 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10' : 'text-slate-100 cursor-not-allowed grayscale'}`}
                      >
                        <Plus size={16} className="rotate-45" />
                      </button>
                      <button
                        onClick={() => canDelete && handleDelete(c.id)}
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
