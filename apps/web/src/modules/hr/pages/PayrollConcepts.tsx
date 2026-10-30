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
import { useI18n } from '@/i18n/I18nContext';

// Etiquetas como claves de i18n; se traducen al pintar.
const KIND_LABELS: Record<Concept['kind'], string> = {
  devengo: 'hrPayroll.concepts.kindShort.devengo',
  deduccion: 'hrPayroll.concepts.kindShort.deduccion',
  aportacion_empresa: 'hrPayroll.concepts.kindShort.aportacionEmpresa',
};
const KIND_VARIANTS: Record<Concept['kind'], any> = {
  devengo: 'success',
  deduccion: 'warning',
  aportacion_empresa: 'info',
};
const CALC_LABELS: Record<Concept['calculation'], string> = {
  fixed: 'hrPayroll.concepts.calc.fixed',
  percent_of_base: 'hrPayroll.concepts.calc.percentOfBase',
  per_hour: 'hrPayroll.concepts.calc.perHour',
};

// Los desplegables del formulario usan el nombre largo del tipo; KIND_LABELS es
// la versión abreviada para el Badge del listado, así que no se reutiliza aquí.
const KIND_OPTIONS = [
  { value: 'devengo', label: 'hrPayroll.concepts.kind.devengo' },
  { value: 'deduccion', label: 'hrPayroll.concepts.kind.deduccion' },
  { value: 'aportacion_empresa', label: 'hrPayroll.concepts.kind.aportacionEmpresa' },
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
  const { t } = useI18n();
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
      toast.error(t('hrPayroll.concepts.loadFailed'));
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
      toast.error(t('hrPayroll.concepts.required'));
      return;
    }
    const isNew = !editing.id;
    try {
      if (isNew) {
        await payrollConceptsApi.create(editing);
      } else {
        await payrollConceptsApi.update(editing.id!, editing);
      }
      toast.success(isNew ? t('hrPayroll.concepts.created') : t('hrPayroll.concepts.updated'));
      setEditing(null);
      fetchAll();
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? ((err.body as any)?.error ?? err.message)
          : t('hrPayroll.concepts.saveError'),
      );
    }
  };

  const remove = async (c: Concept) => {
    const ok = await popup.confirm({
      title: t('hrPayroll.concepts.deleteTitle', { code: c.code }),
      message: t('hrPayroll.concepts.deleteMessage'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await payrollConceptsApi.remove(c.id);
      toast.success(t('hr.common.deleted'));
      fetchAll();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : t('hr.common.error'),
      );
    }
  };

  const columns = [
    {
      header: t('hr.common.code'),
      cell: (r: Concept) => <code className="text-xs">{r.code}</code>,
    },
    { header: t('hr.common.name'), cell: (r: Concept) => r.name },
    {
      header: t('hr.incidents.type'),
      cell: (r: Concept) => <Badge variant={KIND_VARIANTS[r.kind]}>{t(KIND_LABELS[r.kind])}</Badge>,
    },
    {
      header: t('hrPayroll.concepts.calculation'),
      cell: (r: Concept) => t(CALC_LABELS[r.calculation]),
    },
    {
      header: 'IRPF',
      cell: (r: Concept) => (r.taxableIrpf ? t('hr.common.yes') : t('hr.common.no')),
    },
    {
      header: 'SS',
      cell: (r: Concept) => (r.taxableSs ? t('hr.common.yes') : t('hr.common.no')),
    },
    {
      header: t('hr.common.active'),
      cell: (r: Concept) => (r.isActive ? t('hr.common.yes') : t('hr.common.no')),
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que no hace falta duplicarlas
  // en una columna de botones.
  const rowActions = (r: Concept): RowAction[] => [
    { label: t('hr.common.edit'), icon: <Pencil size={14} />, onClick: () => setEditing(r) },
    {
      label: t('hr.common.delete'),
      icon: <Trash2 size={14} />,
      destructive: true,
      onClick: () => remove(r),
    },
  ];

  return (
    <div className="p-4 w-full space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title={t('hrPayroll.concepts.title')}
        subtitle={t('hrPayroll.concepts.subtitle')}
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
                    toast.success(t('hrPayroll.concepts.seedComplete'));
                  } else {
                    toast.success(t('hrPayroll.concepts.seeded', { count: d.created }));
                  }
                  fetchAll();
                } catch (err) {
                  toast.error(
                    err instanceof ApiError
                      ? ((err.body as any)?.error ?? err.message)
                      : t('hr.common.error'),
                  );
                }
              }}
              title={t('hrPayroll.concepts.seedTitle')}
            >
              <Wand2 size={14} /> {t('hrPayroll.concepts.seed')}
            </Button>
            <Button type="button" size="sm" onClick={() => setEditing(empty())}>
              <Plus size={14} /> {t('hrPayroll.concepts.new')}
            </Button>
          </div>
        }
      />

      {editing && (
        <Card className="border-border-subtle shadow-lg" noPadding>
          <form onSubmit={save} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Input
                label={t('hr.common.code')}
                value={editing.code || ''}
                onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                required
              />
              <div className="md:col-span-2">
                <Input
                  label={t('hr.common.name')}
                  value={editing.name || ''}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  required
                />
              </div>
              {/* Listas estáticas y cortas → Select, que sí tiene prop `label`. */}
              <Select
                label={t('hr.incidents.type')}
                options={KIND_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                value={editing.kind || 'devengo'}
                onChange={(v) => setEditing({ ...editing, kind: v as Concept['kind'] })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Select
                label={t('hrPayroll.concepts.calculation')}
                options={CALC_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                value={editing.calculation || 'fixed'}
                onChange={(v) =>
                  setEditing({ ...editing, calculation: v as Concept['calculation'] })
                }
              />
              <Input
                type="number"
                step="0.01"
                label={t('hrPayroll.concepts.defaultAmount')}
                value={editing.defaultAmount ?? ''}
                onChange={(e) => setEditing({ ...editing, defaultAmount: e.target.value || null })}
              />
              <Input
                type="number"
                step="0.001"
                label={t('hrPayroll.concepts.defaultPercent')}
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
                  {t('hrPayroll.concepts.taxableIrpf')}
                </label>
                <label className="text-sm flex items-center gap-2 select-none">
                  <Checkbox
                    checked={!!editing.taxableSs}
                    onChange={(checked) => setEditing({ ...editing, taxableSs: checked })}
                  />
                  {t('hrPayroll.concepts.taxableSs')}
                </label>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm flex items-center gap-2 select-none">
                <Checkbox
                  checked={editing.isActive ?? true}
                  onChange={(checked) => setEditing({ ...editing, isActive: checked })}
                />
                {t('hr.common.active')}
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                {t('hr.common.cancel')}
              </Button>
              <Button type="submit">{t('hr.common.save')}</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden border-border-subtle" noPadding>
        <Table
          className="max-md:p-3"
          columns={columns}
          data={rows}
          isLoading={loading}
          rowActions={rowActions}
        />
      </Card>
    </div>
  );
};

export default PayrollConcepts;
