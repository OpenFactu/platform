import { paymentTermsApi } from '@/modules/accounting/api';
import { ApiError } from '@/shared/http';
import React, { useEffect, useState } from 'react';
import { Button, Input, useToast, usePopup, Badge } from '@openfactu/ui';
import { Plus, Trash2, Edit3, Check, X, CalendarClock, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { PaymentTerm, PaymentTermLine as SplitLine } from '@/modules/accounting/domain/accounting';

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
      return <span className="text-slate-400 italic">sin splits</span>;
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-wider">
          Contado, 30 días, 30/60…
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => openEditor(null)}
          className="flex items-center gap-1"
        >
          <Plus size={14} /> Añadir
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left py-2">Nombre</th>
              <th className="text-left py-2">Detalle</th>
              <th className="text-center py-2 w-20">Activo</th>
              <th className="text-right py-2 w-24">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-400 italic">
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-400 italic">
                  Sin plazos definidos
                </td>
              </tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2 font-bold">{t.name}</td>
                  <td className="py-2">{renderSummary(t)}</td>
                  <td className="py-2 text-center">
                    {t.isActive ? (
                      <Badge variant="success">✓</Badge>
                    ) : (
                      <Badge variant="neutral">—</Badge>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditor(t)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded"
                        title="Editar"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(t.id, t.name)}
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Activo
          </label>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
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

        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-[10px] font-black uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left py-2 px-3 w-12">#</th>
                <th className="text-left py-2 px-3">Días desde la factura</th>
                <th className="text-left py-2 px-3">% del total</th>
                <th className="py-2 px-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2 px-3 text-slate-400 font-mono">{i + 1}</td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      min={0}
                      value={l.days}
                      onChange={(e) => updateLine(i, { days: Number(e.target.value) })}
                      className="w-28 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={l.percentage}
                        onChange={(e) => updateLine(i, { percentage: Number(e.target.value) })}
                        className="w-24 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
                      />
                      <span className="text-slate-400 text-xs">%</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        className="p-1 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 dark:bg-slate-900/60 font-black">
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

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
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
