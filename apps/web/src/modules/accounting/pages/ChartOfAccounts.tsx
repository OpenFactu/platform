import React, { useEffect, useState } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  useToast,
  Badge,
  usePopup,
  Select,
  SearchableSelect,
  Checkbox,
} from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { BookOpen, Plus, Trash2, Pencil, Wand2 } from 'lucide-react';
import { PluginFieldsPanel } from '@/components/PluginFieldsPanel';
import { ExcelTools } from '@/components/common/ExcelTools';
import { chartOfAccountsApi } from '../api';

interface Account {
  id: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  parentId: string | null;
  isAnalytical: boolean;
  isActive: boolean;
  notes: string | null;
  [k: string]: any;
}

const TYPE_LABELS: Record<string, string> = {
  asset: 'Activo',
  liability: 'Pasivo',
  equity: 'Patrimonio',
  income: 'Ingreso',
  expense: 'Gasto',
};
// Las opciones del desplegable salen de TYPE_LABELS para no repetir la lista.
const TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }));
const TYPE_VARIANTS: Record<string, any> = {
  asset: 'success',
  liability: 'warning',
  equity: 'neutral',
  income: 'info',
  expense: 'error',
};

export const ChartOfAccounts: React.FC = () => {
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

  const [rows, setRows] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<Partial<Account>>({});
  const [pluginValues, setPluginValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const popup = usePopup();

  const fetchRows = async () => {
    setLoading(true);
    try {
      const data = await chartOfAccountsApi.list();
      setRows((Array.isArray(data) ? data : []) as unknown as Account[]);
    } catch {
      toast.error('Error al cargar plan contable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchRows();
  }, [user?.tenantId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ type: 'asset', isAnalytical: false, isActive: true });
    setPluginValues({});
  };
  const openEdit = (r: Account) => {
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
    if (!form.code || !form.name || !form.type) {
      toast.error('Código, nombre y tipo son obligatorios');
      return;
    }
    setSubmitting(true);
    const payload = { ...form, ...pluginValues };
    try {
      if (editing) await chartOfAccountsApi.update(editing.id, payload);
      else await chartOfAccountsApi.create(payload);
      toast.success(editing ? 'Cuenta actualizada' : 'Cuenta creada');
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
      title: 'Eliminar cuenta',
      message: 'Esta acción no se puede deshacer.',
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await chartOfAccountsApi.remove(id);
      toast.success('Cuenta eliminada');
      fetchRows();
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
      cell: (r: any) => (
        <Badge variant={TYPE_VARIANTS[r.type] || 'default'}>{TYPE_LABELS[r.type] || r.type}</Badge>
      ),
    },
    {
      header: 'Analítica',
      cell: (r: any) =>
        r.isAnalytical ? <Badge variant="info">Sí</Badge> : <Badge variant="neutral">No</Badge>,
    },
    {
      header: 'Estado',
      cell: (r: any) =>
        r.isActive ? (
          <Badge variant="success">Activa</Badge>
        ) : (
          <Badge variant="neutral">Inactiva</Badge>
        ),
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que los permisos se declaran
  // una vez en lugar de duplicarse.
  const rowActions = (r: Account): RowAction[] => [
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-3 tracking-tight">
            <BookOpen className="text-blue-600 dark:text-blue-300" size={32} />
            Plan contable
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Estructura jerárquica de cuentas. Una cuenta analítica obliga a informar centro de
            coste, beneficio o proyecto en los asientos.
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
            {rows.length === 0 && (
              <Button
                variant="secondary"
                onClick={async () => {
                  const ok = await popup.confirm({
                    title: 'Configurar contabilidad',
                    message:
                      'Creará un plan contable mínimo (PGC abreviado) y los mapeos de cuenta por defecto.',
                    confirmLabel: 'Continuar',
                  });
                  if (!ok) return;
                  let d;
                  try {
                    d = await chartOfAccountsApi.seed();
                  } catch (err) {
                    toast.error(
                      (err instanceof Error && err.message) || 'Error al sembrar contabilidad',
                    );
                    return;
                  }
                  toast.success(
                    `${d.accountsCreated} cuentas y ${d.mappingsCreated} mapeos creados`,
                  );
                  fetchRows();
                }}
                className="flex items-center gap-2 whitespace-nowrap"
                title="Crea el PGC abreviado y los mapeos por defecto"
              >
                <Wand2 size={16} />
                Configurar en 1 clic
              </Button>
            )}
            <ExcelTools
              data={rows}
              filename="plan-contable"
              columns={[
                { key: 'code', label: 'Código', required: true },
                { key: 'name', label: 'Nombre', required: true },
                { key: 'type', label: 'Tipo' },
                { key: 'notes', label: 'Notas' },
              ]}
              onImport={async (parsed) => {
                await chartOfAccountsApi.bulkImport(parsed);
                fetchRows();
              }}
            />
            <Button onClick={openCreate} className="flex items-center gap-2 whitespace-nowrap">
              <Plus size={16} />
              Nueva cuenta
            </Button>
          </div>
        )}
      </div>

      {formOpen && (
        <Card className="p-6 border-blue-50 shadow-lg" noPadding>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Código"
                placeholder="4300000"
                value={form.code || ''}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
              />
              <Input
                label="Nombre"
                placeholder="Clientes"
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <Select
                label="Tipo"
                options={TYPE_OPTIONS}
                value={form.type || 'asset'}
                onChange={(v) => setForm({ ...form, type: v as Account['type'] })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Cuenta padre (opcional)
                </label>
                {/* SearchableSelect y no Select: el plan contable puede tener
                    cientos de cuentas y sin buscador es inmanejable. */}
                <SearchableSelect
                  options={rows
                    .filter((r) => r.id !== editing?.id)
                    .map((r) => ({ value: r.id, label: `${r.code} — ${r.name}` }))}
                  value={form.parentId || ''}
                  onChange={(v) => setForm({ ...form, parentId: v || null })}
                  placeholder="— sin padre —"
                  clearable
                />
              </div>
              <Input
                label="Notas"
                placeholder="Notas internas"
                value={form.notes || ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            {/* Checkbox y no Switch: son campos del formulario, no se persisten
                hasta pulsar Guardar. El <label> se queda porque Checkbox no
                tiene prop `label` — renderiza solo el input. */}
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={!!form.isAnalytical}
                  onChange={(checked) => setForm({ ...form, isAnalytical: checked })}
                />
                Cuenta analítica (exige dimensión)
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={form.isActive !== false}
                  onChange={(checked) => setForm({ ...form, isActive: checked })}
                />
                Activa
              </label>
            </div>

            <PluginFieldsPanel
              tableName="ChartOfAccount"
              values={pluginValues}
              onChange={(k, v) => setPluginValues((prev) => ({ ...prev, [k]: v }))}
              layout="inline"
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={closeForm}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {editing ? 'Guardar cambios' : 'Crear cuenta'}
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
          rowActions={rowActions}
          onRowClick={(r: any) => openEdit(r)}
        />
      </Card>
    </div>
  );
};

export default ChartOfAccounts;
