import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Table,
  useToast,
  usePopup,
  Badge,
  SearchableSelect,
} from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Hash, Plus, Trash2, ArrowRightLeft, Save, X, Settings2, Pencil } from 'lucide-react';
import { uomApi } from '../api';
import type { Uom as UomEntity } from '../domain/uom';

/** Id sintético de la fila de alta — se anexa a `data` para que comparta
 *  columnas (y por tanto anchos) con el resto de la tabla. */
const NEW_ROW_ID = '__new';

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

  /** Filas de la tabla: las unidades más, si se está creando, la fila de alta. */
  const rows: any[] = newRow ? [...uoms, { id: NEW_ROW_ID, ...newRow }] : uoms;

  const columns: TableColumn<any>[] = [
    {
      header: 'Nombre y Código',
      cell: (u) => {
        if (u.id === NEW_ROW_ID)
          return (
            <div className="space-y-2">
              <Input
                placeholder="Nombre (Ej: Paquete)"
                value={newRow?.name ?? ''}
                onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
              />
              <Input
                placeholder="Código (Ej: pq)"
                value={newRow?.code ?? ''}
                onChange={(e) => setNewRow({ ...newRow, code: e.target.value })}
                className="font-mono uppercase"
              />
            </div>
          );
        if (editingId === u.id)
          return (
            <div className="space-y-2">
              <Input
                value={u.name}
                onChange={(e) =>
                  setUoms(uoms.map((x) => (x.id === u.id ? { ...x, name: e.target.value } : x)))
                }
              />
              <Input
                value={u.code}
                onChange={(e) =>
                  setUoms(uoms.map((x) => (x.id === u.id ? { ...x, code: e.target.value } : x)))
                }
                className="font-mono uppercase"
              />
            </div>
          );
        return (
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-bg-muted text-fg-subtle rounded-xl flex items-center justify-center text-xs font-black group-hover:bg-accent/10 group-hover:text-accent transition-colors">
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
        );
      },
    },
    {
      header: 'Conversión Logística',
      cell: (u) => {
        if (u.id === NEW_ROW_ID)
          return (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.0001"
                value={newRow?.baseValue ?? ''}
                onChange={(e) => setNewRow({ ...newRow, baseValue: e.target.value })}
                containerClassName="w-24"
                className="text-center"
              />
              <span className="text-xs font-bold text-fg-subtle">de</span>
              <SearchableSelect
                options={uomOptions()}
                value={newRow?.baseUomId || ''}
                onChange={(v) => setNewRow({ ...newRow, baseUomId: v || null })}
                clearable
                placeholder="(Unidad Primaria)"
              />
            </div>
          );
        if (editingId === u.id)
          return (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.0001"
                value={u.baseValue}
                onChange={(e) =>
                  setUoms(
                    uoms.map((x) => (x.id === u.id ? { ...x, baseValue: e.target.value } : x)),
                  )
                }
                containerClassName="w-24"
                className="text-center"
              />
              <ArrowRightLeft size={12} className="text-fg-subtle" />
              <SearchableSelect
                options={uomOptions(u.id)}
                value={u.baseUomId || ''}
                onChange={(v) =>
                  setUoms(uoms.map((x) => (x.id === u.id ? { ...x, baseUomId: v || null } : x)))
                }
                clearable
                placeholder="(Unidad Primaria)"
              />
            </div>
          );
        return !u.baseUomId ? (
          <div className="inline-flex items-center gap-2 text-success-fg bg-success-bg px-2 py-1 rounded-lg border border-success/20">
            <Settings2 size={12} />
            <span className="text-[10px] font-black uppercase tracking-widest">Unidad Base</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-fg-muted font-bold text-xs">
            <span className="text-fg-default">1 {u.code}</span>
            <ArrowRightLeft size={10} className="text-fg-subtle" />
            <span className="text-accent bg-accent/10 px-2 py-0.5 rounded-md border border-accent/20">
              {u.baseValue} {uoms.find((x) => x.id === u.baseUomId)?.code}
            </span>
          </div>
        );
      },
    },
    {
      // Guardar/cancelar tienen que estar siempre visibles mientras se edita,
      // así que se quedan en su columna; editar y eliminar van a `rowActions`.
      header: 'Acciones',
      align: 'right',
      width: '11rem',
      cell: (u) => {
        if (u.id === NEW_ROW_ID)
          return (
            <div className="flex items-center justify-end gap-1">
              <Button type="button" size="sm" onClick={handleCreate}>
                <Save size={14} className="mr-2" /> Guardar
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setNewRow(null)}>
                <X size={14} />
              </Button>
            </div>
          );
        if (editingId === u.id)
          return (
            <div className="flex items-center justify-end gap-1">
              <Button type="button" size="sm" onClick={() => handleUpdate(u.id, u)}>
                <Save size={14} className="mr-2" /> Aplicar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setEditingId(null)}
              >
                <X size={14} />
              </Button>
            </div>
          );
        return null;
      },
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que los permisos se declaran
  // una vez en lugar de duplicarse entre botones y menú contextual.
  const rowActions = (u: any): RowAction[] =>
    u.id === NEW_ROW_ID || editingId === u.id
      ? []
      : [
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
        {/* La Table trae cabecera, esqueleto de carga y estado vacío: el
            <table> a mano y sus filas especiales sobraban. */}
        <Table
          columns={columns}
          data={rows}
          isLoading={loading}
          rowActions={rowActions}
          emptyMessage="No hay unidades de medida definidas todavía."
        />
      </Card>
    </div>
  );
};
