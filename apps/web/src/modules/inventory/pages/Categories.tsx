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
  PageHeader,
} from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Layers, Plus, Trash2, Save, X, Network, Pencil } from 'lucide-react';
import { categoriesApi } from '../api';
import type { Category } from '../domain/category';
import { useI18n } from '@/i18n/I18nContext';

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
  const { t } = useI18n();
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
      toast.error(t('inventory.categories.loadError'));
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
      toast.success(t('inventory.categories.created'));
    } catch {
      toast.error(t('inventory.categories.createError'));
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
      toast.success(t('inventory.categories.updated'));
    } catch {
      toast.error(t('inventory.categories.updateError'));
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await popup.confirm({
      title: t('inventory.categories.deleteTitle'),
      message: t('inventory.categories.deleteMessage'),
      tone: 'danger',
      confirmLabel: t('inventory.categories.delete'),
    });
    if (!ok) return;
    try {
      await categoriesApi.remove(id);
      fetchCategories();
      toast.success(t('inventory.categories.deleted'));
    } catch {
      toast.error(t('inventory.categories.deleteError'));
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
      header: t('inventory.categories.columns.basicInfo'),
      cell: (c) => {
        if (c.id === NEW_ROW_ID)
          return (
            <Input
              placeholder={t('inventory.categories.namePlaceholder')}
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
      header: t('inventory.categories.columns.prefix'),
      cell: (c) => {
        if (c.id === NEW_ROW_ID)
          return (
            <Input
              placeholder={t('inventory.categories.prefixPlaceholder')}
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
          <span className="text-fg-subtle italic text-[10px]">
            {t('inventory.categories.noPrefix')}
          </span>
        );
      },
    },
    {
      header: t('inventory.categories.columns.structure'),
      cell: (c) => {
        if (c.id === NEW_ROW_ID)
          return (
            <SearchableSelect
              options={parentOptions()}
              value={newRow?.parentId || ''}
              onChange={(v) => setNewRow({ ...newRow, parentId: v || null })}
              clearable
              placeholder={t('inventory.categories.noParent')}
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
              placeholder={t('inventory.categories.noParent')}
            />
          );
        return (
          <div className="flex items-center gap-2 text-fg-muted text-xs font-semibold">
            <Network size={12} className="text-fg-subtle" />
            {categories.find((p) => p.id === c.parentId)?.name || (
              <span className="text-fg-subtle italic">{t('inventory.categories.root')}</span>
            )}
          </div>
        );
      },
    },
    {
      // Guardar/cancelar tienen que estar siempre visibles mientras se edita,
      // así que se quedan en su columna; editar y eliminar van a `rowActions`.
      header: t('inventory.categories.columns.actions'),
      align: 'right',
      width: '11rem',
      cell: (c) => {
        if (c.id === NEW_ROW_ID)
          return (
            <div className="flex items-center justify-end gap-1">
              <Button type="button" size="sm" onClick={handleCreate}>
                <Save size={14} className="mr-2" /> {t('inventory.categories.save')}
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
                <Save size={14} className="mr-2" /> {t('inventory.categories.apply')}
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
            label: t('inventory.categories.edit'),
            icon: <Pencil size={14} />,
            disabled: !canWrite,
            onClick: () => setEditingId(c.id),
          },
          {
            label: t('inventory.categories.delete'),
            icon: <Trash2 size={14} />,
            destructive: true,
            disabled: !canDelete,
            onClick: () => handleDelete(c.id),
          },
        ];

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      <PageHeader
        eyebrow={t('inventory.categories.eyebrow')}
        title={t('inventory.categories.title')}
        subtitle={t('inventory.categories.subtitle')}
        icon={<Layers size={18} />}
        size="lg"
        actions={
          <Button
            type="button"
            onClick={() => setNewRow({ name: '', codePrefix: '', parentId: '' })}
            disabled={!!newRow || !canWrite}
            className="flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
          >
            <Plus size={18} /> {t('inventory.categories.new')}
          </Button>
        }
      />

      <Card className="overflow-hidden border-0" noPadding>
        {/* La Table trae cabecera, esqueleto de carga y estado vacío: el
            <table> a mano y sus filas especiales sobraban. */}
        <Table
          className="max-md:p-3"
          columns={columns}
          data={rows}
          isLoading={loading}
          rowActions={rowActions}
          emptyMessage={t('inventory.categories.empty')}
        />
      </Card>
    </div>
  );
};
