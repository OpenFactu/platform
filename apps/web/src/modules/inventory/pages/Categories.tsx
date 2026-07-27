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
import { Layers, Plus, Trash2, Save, X, Network, Pencil } from 'lucide-react';
import { categoriesApi } from '../api';
import type { Category } from '../domain/category';

/** Id sintético de la fila de alta — se anexa a `data` para que comparta
 *  columnas (y por tanto anchos) con el resto de la tabla. */
const NEW_ROW_ID = '__new';

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
  const popup = usePopup();
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
    const ok = await popup.confirm({
      title: 'Eliminar categoría',
      message: '¿Seguro que deseas eliminar esta categoría?',
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await categoriesApi.remove(id);
      fetchCategories();
      toast.success('Categoría eliminada');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  /** Opciones del selector de categoría padre — `excludeId` evita que una
   *  categoría se elija como padre de sí misma. */
  const parentOptions = (excludeId?: string) =>
    categories
      .filter((x) => !excludeId || x.id !== excludeId)
      .map((x) => ({ value: x.id, label: x.name }));

  /** Filas de la tabla: las categorías más, si se está creando, la fila de alta. */
  const rows: any[] = newRow ? [...categories, { id: NEW_ROW_ID, ...newRow }] : categories;

  const columns: TableColumn<any>[] = [
    {
      header: 'Información Básica',
      cell: (c) => {
        if (c.id === NEW_ROW_ID)
          return (
            <Input
              placeholder="Nombre (Ej: Procesadores)"
              value={newRow?.name ?? ''}
              onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
            />
          );
        if (editingId === c.id)
          return (
            <Input
              value={c.name}
              onChange={(e) =>
                setCategories(
                  categories.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)),
                )
              }
            />
          );
        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-bg-muted text-fg-subtle rounded-lg flex items-center justify-center group-hover:bg-accent/10 group-hover:text-accent transition-colors">
              <Layers size={16} />
            </div>
            <p className="font-bold text-fg-default text-sm leading-tight">{c.name}</p>
          </div>
        );
      },
    },
    {
      header: 'Prefijo Autogeneral',
      cell: (c) => {
        if (c.id === NEW_ROW_ID)
          return (
            <Input
              placeholder="Ej: CPU"
              value={newRow?.codePrefix ?? ''}
              onChange={(e) => setNewRow({ ...newRow, codePrefix: e.target.value })}
              className="uppercase font-mono"
              maxLength={5}
            />
          );
        if (editingId === c.id)
          return (
            <Input
              value={c.codePrefix || ''}
              onChange={(e) =>
                setCategories(
                  categories.map((x) => (x.id === c.id ? { ...x, codePrefix: e.target.value } : x)),
                )
              }
              className="uppercase font-mono"
              maxLength={5}
            />
          );
        return c.codePrefix ? (
          <Badge variant="neutral" className="font-mono tracking-widest text-[10px] bg-bg-muted">
            {c.codePrefix}-XXX
          </Badge>
        ) : (
          <span className="text-fg-subtle italic text-[10px]">Sin Prefijo</span>
        );
      },
    },
    {
      header: 'Estructura',
      cell: (c) => {
        if (c.id === NEW_ROW_ID)
          return (
            <SearchableSelect
              options={parentOptions()}
              value={newRow?.parentId || ''}
              onChange={(v) => setNewRow({ ...newRow, parentId: v || null })}
              clearable
              placeholder="-- Sin Padre --"
            />
          );
        if (editingId === c.id)
          return (
            <SearchableSelect
              options={parentOptions(c.id)}
              value={c.parentId || ''}
              onChange={(v) =>
                setCategories(
                  categories.map((x) => (x.id === c.id ? { ...x, parentId: v || null } : x)),
                )
              }
              clearable
              placeholder="-- Sin Padre --"
            />
          );
        return (
          <div className="flex items-center gap-2 text-fg-muted text-xs font-semibold">
            <Network size={12} className="text-fg-subtle" />
            {categories.find((p) => p.id === c.parentId)?.name || (
              <span className="text-fg-subtle italic">Rizoma</span>
            )}
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
      cell: (c) => {
        if (c.id === NEW_ROW_ID)
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
        if (editingId === c.id)
          return (
            <div className="flex items-center justify-end gap-1">
              <Button type="button" size="sm" onClick={() => handleUpdate(c.id, c)}>
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
  const rowActions = (c: any): RowAction[] =>
    c.id === NEW_ROW_ID || editingId === c.id
      ? []
      : [
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
          <h1 className="text-4xl font-black text-fg-default tracking-tight text-display">
            Categorías
          </h1>
          <p className="text-fg-muted font-medium">
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
        {/* La Table trae cabecera, esqueleto de carga y estado vacío: el
            <table> a mano y sus filas especiales sobraban. */}
        <Table
          columns={columns}
          data={rows}
          isLoading={loading}
          rowActions={rowActions}
          emptyMessage="No hay categorías definidas todavía."
        />
      </Card>
    </div>
  );
};
