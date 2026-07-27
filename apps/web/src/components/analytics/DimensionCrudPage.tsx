import React, { useEffect, useState } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  SearchableSelect,
  Checkbox,
  PageHeader,
  useToast,
  Badge,
  usePopup,
} from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { PluginFieldsPanel } from '../PluginFieldsPanel';
import { crudApi } from '@/shared/api';

interface DimensionRow {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  managerEmployeeId: string | null;
  isActive: boolean;
  notes: string | null;
  [k: string]: any;
}

interface Props {
  endpoint: string;
  tableName: string; // Nombre exacto de la tabla DB — usado por PluginFieldsPanel
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  /** Si true, el código es opcional en UI y lo genera el backend. */
  autoCode?: boolean;
  /** Placeholder de ejemplo del código (para cuando NO es autoCode). */
  codePlaceholder?: string;
}

/**
 * Página CRUD genérica para dimensiones analíticas jerárquicas
 * (centros de coste y centros de beneficio comparten este layout).
 */
export const DimensionCrudPage: React.FC<Props> = ({
  endpoint,
  tableName,
  title,
  subtitle,
  icon,
  autoCode,
  codePlaceholder,
}) => {
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

  const [rows, setRows] = useState<DimensionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DimensionRow | null>(null);
  const [form, setForm] = useState<Partial<DimensionRow>>({});
  const [pluginValues, setPluginValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const popup = usePopup();

  const fetchRows = async () => {
    setLoading(true);
    try {
      const data = await crudApi.list<DimensionRow>(endpoint);
      setRows(Array.isArray(data) ? data : []);
    } catch {
      toast.error(`Error al cargar ${title.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchRows();
  }, [user?.tenantId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ isActive: true });
    setPluginValues({});
  };
  const openEdit = (r: DimensionRow) => {
    setEditing(r);
    setForm(r);
    setPluginValues(r);
  };
  const closeForm = () => {
    setEditing(null);
    setForm({});
    setPluginValues({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || (!autoCode && !form.code)) {
      toast.error(autoCode ? 'El nombre es obligatorio' : 'Código y nombre son obligatorios');
      return;
    }
    setSubmitting(true);
    const payload = { ...form, ...pluginValues };
    try {
      if (editing) await crudApi.update(endpoint, editing.id, payload);
      else await crudApi.create(endpoint, payload);
      toast.success(editing ? 'Actualizado' : 'Creado');
      closeForm();
      fetchRows();
    } catch (err) {
      toast.error((err instanceof Error && err.message) || 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await popup.confirm({
      title: 'Eliminar',
      message: 'Esta acción no se puede deshacer.',
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await crudApi.remove(endpoint, id);
      toast.success('Eliminado');
      fetchRows();
    } catch (err) {
      toast.error((err instanceof Error && err.message) || 'Error al eliminar');
    }
  };

  const parentMap = Object.fromEntries(rows.map((r) => [r.id, r]));

  const columns = [
    {
      header: 'Código',
      accessor: 'code',
      sortable: true,
      sortAccessor: (r: any) => r.code,
      primary: true,
    },
    { header: 'Nombre', accessor: 'name', sortable: true, sortAccessor: (r: any) => r.name },
    {
      header: 'Padre',
      cell: (r: DimensionRow) =>
        r.parentId && parentMap[r.parentId] ? (
          <span className="text-fg-muted text-xs">{parentMap[r.parentId].code}</span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      header: 'Estado',
      cell: (r: any) =>
        r.isActive ? (
          <Badge variant="success">Activo</Badge>
        ) : (
          <Badge variant="neutral">Inactivo</Badge>
        ),
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que los permisos se declaran
  // una vez en lugar de duplicarse entre una columna de botones y el menú.
  const rowActions = (r: DimensionRow): RowAction[] => [
    {
      label: 'Editar',
      icon: <Pencil size={14} />,
      disabled: !canWrite,
      onClick: () => openEdit(r),
    },
    {
      label: 'Eliminar',
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => handleDelete(r.id),
    },
  ];

  const formOpen = editing !== null || Object.keys(form).length > 0;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        size="lg"
        actions={
          canWrite && (
            <Button type="button" onClick={openCreate} className="flex items-center gap-2">
              <Plus size={18} />
              Nuevo
            </Button>
          )
        }
      />

      {formOpen && (
        <Card className="shadow-k-lg" noPadding>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Código"
                placeholder={autoCode ? 'Auto' : codePlaceholder || 'CC-001'}
                value={form.code || ''}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required={!autoCode}
              />
              <Input
                label="Nombre"
                placeholder="Oficina Madrid"
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* SearchableSelect no tiene prop `label`, de ahí el <label> a mano. */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-fg-body">Padre (opcional)</label>
                <SearchableSelect
                  value={form.parentId || ''}
                  onChange={(v) => setForm({ ...form, parentId: v || null })}
                  options={rows
                    .filter((r) => r.id !== editing?.id)
                    .map((r) => ({ value: r.id, label: r.code, secondaryLabel: r.name }))}
                  placeholder="— sin padre —"
                  emptyMessage="No hay dimensiones creadas"
                  clearable
                />
              </div>
              <Input
                label="Notas"
                value={form.notes || ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            {/* Checkbox tampoco expone `label`: se envuelve en el <label>. */}
            <label className="flex items-center gap-2 text-sm font-medium text-fg-body w-fit cursor-pointer">
              <Checkbox
                checked={form.isActive !== false}
                onChange={(checked) => setForm({ ...form, isActive: checked })}
              />
              Activo
            </label>

            <PluginFieldsPanel
              tableName={tableName}
              values={pluginValues}
              onChange={(k, v) => setPluginValues((prev) => ({ ...prev, [k]: v }))}
              layout="inline"
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={closeForm}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {editing ? 'Guardar cambios' : 'Crear'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden" noPadding>
        <Table
          columns={columns}
          data={rows}
          isLoading={loading}
          rowActions={rowActions}
          onRowClick={(r: any) => openEdit(r)}
        />
      </Card>
    </div>
  );
};
