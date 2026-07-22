import { hrApi } from '../api';
import React, { useEffect, useMemo, useState } from 'react';
import { Table, Card, Button, Input, useToast, Badge, usePopup } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { ListChecks, Plus, Pencil, Trash2, Wand2 } from 'lucide-react';
import { ContextMenu } from '@/components/common/ContextMenu';
import { withRowContextMenu } from '@/components/common/withRowContextMenu';
import { useContextMenu } from '@/hooks/useContextMenu';

interface Concept {
  id: string;
  code: string;
  name: string;
  kind: 'devengo' | 'deduccion' | 'aportacion_empresa';
  taxableIrpf: boolean;
  taxableSs: boolean;
  calculation: 'fixed' | 'percent_of_base' | 'per_hour';
  defaultAmount: string | null;
  defaultPercent: string | null;
  isActive: boolean;
}

const KIND_LABELS: Record<Concept['kind'], string> = {
  devengo: 'Devengo',
  deduccion: 'Deducción',
  aportacion_empresa: 'Apt. Empresa',
};
const KIND_VARIANTS: Record<Concept['kind'], any> = {
  devengo: 'success',
  deduccion: 'warning',
  aportacion_empresa: 'info',
};
const CALC_LABELS: Record<Concept['calculation'], string> = {
  fixed: 'Fijo',
  percent_of_base: '% sobre base',
  per_hour: 'Por hora',
};

const empty = (): Partial<Concept> => ({
  code: '',
  name: '',
  kind: 'devengo',
  taxableIrpf: true,
  taxableSs: true,
  calculation: 'fixed',
  defaultAmount: null,
  defaultPercent: null,
  isActive: true,
});

export const PayrollConcepts: React.FC = () => {
  const { token, user } = useAuth();
  const [rows, setRows] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Concept> | null>(null);
  const toast = useToast();
  const popup = usePopup();
  const fetchAll = async () => {
    setLoading(true);
    try {
      const d = await hrApi.get('/api/hr/payroll-concepts');
      setRows(Array.isArray(d) ? d : []);
    } catch {
      toast.error('Error al cargar conceptos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchAll();
  }, [user?.tenantId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!editing.code || !editing.name || !editing.kind) {
      toast.error('Código, nombre y tipo son obligatorios');
      return;
    }
    const isNew = !editing.id;
    const url = isNew ? '/api/hr/payroll-concepts' : `/api/hr/payroll-concepts/${editing.id}`;
    const method = isNew ? 'POST' : 'PATCH';
    const res = await hrApi.raw(method, url, editing);
    const data = res.data;
    if (!res.ok) {
      toast.error(data.error || 'Error al guardar');
      return;
    }
    toast.success(isNew ? 'Concepto creado' : 'Concepto actualizado');
    setEditing(null);
    fetchAll();
  };

  const remove = async (c: Concept) => {
    const ok = await popup.confirm({
      title: `Eliminar ${c.code}`,
      message: 'Si está en uso, se desactivará en lugar de borrar.',
      tone: 'danger',
    });
    if (!ok) return;
    const r = await hrApi.raw('DELETE', `/api/hr/payroll-concepts/${c.id}`);
    if (r.ok) {
      toast.success('Eliminado');
      fetchAll();
    } else {
      const d = r.data;
      toast.error(d.error || 'Error');
    }
  };

  const columns = [
    { header: 'Código', cell: (r: Concept) => <code className="text-xs">{r.code}</code> },
    { header: 'Nombre', cell: (r: Concept) => r.name },
    {
      header: 'Tipo',
      cell: (r: Concept) => <Badge variant={KIND_VARIANTS[r.kind]}>{KIND_LABELS[r.kind]}</Badge>,
    },
    { header: 'Cálculo', cell: (r: Concept) => CALC_LABELS[r.calculation] },
    {
      header: 'IRPF',
      cell: (r: Concept) => (r.taxableIrpf ? 'Sí' : 'No'),
    },
    {
      header: 'SS',
      cell: (r: Concept) => (r.taxableSs ? 'Sí' : 'No'),
    },
    {
      header: 'Activo',
      cell: (r: Concept) => (r.isActive ? 'Sí' : 'No'),
    },
    {
      header: 'Acciones',
      align: 'right' as const,
      cell: (r: Concept) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setEditing(r)}
            className="text-slate-500 hover:text-indigo-600"
            title="Editar"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={() => remove(r)}
            className="text-slate-400 hover:text-red-500"
            title="Eliminar"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  const ctxMenu = useContextMenu<Concept>();
  const ctxColumns = withRowContextMenu(columns, (e, item) => ctxMenu.open(e, item));
  const buildCtxItems = (r: Concept) => [
    { label: 'Editar', icon: <Pencil size={14} />, onClick: () => setEditing(r) },
    {
      label: 'Eliminar',
      icon: <Trash2 size={14} />,
      destructive: true,
      onClick: () => remove(r),
    },
  ];

  return (
    <div className="p-4 w-full space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-3 tracking-tight">
            <ListChecks className="text-indigo-600 dark:text-indigo-300" size={32} />
            Conceptos de nómina
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Catálogo de pluses, complementos y deducciones que pueden añadirse a las nóminas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              const r = await hrApi.raw('POST', '/api/hr/payroll-concepts/seed-defaults');
              const d = (r.data ?? {});
              if (!r.ok) {
                toast.error(d.error || 'Error');
                return;
              }
              if (d.created === 0) {
                toast.success('El catálogo ya estaba completo');
              } else {
                toast.success(`Creados ${d.created} conceptos estándar`);
              }
              fetchAll();
            }}
            title="Crea de un click los conceptos típicos: salario base, pluses, IRPF, SS empleado y SS empresa"
          >
            <Wand2 size={14} /> Cargar catálogo estándar
          </Button>
          <Button size="sm" onClick={() => setEditing(empty())}>
            <Plus size={14} /> Nuevo concepto
          </Button>
        </div>
      </div>

      {editing && (
        <Card className="p-6 border-blue-50 shadow-lg" noPadding>
          <form onSubmit={save} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Input
                label="Código"
                value={editing.code || ''}
                onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                required
              />
              <div className="md:col-span-2">
                <Input
                  label="Nombre"
                  value={editing.name || ''}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tipo
                </label>
                <select
                  value={editing.kind}
                  onChange={(e) => setEditing({ ...editing, kind: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  <option value="devengo">Devengo</option>
                  <option value="deduccion">Deducción</option>
                  <option value="aportacion_empresa">Aportación empresa</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Cálculo
                </label>
                <select
                  value={editing.calculation}
                  onChange={(e) => setEditing({ ...editing, calculation: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  <option value="fixed">Fijo</option>
                  <option value="percent_of_base">% sobre base</option>
                  <option value="per_hour">Por hora</option>
                </select>
              </div>
              <Input
                type="number"
                step="0.01"
                label="Importe por defecto"
                value={editing.defaultAmount ?? ''}
                onChange={(e) => setEditing({ ...editing, defaultAmount: e.target.value || null })}
              />
              <Input
                type="number"
                step="0.001"
                label="% por defecto"
                value={editing.defaultPercent ?? ''}
                onChange={(e) => setEditing({ ...editing, defaultPercent: e.target.value || null })}
              />
              <div className="flex items-end gap-3 pb-2">
                <label className="text-sm flex items-center gap-2 select-none">
                  <input
                    type="checkbox"
                    checked={!!editing.taxableIrpf}
                    onChange={(e) => setEditing({ ...editing, taxableIrpf: e.target.checked })}
                  />
                  Sujeto a IRPF
                </label>
                <label className="text-sm flex items-center gap-2 select-none">
                  <input
                    type="checkbox"
                    checked={!!editing.taxableSs}
                    onChange={(e) => setEditing({ ...editing, taxableSs: e.target.checked })}
                  />
                  Sujeto a SS
                </label>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm flex items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={editing.isActive ?? true}
                  onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                />
                Activo
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden border-slate-100 dark:border-slate-800" noPadding>
        <Table columns={ctxColumns} data={rows} isLoading={loading} />
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

export default PayrollConcepts;
