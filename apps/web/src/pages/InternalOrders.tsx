import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Input, useToast, Badge, usePopup } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Briefcase, Plus, Trash2, Pencil } from 'lucide-react';
import { PluginFieldsPanel } from '../components/PluginFieldsPanel';

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

export const InternalOrders: React.FC = () => {
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

  const [rows, setRows] = useState<InternalOrder[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<InternalOrder | null>(null);
  const [form, setForm] = useState<Partial<InternalOrder>>({});
  const [pluginValues, setPluginValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const popup = usePopup();

  const authHeaders = { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch('/api/internal-orders', { headers: authHeaders }).then((r) => r.json()),
        fetch('/api/cost-centers', { headers: authHeaders }).then((r) => r.json()),
      ]);
      setRows(Array.isArray(r1) ? r1 : []);
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
    if (!form.name) {
      toast.error('Nombre es obligatorio');
      return;
    }
    setSubmitting(true);
    const url = editing ? `/api/internal-orders/${editing.id}` : '/api/internal-orders';
    const method = editing ? 'PATCH' : 'POST';
    try {
      const res = await fetch(url, {
        method,
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ...pluginValues }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al guardar');
        return;
      }
      toast.success(editing ? 'Actualizado' : 'Creado');
      closeForm();
      fetchAll();
    } catch {
      toast.error('Error de red');
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
      const res = await fetch(`/api/internal-orders/${id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (res.ok) {
        toast.success('Eliminado');
        fetchAll();
      } else {
        const d = await res.json();
        toast.error(d.error || 'Error al eliminar');
      }
    } catch {
      toast.error('Error de red');
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
    {
      header: 'Acciones',
      align: 'right' as const,
      cell: (r: InternalOrder) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEdit(r);
            }}
            disabled={!canWrite}
            className={`transition-colors ${canWrite ? 'text-slate-500 hover:text-blue-600' : 'text-slate-300 cursor-not-allowed'}`}
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (canDelete) handleDelete(r.id);
            }}
            disabled={!canDelete}
            className={`transition-colors ${canDelete ? 'text-slate-400 hover:text-red-500' : 'text-slate-200 cursor-not-allowed'}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  const formOpen = editing !== null || Object.keys(form).length > 0;

  return (
    <div className="p-8 w-full space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-3 tracking-tight">
            <Briefcase className="text-amber-600 dark:text-amber-300" size={32} />
            Proyectos y órdenes internas
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Tercera dimensión analítica. Agrupa costes e ingresos por iniciativa, proyecto o WBS.
          </p>
        </div>
        {canWrite && (
          <Button onClick={openCreate} className="flex items-center gap-2">
            <Plus size={18} />
            Nuevo
          </Button>
        )}
      </div>

      {formOpen && (
        <Card className="p-6 border-blue-50 shadow-lg" noPadding>
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
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tipo
                </label>
                <select
                  value={form.type || 'project'}
                  onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  <option value="project">Proyecto</option>
                  <option value="internal_order">Orden interna</option>
                  <option value="wbs">WBS</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                type="date"
                label="Inicio"
                value={form.startDate ? form.startDate.substring(0, 10) : ''}
                onChange={(e) => setForm({ ...form, startDate: e.target.value || null })}
              />
              <Input
                type="date"
                label="Fin"
                value={form.endDate ? form.endDate.substring(0, 10) : ''}
                onChange={(e) => setForm({ ...form, endDate: e.target.value || null })}
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
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Centro de coste
                </label>
                <select
                  value={form.costCenterId || ''}
                  onChange={(e) => setForm({ ...form, costCenterId: e.target.value || null })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  <option value="">— sin asignar —</option>
                  {costCenters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Estado
                </label>
                <select
                  value={form.status || 'open'}
                  onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  <option value="open">Abierto</option>
                  <option value="closed">Cerrado</option>
                </select>
              </div>
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

      <Card className="overflow-hidden border-slate-100 dark:border-slate-800" noPadding>
        <Table
          columns={columns}
          data={rows}
          isLoading={loading}
          onRowClick={(r: any) => openEdit(r)}
        />
      </Card>
    </div>
  );
};

export default InternalOrders;
