import React, { useEffect, useState } from 'react';
import { Modal, Input, Button, useToast } from '@openfactu/ui';
import { CreditCard } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

export type InvoiceKind = 'sales' | 'purchase';

interface Props {
  open: boolean;
  onClose: () => void;
  kind: InvoiceKind;
  invoiceId: string;
  invoiceCode: string;
  /** Total menos lo ya pagado — el importe sugerido para cerrar la factura. */
  remaining: number;
  onSuccess?: () => void;
}

interface PaymentMethod {
  id: string;
  code: string;
  name: string;
}

/**
 * Modal para registrar un cobro (SINV) o pago (PINV) sobre una factura.
 * POST a `/api/payments`. Tras éxito, la factura queda en `partial` o `paid`.
 */
export const RegisterPaymentModal: React.FC<Props> = ({
  open,
  onClose,
  kind,
  invoiceId,
  invoiceCode,
  remaining,
  onSuccess,
}) => {
  const { token, user } = useAuth();
  const { t } = useI18n();
  const toast = useToast();

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(() => String(Math.max(0, remaining).toFixed(2)));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [methodId, setMethodId] = useState('');
  const [saving, setSaving] = useState(false);

  const headers = {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
    'Content-Type': 'application/json',
  };

  useEffect(() => {
    if (!open) return;
    setAmount(String(Math.max(0, remaining).toFixed(2)));
    fetch('/api/payment-methods', { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: PaymentMethod[]) => {
        setMethods(rows || []);
        if (rows && rows.length > 0 && !methodId) setMethodId(rows[0].id);
      })
      .catch(() => setMethods([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error(t('payment.amount') + ' > 0');
      return;
    }
    if (!reference.trim()) {
      toast.error('El nº de referencia es obligatorio');
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        date,
        amount: amt,
        reference: reference.trim(),
        notes: notes.trim() || null,
        paymentMethodId: methodId || null,
      };
      if (kind === 'sales') body.salesInvoiceId = invoiceId;
      else body.purchaseInvoiceId = invoiceId;

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error');
      toast.success(
        kind === 'sales'
          ? t('invoice.registerPayment') + ' · ' + data.paymentStatus
          : t('invoice.registerPaymentPurchase') + ' · ' + data.paymentStatus,
      );
      onSuccess?.();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="{kind === 'sales' ? t('invoice.registerPayment') : t('invoice.registerPaymentPurchase')}">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xs bg-accent/10 text-accent">
            <CreditCard size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink-900 dark:text-slate-100 font-display">
              {kind === 'sales' ? t('invoice.registerPayment') : t('invoice.registerPaymentPurchase')}
            </h2>
            <p className="text-xs text-ink-500 dark:text-ink-400 font-mono">{invoiceCode}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
              {t('payment.date')}
            </label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
              {t('payment.amount')}
            </label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
              {t('payment.method')}
            </label>
            <select
              value={methodId}
              onChange={(e) => setMethodId(e.target.value)}
              className="w-full px-3 py-2 border border-line dark:border-ink-700 rounded-xs bg-white dark:bg-ink-900 text-ink-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            >
              <option value="">—</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
              {t('payment.reference')} <span className="text-rose-600 font-black">*</span>
            </label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="nº transferencia, recibo…"
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
            {t('invoice.notes')}
          </label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={saving || !reference.trim()}>
            {saving ? t('common.loading') : t('common.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
