import { paymentTermsApi } from '../api';
import { ApiError } from '@/shared/http';
import React, { useEffect, useState } from 'react';
import {
  Button,
  Input,
  Table,
  useToast,
  usePopup,
  Badge,
  Checkbox,
  NumberInput,
  PercentInput,
} from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import { Plus, Trash2, Edit3, Check, X, CalendarClock, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { PaymentTerm, PaymentTermLine as SplitLine } from '../domain/accounting';

/**
 * Editor dedicado para plazos de pago. Permite listar, crear, editar
 * (incluyendo los splits `{days, percentage}`) y eliminar plazos. Valida
 * que la suma de porcentajes sea 100 antes de guardar.
 */
export const PaymentTermsEditor: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const [rows, setRows] = useState<PaymentTerm[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await paymentTermsApi.list();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Error al cargar plazos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const openEditor = (term: PaymentTerm | null) => {
    popup.show({
      title: term ? `Editar plazo · ${term.name}` : 'Nuevo plazo de pago',
      subtitle: 'Define los splits. La suma de porcentajes debe ser exactamente 100.',
      maxWidth: '2xl',
      render: (close) => (
        <PaymentTermForm
          initial={term}
          onSaved={async () => {
            close();
            await load();
          }}
          onCancel={() => close()}
        />
      ),
    });
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await popup.confirm({
      title: 'Eliminar plazo',
      message: `¿Seguro que quieres eliminar "${name}"? No se podrá usar en nuevos documentos.`,
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await paymentTermsApi.remove(id);
      toast.success('Eliminado');
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? ((e.body as any)?.error ?? e.message) : 'Error de red');
    }
  };

  const renderSummary = (t: PaymentTerm) => {
    if (!t.lines || t.lines.length === 0)
      return <span className="text-fg-subtle italic">sin splits</span>;
    if (t.lines.length === 1) {
      const l = t.lines[0];
      return (
        <span className="font-mono text-xs">
          {l.days}d · {l.percentage}%
        </span>
      );
    }
    return (
      <span className="font-mono text-xs">
        {t.lines.map((l) => `${l.days}d·${l.percentage}%`).join(' + ')}
      </span>
    );
  };

  const columns: TableColumn<PaymentTerm>[] = [
    { header: 'Nombre', accessor: 'name', sortable: true },
    { header: 'Detalle', cell: (t) => renderSummary(t) },
    {
      header: 'Activo',
      align: 'center',
      cell: (t) =>
        t.isActive ? <Badge variant="success">✓</Badge> : <Badge variant="neutral">—</Badge>,
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho.
  const rowActions = (t: PaymentTerm): RowAction[] => [
    { label: 'Editar', icon: <Edit3 size={14} />, onClick: () => openEditor(t) },
    {
      label: 'Eliminar',
      icon: <Trash2 size={14} />,
      destructive: true,
      onClick: () => handleDelete(t.id, t.name),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-fg-subtle uppercase font-black tracking-wider">
          Contado, 30 días, 30/60…
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => openEditor(null)}
          className="flex items-center gap-1"
        >
          <Plus size={14} /> Añadir
        </Button>
      </div>

      {/* La Table trae cabecera, "cargando" y estado vacío: las tres ramas del
          antiguo <tbody> sobraban. */}
      <Table
        columns={columns}
        data={rows}
        isLoading={loading}
        rowActions={rowActions}
        emptyMessage="Sin plazos definidos"
      />
    </div>
  );
};

interface FormProps {
  initial: PaymentTerm | null;
  onSaved: () => void;
  onCancel: () => void;
}

const PaymentTermForm: React.FC<FormProps> = ({ initial, onSaved, onCancel }) => {
  const toast = useToast();
  const [name, setName] = useState(initial?.name || '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [lines, setLines] = useState<SplitLine[]>(
    initial?.lines && initial.lines.length > 0 ? initial.lines : [{ days: 0, percentage: 100 }],
  );
  const [saving, setSaving] = useState(false);

  const totalPct = lines.reduce((s, l) => s + Number(l.percentage || 0), 0);
  const balanced = Math.abs(totalPct - 100) < 0.01;

  const updateLine = (i: number, patch: Partial<SplitLine>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    // Al añadir, reparte el porcentaje restante (si hay).
    const remaining = Math.max(0, 100 - totalPct);
    const defaultDays = lines.length > 0 ? lines[lines.length - 1].days + 30 : 30;
    setLines([...lines, { days: defaultDays, percentage: remaining }]);
  };

  const removeLine = (i: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, idx) => idx !== i));
  };

  const autoBalance = () => {
    if (lines.length === 0) return;
    const even = Math.round((100 / lines.length) * 100) / 100;
    const last = Math.round((100 - even * (lines.length - 1)) * 100) / 100;
    setLines(
      lines.map((l, i) => ({
        ...l,
        percentage: i === lines.length - 1 ? last : even,
      })),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Nombre obligatorio');
      return;
    }
    if (!balanced) {
      toast.error(`Los porcentajes suman ${totalPct}%, deben sumar 100`);
      return;
    }
    for (const l of lines) {
      if (l.days < 0) {
        toast.error('Los días no pueden ser negativos');
        return;
      }
      if (l.percentage <= 0) {
        toast.error('Los porcentajes deben ser mayores que 0');
        return;
      }
    }
    setSaving(true);
    try {
      const payload = { name, lines, isActive };
      if (initial) await paymentTermsApi.update(initial.id, payload);
      else await paymentTermsApi.create(payload);
      toast.success(initial ? 'Actualizado' : 'Creado');
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? ((e.body as any)?.error ?? e.message) : 'Error de red');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <Input
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. 30/60/90"
            required
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <Checkbox checked={isActive} onChange={setIsActive} />
            Activo
          </label>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-black uppercase tracking-wider text-fg-muted flex items-center gap-2">
            <CalendarClock size={14} /> Splits
          </label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={autoBalance}>
              Repartir al {(100 / lines.length).toFixed(0)}%
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={addLine}>
              <Plus size={12} className="mr-1" /> Split
            </Button>
          </div>
        </div>

        {/* Rejilla editable (días y porcentaje por split, con alta/baja de
            líneas en caliente): se queda como <table> a mano — la Table del
            paquete es de solo lectura. */}
        <div className="border border-border-default rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-muted text-[10px] font-black uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left py-2 px-3 w-12">#</th>
                <th className="text-left py-2 px-3">Días desde la factura</th>
                <th className="text-left py-2 px-3">% del total</th>
                <th className="py-2 px-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t border-border-subtle">
                  <td className="py-2 px-3 text-slate-400 font-mono">{i + 1}</td>
                  <td className="py-2 px-3">
                    <NumberInput
                      value={l.days}
                      onChange={(v) => updateLine(i, { days: v ?? 0 })}
                      min={0}
                      emptyValue="zero"
                      inputSize="sm"
                      containerClassName="w-28"
                    />
                  </td>
                  <td className="py-2 px-3">
                    {/* PercentInput ya pone el sufijo %, los 2 decimales y el
                        límite 0–100; el <span>%</span> de al lado sobraba. */}
                    <PercentInput
                      value={l.percentage}
                      onChange={(v) => updateLine(i, { percentage: v ?? 0 })}
                      emptyValue="zero"
                      inputSize="sm"
                      containerClassName="w-28"
                    />
                  </td>
                  <td className="py-2 px-3 text-right">
                    {lines.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLine(i)}
                        title="Quitar plazo"
                      >
                        <Trash2 size={13} />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-bg-muted font-black">
                <td colSpan={2} className="py-2 px-3 text-right text-xs uppercase">
                  Total porcentajes:
                </td>
                <td className="py-2 px-3">
                  <span
                    className={`inline-flex items-center gap-1 font-mono ${
                      balanced ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {totalPct.toFixed(2)}%
                    {balanced ? <Check size={14} /> : <AlertCircle size={14} />}
                  </span>
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {!balanced && (
          <p className="text-xs text-rose-600 dark:text-rose-400 mt-2 flex items-center gap-1">
            <AlertCircle size={12} />
            La suma de porcentajes debe ser exactamente 100. Faltan{' '}
            {Math.abs(100 - totalPct).toFixed(2)}%.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          <X size={14} className="mr-1" /> Cancelar
        </Button>
        <Button type="submit" disabled={saving || !balanced || !name.trim()}>
          <Check size={14} className="mr-1" />
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
};
