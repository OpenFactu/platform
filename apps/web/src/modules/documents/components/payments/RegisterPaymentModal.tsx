import { useFormat } from '@/hooks/useFormat';
import { paymentMethodsApi, paymentsApi } from '@/modules/accounting/api';
import { ApiError } from '@/shared/http';
import React, { useEffect, useState } from 'react';
import { Modal, Input, DatePicker, Button, SearchableSelect, useToast } from '@openfactu/ui';
import { CreditCard } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import type { PaymentMethod } from '@/modules/accounting/domain/accounting';

export type InvoiceKind = 'sales' | 'purchase';

interface Props {
  open: boolean;
  onClose: () => void;
  kind: InvoiceKind;
  invoiceId: string;
  invoiceCode: string;
  /** Total menos lo ya pagado — el importe sugerido para cerrar la factura. */
  remaining: number;
  /** Devolver el saldo de un abono: el importe se escribe en positivo y viaja en negativo. */
  refund?: boolean;
  onSuccess?: () => void;
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
  refund,
  onSuccess,
}) => {
  const { t } = useI18n();
  const toast = useToast();
  const fmt = useFormat();

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(() => String(Math.max(0, remaining).toFixed(2)));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [methodId, setMethodId] = useState('');
  const [saving, setSaving] = useState(false);
  const heading = refund
    ? t('doc.creditNote.refund')
    : kind === 'sales'
      ? t('invoice.registerPayment')
      : t('invoice.registerPaymentPurchase');

  useEffect(() => {
    if (!open) return;
    setAmount(String(Math.max(0, remaining).toFixed(2)));
    paymentMethodsApi
      .list()
      .catch(() => [])
      .then((rows) => {
        setMethods(rows || []);
        if (rows && rows.length > 0 && !methodId) setMethodId(rows[0].id);
      })
      .catch(() => setMethods([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // En céntimos, como el servidor: se propone lo que queda redondeado.
  const tooMuch = Math.round(Number(amount) * 100) > Math.round(remaining * 100);

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error(t('payment.amount') + ' > 0');
      return;
    }
    if (tooMuch) return;
    if (!reference.trim()) {
      toast.error(t('payment.referenceRequired'));
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        date,
        amount: refund ? -amt : amt,
        reference: reference.trim(),
        notes: notes.trim() || null,
        paymentMethodId: methodId || null,
      };
      if (kind === 'sales') body.salesInvoiceId = invoiceId;
      else body.purchaseInvoiceId = invoiceId;

      const data = await paymentsApi.create(body);
      toast.success(`${heading} · ${t(`invoice.paymentStatus.${data.paymentStatus}`)}`);
      onSuccess?.();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={heading}>
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xs bg-accent/10 text-accent">
            <CreditCard size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-fg-default font-display">{heading}</h2>
            <p className="text-xs text-ink-500 dark:text-ink-400 font-mono">{invoiceCode}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
              {t('payment.date')}
            </label>
            <DatePicker value={date} onChange={(v) => setDate(v ?? '')} />
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
              helperText={t('payment.remainingHint', { amount: fmt.money(remaining) })}
              error={
                tooMuch ? t('payment.overRemaining', { amount: fmt.money(remaining) }) : undefined
              }
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
              {t('payment.method')}
            </label>
            <SearchableSelect
              value={methodId}
              onChange={setMethodId}
              options={methods.map((m) => ({ value: m.id, label: m.name }))}
              placeholder="—"
              clearable
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
              {t('payment.reference')} <span className="text-danger font-black">*</span>
            </label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t('payment.referencePlaceholder')}
              required
              className={!reference.trim() ? 'border-danger focus:border-danger' : ''}
            />
            {!reference.trim() && (
              <p className="mt-1 text-[11px] text-danger font-medium">
                {t('payment.requiredField')}
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
          <Button onClick={submit} disabled={saving || tooMuch || !reference.trim()}>
            {saving ? t('common.loading') : t('common.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
