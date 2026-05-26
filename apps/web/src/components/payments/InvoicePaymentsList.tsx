import React, { useEffect, useState } from 'react';
import { Card, Button, Input, useToast, usePopup } from '@openfactu/ui';
import { CreditCard, Trash2, Inbox, Pencil } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFormat } from '../../hooks/useFormat';

interface Props {
  kind: 'sales' | 'purchase';
  invoiceId: string;
  /** Versión para forzar refetch desde el padre. */
  refreshKey?: number;
  onChanged?: () => void;
}

interface PaymentRow {
  id: string;
  date: string;
  amount: string | number;
  paymentMethodId?: string | null;
  reference?: string | null;
  notes?: string | null;
  source?: string;
  createdAt?: string;
}

interface MethodRow {
  id: string;
  code: string;
  name: string;
}

/**
 * Timeline de cobros/pagos registrados sobre una factura. Se lista en el
 * detalle de la factura junto al botón "Registrar cobro" que ya existe.
 * Permite borrar un pago (con confirmación). Tras borrar, el backend
 * recalcula `amountPaid` y `paymentStatus` vía `recalcInvoicePaymentStatus`.
 */
export const InvoicePaymentsList: React.FC<Props> = ({
  kind,
  invoiceId,
  refreshKey = 0,
  onChanged,
}) => {
  const { token, user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const fmt = useFormat();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [methods, setMethods] = useState<MethodRow[]>([]);
  const [loading, setLoading] = useState(true);

  const headers = {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  const load = async () => {
    setLoading(true);
    try {
      const qs =
        kind === 'sales' ? `salesInvoiceId=${invoiceId}` : `purchaseInvoiceId=${invoiceId}`;
      const [pRes, mRes] = await Promise.all([
        fetch(`/api/payments?${qs}`, { headers }),
        fetch('/api/payment-methods', { headers }),
      ]);
      const p = await pRes.json();
      const m = await mRes.json();
      setPayments(Array.isArray(p) ? p : []);
      setMethods(Array.isArray(m) ? m : []);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId, refreshKey]);

  const methodName = (id?: string | null) =>
    id ? methods.find((m) => m.id === id)?.name || '—' : '—';

  const handleEdit = async (p: PaymentRow) => {
    const result = await popup.show<Record<string, any> | undefined>({
      title: `Editar ${kind === 'sales' ? 'cobro' : 'pago'}`,
      subtitle: `Solo se pueden editar los campos informativos. El importe ${fmt.money(Number(p.amount))} no se puede cambiar — si está mal, elimínalo y créalo de nuevo.`,
      maxWidth: 'lg',
      render: (close) => (
        <EditPaymentForm
          initial={p}
          methods={methods}
          onCancel={() => close(undefined)}
          onSave={(data) => close(data)}
        />
      ),
    });
    if (!result) return;
    try {
      const res = await fetch(`/api/payments/${p.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      if (!res.ok) throw new Error((await res.json())?.error || 'Error');
      toast.success('Actualizado');
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || 'Error al actualizar');
    }
  };

  const handleDelete = async (p: PaymentRow) => {
    const ok = await popup.confirm({
      title: `Eliminar ${kind === 'sales' ? 'cobro' : 'pago'}`,
      message: `${fmt.money(Number(p.amount))} — el estado de la factura se recalculará y el asiento contable (si existe) se reversará automáticamente.`,
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/payments/${p.id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error((await res.json())?.error || 'Error');
      toast.success('Eliminado');
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || 'Error al eliminar');
    }
  };

  const total = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return (
    <Card>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-ink-500 dark:text-ink-400 flex items-center gap-2">
            <CreditCard size={12} />
            {kind === 'sales' ? 'Cobros registrados' : 'Pagos registrados'}
          </h3>
          {payments.length > 0 && (
            <span className="text-[10px] font-mono text-accent">
              {payments.length} · {fmt.money(total)}
            </span>
          )}
        </div>

        {loading ? (
          <div className="text-xs text-ink-400 text-center py-6 font-mono">Cargando…</div>
        ) : payments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-ink-400">
            <Inbox size={24} />
            <p className="text-[11px] font-mono uppercase tracking-wider">
              Sin {kind === 'sales' ? 'cobros' : 'pagos'} aún
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line dark:divide-ink-700">
            {payments.map((p) => (
              <li
                key={p.id}
                className="py-2.5 flex items-center gap-3 group hover:bg-line-2/30 dark:hover:bg-ink-800/30 -mx-2 px-2 rounded-xs transition-colors"
              >
                <div className="p-1.5 rounded-xs bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                  <CreditCard size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold font-mono text-ink-900 dark:text-slate-100">
                      {fmt.money(Number(p.amount))}
                    </span>
                    <span className="text-[10px] font-mono text-ink-400">·</span>
                    <span className="text-xs text-ink-700 dark:text-slate-200">
                      {methodName(p.paymentMethodId)}
                    </span>
                    {p.source && p.source !== 'manual' && (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-accent/10 text-accent px-1.5 py-0.5 rounded-xs">
                        {p.source}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-ink-500 dark:text-ink-400 mt-0.5">
                    <span>{fmt.date(p.date)}</span>
                    {p.reference && (
                      <>
                        <span className="text-ink-300">·</span>
                        <span className="font-mono">Ref {p.reference}</span>
                      </>
                    )}
                  </div>
                  {p.notes && (
                    <div className="text-[10px] text-ink-400 italic truncate mt-0.5">{p.notes}</div>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(p)}
                    className="h-8 w-8 p-0 text-ink-400 hover:text-accent hover:bg-accent/10"
                    title="Editar"
                  >
                    <Pencil size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(p)}
                    className="h-8 w-8 p-0 text-ink-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                    title="Eliminar"
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
};

interface EditPaymentFormProps {
  initial: PaymentRow;
  methods: MethodRow[];
  onCancel: () => void;
  onSave: (data: Record<string, any>) => void;
}

const EditPaymentForm: React.FC<EditPaymentFormProps> = ({
  initial,
  methods,
  onCancel,
  onSave,
}) => {
  const [date, setDate] = useState(() => (initial.date ? initial.date.substring(0, 10) : ''));
  const [reference, setReference] = useState(initial.reference || '');
  const [notes, setNotes] = useState(initial.notes || '');
  const [methodId, setMethodId] = useState(initial.paymentMethodId || '');

  const submit = () => {
    if (!reference.trim()) {
      return;
    }
    onSave({
      date,
      reference: reference.trim(),
      notes: notes.trim() || null,
      paymentMethodId: methodId || null,
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          type="date"
          label="Fecha"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
            Nº de referencia <span className="text-rose-600 font-black">*</span>
          </label>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            required
            className={
              !reference.trim()
                ? 'border-rose-400 dark:border-rose-500/60 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                : ''
            }
          />
          {!reference.trim() && (
            <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
              Campo obligatorio
            </p>
          )}
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
          Método
        </label>
        <select
          value={methodId}
          onChange={(e) => setMethodId(e.target.value)}
          className="w-full px-3 py-2 border border-line dark:border-ink-700 rounded-xs bg-white dark:bg-ink-900 text-ink-900 dark:text-slate-100 text-sm"
        >
          <option value="">—</option>
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <Input label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={!reference.trim()}>
          Guardar
        </Button>
      </div>
    </div>
  );
};
