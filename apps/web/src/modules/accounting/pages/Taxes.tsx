import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Loader, useToast, Badge } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Percent, Plus, Trash2, Edit3, Save, X, Info } from 'lucide-react';
import { ContextMenu } from '@/components/common/ContextMenu';
import { useContextMenu } from '@/hooks/useContextMenu';
import { taxesApi } from '../api';
import type { Tax } from '../domain/accounting';

export const Taxes: React.FC = () => {
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
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRow, setNewRow] = useState<{ code: string; rate: string } | null>(null);

  const fetchTaxes = async () => {
    setLoading(true);
    try {
      const data = await taxesApi.list();
      setTaxes(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Error al cargar impuestos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) {
      fetchTaxes();
    }
  }, [user?.tenantId]);

  const handleCreate = async () => {
    if (!newRow || !newRow.code || !newRow.rate) return;
    try {
      await taxesApi.create(newRow);
      toast.success('Impuesto creado');
      setNewRow(null);
      fetchTaxes();
    } catch {
      toast.error('Error al crear impuesto');
    }
  };

  const handleUpdate = async (id: string, code: string, rate: string) => {
    try {
      await taxesApi.update(id, { code, rate });
      toast.success('Impuesto actualizado');
      setEditingId(null);
      fetchTaxes();
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        '¿Seguro que deseas eliminar este tipo de IVA? Esto podría afectar a los documentos que lo usen.',
      )
    )
      return;
    try {
      await taxesApi.remove(id);
      toast.success('Impuesto eliminado');
      fetchTaxes();
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const ctxMenu = useContextMenu<Tax>();
  const buildCtxItems = (t: Tax) => [
    {
      label: 'Editar',
      icon: <Edit3 size={14} />,
      disabled: !canWrite,
      onClick: () => setEditingId(t.id),
    },
    {
      label: 'Eliminar',
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => handleDelete(t.id),
    },
  ];

  return (
    <div className="p-8 w-full space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-amber-600 rounded-lg text-white">
              <Percent size={20} />
            </span>
            <span className="text-[10px] font-black text-amber-600 dark:text-amber-300 uppercase tracking-[0.2em]">
              Finanzas / Configuración
            </span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Gestión de Impuestos
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            Configura los tipos de IVA y retenciones aplicables a tus documentos.
          </p>
        </div>
        <Button
          onClick={() => setNewRow({ code: '', rate: '' })}
          disabled={!!newRow || !canWrite}
          className="flex items-center gap-2 disabled:opacity-50 disabled:grayscale transition-all"
        >
          <Plus size={18} /> Nuevo Impuesto
        </Button>
      </header>

      <div className="p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/30 rounded-2xl flex items-start gap-4 text-blue-800 dark:text-blue-300">
        <div className="p-2 bg-blue-100 dark:bg-blue-500/20 rounded-xl text-blue-600 dark:text-blue-300">
          <Info size={20} />
        </div>
        <div className="text-sm">
          <p className="font-black uppercase text-[10px] mb-1">Nota importante</p>
          <p className="font-medium opacity-80">
            Los impuestos definidos aquí aparecerán automáticamente en la selección de líneas de
            Pedidos, Albaranes y Facturas. El sistema calculará la cuota de IVA basándose en el
            porcentaje aquí definido.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden border-0" noPadding>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-black text-slate-400 dark:text-slate-400">
              <th className="p-6">Código / Identificador</th>
              <th className="p-6 text-center">Porcentaje (%)</th>
              <th className="p-6 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {/* New Row Placeholder */}
            {newRow && (
              <tr className="bg-blue-50/30 dark:bg-blue-500/5 animate-in zoom-in-95 duration-200">
                <td className="p-4">
                  <Input
                    placeholder="Ej: IVA_21"
                    value={newRow.code}
                    onChange={(e) => setNewRow({ ...newRow, code: e.target.value })}
                    className="h-10"
                  />
                </td>
                <td className="p-4">
                  <Input
                    type="number"
                    placeholder="21"
                    value={newRow.rate}
                    onChange={(e) => setNewRow({ ...newRow, rate: e.target.value })}
                    className="h-10 text-center"
                  />
                </td>
                <td className="p-4 text-right space-x-2">
                  <Button size="sm" onClick={handleCreate} className="h-10 gap-2">
                    <Save size={14} /> Guardar
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setNewRow(null)}
                    className="h-10"
                  >
                    <X size={14} />
                  </Button>
                </td>
              </tr>
            )}

            {taxes.map((t) => (
              <tr
                key={t.id}
                onContextMenu={(e) => ctxMenu.open(e, t)}
                className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors group"
              >
                <td className="p-6">
                  {editingId === t.id ? (
                    <Input
                      value={t.code}
                      onChange={(e) =>
                        setTaxes(
                          taxes.map((x) => (x.id === t.id ? { ...x, code: e.target.value } : x)),
                        )
                      }
                      className="h-10"
                    />
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 dark:text-slate-400 group-hover:bg-amber-100 dark:group-hover:bg-amber-500/20 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        <Percent size={18} />
                      </div>
                      <div>
                        <p className="font-black text-slate-800 dark:text-slate-100">{t.code}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-400 font-bold uppercase">
                          Identificador Maestro
                        </p>
                      </div>
                    </div>
                  )}
                </td>
                <td className="p-6 text-center">
                  {editingId === t.id ? (
                    <Input
                      type="number"
                      value={t.rate}
                      onChange={(e) =>
                        setTaxes(
                          taxes.map((x) => (x.id === t.id ? { ...x, rate: e.target.value } : x)),
                        )
                      }
                      className="h-10 text-center"
                    />
                  ) : (
                    <Badge variant="neutral" className="text-lg py-1 px-3 h-9">
                      {t.rate}%
                    </Badge>
                  )}
                </td>
                <td className="p-6 text-right space-x-2">
                  {editingId === t.id ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(t.id, t.code, String(t.rate))}
                        className="h-10 gap-2"
                      >
                        <Save size={14} /> Aplicar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditingId(null)}
                        className="h-10"
                      >
                        <X size={14} />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => canWrite && setEditingId(t.id)}
                        disabled={!canWrite}
                        className="h-10 border-transparent hover:bg-amber-50 dark:hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-300 transition-all disabled:opacity-30 disabled:grayscale"
                      >
                        <Edit3 size={16} />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => canDelete && handleDelete(t.id)}
                        disabled={!canDelete}
                        className="h-10 border-transparent hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300 transition-all disabled:opacity-30 disabled:grayscale"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}

            {!loading && taxes.length === 0 && !newRow && (
              <tr>
                <td colSpan={3} className="p-20 text-center text-slate-400 dark:text-slate-500">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center text-slate-200">
                      <Percent size={32} />
                    </div>
                    <p className="font-medium">No hay impuestos definidos todavía.</p>
                    <Button variant="secondary" onClick={() => setNewRow({ code: '', rate: '' })}>
                      Configurar el primer impuesto
                    </Button>
                  </div>
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={3} className="p-20 text-center">
                  <Loader size="lg" />
                  <p className="text-slate-400 dark:text-slate-500 mt-4 font-medium italic">
                    Sincronizando con el servidor...
                  </p>
                </td>
              </tr>
            )}
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
