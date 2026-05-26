import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Input, useToast, Badge, usePopup } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { PluginFieldsPanel } from '../PluginFieldsPanel';

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

  const [rows, setRows] = useState<DimensionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DimensionRow | null>(null);
  const [form, setForm] = useState<Partial<DimensionRow>>({});
  const [pluginValues, setPluginValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const popup = usePopup();

  const authHeaders = { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' };

  const fetchRows = async () => {
    setLoading(true);
    try {
      const res = await fetch(endpoint, { headers: authHeaders });
      const data = await res.json();
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
    const url = editing ? `${endpoint}/${editing.id}` : endpoint;
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
      fetchRows();
    } catch {
      toast.error('Error de red');
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
      const res = await fetch(`${endpoint}/${id}`, { method: 'DELETE', headers: authHeaders });
      if (res.ok) {
        toast.success('Eliminado');
        fetchRows();
      } else {
        const d = await res.json();
        toast.error(d.error || 'Error al eliminar');
      }
    } catch {
      toast.error('Error de red');
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
          <span className="text-slate-500 text-xs">{parentMap[r.parentId].code}</span>
        ) : (
          <span className="text-slate-300">—</span>
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
    {
      header: 'Acciones',
      align: 'right' as const,
      cell: (r: DimensionRow) => (
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
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-3 tracking-tight">
            {icon}
            {title}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">{subtitle}</p>
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
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Padre (opcional)
                </label>
                <select
                  value={form.parentId || ''}
                  onChange={(e) => setForm({ ...form, parentId: e.target.value || null })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  <option value="">— sin padre —</option>
                  {rows
                    .filter((r) => r.id !== editing?.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} — {r.name}
                      </option>
                    ))}
                </select>
              </div>
              <Input
                label="Notas"
                value={form.notes || ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.isActive !== false}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
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
