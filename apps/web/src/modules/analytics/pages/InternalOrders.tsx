import React, { useEffect, useMemo, useState } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  DatePicker,
  Select,
  SearchableSelect,
  PageHeader,
  useToast,
  Badge,
  usePopup,
} from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Briefcase, Plus, Trash2, Pencil } from 'lucide-react';
import { PluginFieldsPanel } from '@/components/PluginFieldsPanel';
import { internalOrdersApi, costCentersApi } from '../api';

interface InternalOrder {
  id: string;
  code: string;
  name: string;
  type: 'project' | 'internal_order' | 'wbs';
  startDate: string | null;
  endDate: string | null;
  budgetAmount: string | null;
  status: 'open' | 'closed';
  costCenterId: string | null;
  notes: string | null;
  [k: string]: any;
}

const TYPE_LABELS: Record<string, string> = {
  project: 'Proyecto',
  internal_order: 'Orden interna',
  wbs: 'WBS',
};

const TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }));

const STATUS_OPTIONS = [
  { value: 'open', label: 'Abierto' },
  { value: 'closed', label: 'Cerrado' },
];

export const InternalOrders: React.FC = () => {
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

  const [rows, setRows] = useState<InternalOrder[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<InternalOrder | null>(null);
  const [form, setForm] = useState<Partial<InternalOrder>>({});
  const [pluginValues, setPluginValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const popup = usePopup();

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([internalOrdersApi.list(), costCentersApi.list()]);
      setRows((Array.isArray(r1) ? r1 : []) as unknown as InternalOrder[]);
      setCostCenters(Array.isArray(r2) ? r2 : []);
    } catch {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchAll();
  }, [user?.tenantId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ type: 'project', status: 'open' });
    setPluginValues({});
  };
  const openEdit = (r: InternalOrder) => {
    setEditing(r);
    // Partimos la fila en mitades disjuntas: los campos de plugin (p_*) van a
    // pluginValues y el resto a form. Si compartieran claves, el spread
    // { ...form, ...pluginValues } del submit pisaría los campos editados
    // con los valores originales de la fila.
    const native: Partial<InternalOrder> = {};
    const plugin: Record<string, any> = {};
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('p_')) plugin[k] = v;
      else native[k] = v;
    }
    setForm(native);
    setPluginValues(plugin);
  };
  const closeForm = () => {
    setEditing(null);
    setForm({});
    setPluginValues({});
  };

  const costCenterOptions = useMemo(
    () => costCenters.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
    [costCenters],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) {
      toast.error('Nombre es obligatorio');
      return;
    }
    setSubmitting(true);
    const payload = { ...form, ...pluginValues };
    try {
      if (editing) await internalOrdersApi.update(editing.id, payload);
      else await internalOrdersApi.create(payload);
      toast.success(editing ? 'Actualizado' : 'Creado');
      closeForm();
      fetchAll();
    } catch (err) {
      toast.error((err instanceof Error && err.message) || 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await popup.confirm({
      title: 'Eliminar proyecto',
      message: 'Esta acción no se puede deshacer.',
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await internalOrdersApi.remove(id);
      toast.success('Eliminado');
      fetchAll();
    } catch (err) {
      toast.error((err instanceof Error && err.message) || 'Error al eliminar');
    }
  };

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
      header: 'Tipo',
      cell: (r: any) => <Badge variant="info">{TYPE_LABELS[r.type] || r.type}</Badge>,
    },
    {
      header: 'Presupuesto',
      align: 'right' as const,
      cell: (r: any) =>
        r.budgetAmount ? Number(r.budgetAmount).toLocaleString('es-ES') + ' €' : '—',
    },
    {
      header: 'Estado',
      cell: (r: any) =>
        r.status === 'open' ? (
          <Badge variant="success">Abierto</Badge>
        ) : (
          <Badge variant="neutral">Cerrado</Badge>
        ),
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que los permisos se declaran
  // una vez en lugar de duplicarse entre una columna de botones y el menú.
  const rowActions = (r: InternalOrder): RowAction[] => [
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
    <div className="p-8 w-full space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title="Proyectos y órdenes internas"
        subtitle="Tercera dimensión analítica. Agrupa costes e ingresos por iniciativa, proyecto o WBS."
        icon={<Briefcase size={18} />}
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
        <Card className="border-border-subtle shadow-lg" noPadding>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Código"
                placeholder={editing ? '' : 'Auto (PRJ-0001)'}
                value={form.code || ''}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
              <Input
                label="Nombre"
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              {/* Las opciones salen de TYPE_LABELS para no repetir los valores. */}
              <Select
                label="Tipo"
                options={TYPE_OPTIONS}
                value={form.type || 'project'}
                onChange={(v) => setForm({ ...form, type: v as InternalOrder['type'] })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DatePicker
                label="Inicio"
                value={form.startDate ? form.startDate.substring(0, 10) : null}
                onChange={(v) => setForm({ ...form, startDate: v || null })}
              />
              <DatePicker
                label="Fin"
                value={form.endDate ? form.endDate.substring(0, 10) : null}
                onChange={(v) => setForm({ ...form, endDate: v || null })}
              />
              <Input
                type="number"
                step="0.01"
                label="Presupuesto (€)"
                value={form.budgetAmount || ''}
                onChange={(e) => setForm({ ...form, budgetAmount: e.target.value || null })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                {/* SearchableSelect no tiene prop `label`: se conserva el <label>,
                    con el mismo estilo que el que pinta el Select de al lado. */}
                <label className="block text-[12px] font-medium text-fg-body mb-1.5">
                  Centro de coste
                </label>
                <SearchableSelect
                  options={costCenterOptions}
                  value={form.costCenterId || ''}
                  onChange={(v) => setForm({ ...form, costCenterId: v || null })}
                  placeholder="— sin asignar —"
                  clearable
                />
              </div>
              <Select
                label="Estado"
                options={STATUS_OPTIONS}
                value={form.status || 'open'}
                onChange={(v) => setForm({ ...form, status: v as InternalOrder['status'] })}
              />
            </div>
            <Input
              label="Notas"
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />

            <PluginFieldsPanel
              tableName="InternalOrder"
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

      <Card className="overflow-hidden border-border-subtle" noPadding>
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

export default InternalOrders;
