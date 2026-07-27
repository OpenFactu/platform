import { payrollConceptsApi } from '../api';
import type { PayrollConcept as Concept } from '../domain/payroll';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  useToast,
  Badge,
  usePopup,
  PageHeader,
  Select,
  Checkbox,
} from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { ListChecks, Plus, Pencil, Trash2, Wand2 } from 'lucide-react';
import { ApiError } from '@/shared/http';

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

// Los desplegables del formulario usan el nombre largo del tipo; KIND_LABELS es
// la versión abreviada para el Badge del listado, así que no se reutiliza aquí.
const KIND_OPTIONS = [
  { value: 'devengo', label: 'Devengo' },
  { value: 'deduccion', label: 'Deducción' },
  { value: 'aportacion_empresa', label: 'Aportación empresa' },
];
const CALC_OPTIONS = (['fixed', 'percent_of_base', 'per_hour'] as const).map((value) => ({
  value,
  label: CALC_LABELS[value],
}));

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
      const d = await payrollConceptsApi.list();
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
    try {
      if (isNew) {
        await payrollConceptsApi.create(editing);
      } else {
        await payrollConceptsApi.update(editing.id!, editing);
      }
      toast.success(isNew ? 'Concepto creado' : 'Concepto actualizado');
      setEditing(null);
      fetchAll();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error al guardar',
      );
    }
  };

  const remove = async (c: Concept) => {
    const ok = await popup.confirm({
      title: `Eliminar ${c.code}`,
      message: 'Si está en uso, se desactivará en lugar de borrar.',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await payrollConceptsApi.remove(c.id);
      toast.success('Eliminado');
      fetchAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
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
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que no hace falta duplicarlas
  // en una columna de botones.
  const rowActions = (r: Concept): RowAction[] => [
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
      <PageHeader
        title="Conceptos de nómina"
        subtitle="Catálogo de pluses, complementos y deducciones que pueden añadirse a las nóminas."
        icon={<ListChecks size={18} />}
        size="lg"
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  const d = await payrollConceptsApi.seedDefaults();
                  if (d.created === 0) {
                    toast.success('El catálogo ya estaba completo');
                  } else {
                    toast.success(`Creados ${d.created} conceptos estándar`);
                  }
                  fetchAll();
                } catch (err) {
                  toast.error(
                    err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error',
                  );
                }
              }}
              title="Crea de un click los conceptos típicos: salario base, pluses, IRPF, SS empleado y SS empresa"
            >
              <Wand2 size={14} /> Cargar catálogo estándar
            </Button>
            <Button type="button" size="sm" onClick={() => setEditing(empty())}>
              <Plus size={14} /> Nuevo concepto
            </Button>
          </div>
        }
      />

      {editing && (
        <Card className="border-border-subtle shadow-lg" noPadding>
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
              {/* Listas estáticas y cortas → Select, que sí tiene prop `label`. */}
              <Select
                label="Tipo"
                options={KIND_OPTIONS}
                value={editing.kind || 'devengo'}
                onChange={(v) => setEditing({ ...editing, kind: v as Concept['kind'] })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Select
                label="Cálculo"
                options={CALC_OPTIONS}
                value={editing.calculation || 'fixed'}
                onChange={(v) =>
                  setEditing({ ...editing, calculation: v as Concept['calculation'] })
                }
              />
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
              {/* Campos de formulario (se persisten al guardar) → Checkbox, que
                  no tiene prop `label`: se conserva el <label> envolvente. */}
              <div className="flex items-end gap-3 pb-2">
                <label className="text-sm flex items-center gap-2 select-none">
                  <Checkbox
                    checked={!!editing.taxableIrpf}
                    onChange={(checked) => setEditing({ ...editing, taxableIrpf: checked })}
                  />
                  Sujeto a IRPF
                </label>
                <label className="text-sm flex items-center gap-2 select-none">
                  <Checkbox
                    checked={!!editing.taxableSs}
                    onChange={(checked) => setEditing({ ...editing, taxableSs: checked })}
                  />
                  Sujeto a SS
                </label>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm flex items-center gap-2 select-none">
                <Checkbox
                  checked={editing.isActive ?? true}
                  onChange={(checked) => setEditing({ ...editing, isActive: checked })}
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

      <Card className="overflow-hidden border-border-subtle" noPadding>
        <Table columns={columns} data={rows} isLoading={loading} rowActions={rowActions} />
      </Card>
    </div>
  );
};

export default PayrollConcepts;
