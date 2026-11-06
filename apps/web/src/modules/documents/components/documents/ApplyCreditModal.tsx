import React, { useEffect, useState } from 'react';
import { Alert, Button, Modal, NumberInput, Select, Spinner, useToast } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { useFormat } from '@/hooks/useFormat';
import { formatDocCode } from '@/utils/docCode';
import { creditNoteApi, type CreditTarget } from '../../api';
import type { InvoiceSide } from '../../domain/creditNote';

interface Props {
  open: boolean;
  onClose: () => void;
  side: InvoiceSide;
  noteId: string;
  /** Lo que queda en el abono. */
  available: number;
  onApplied: () => void;
}

/** Aplicar el saldo de un abono a otra factura del mismo interlocutor. */
export const ApplyCreditModal: React.FC<Props> = ({
  open,
  onClose,
  side,
  noteId,
  available,
  onApplied,
}) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const toast = useToast();
  const [targets, setTargets] = useState<CreditTarget[] | null>(null);
  const [targetId, setTargetId] = useState('');
  const [amount, setAmount] = useState<number | null>(available);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setTargets(null);
    creditNoteApi
      .targets(side, noteId)
      .then((rows) => {
        if (!alive) return;
        setTargets(rows);
        setTargetId(rows[0]?.id ?? '');
        setAmount(Math.min(available, rows[0]?.remaining ?? available));
      })
      .catch(() => {
        if (alive) setTargets([]);
      });
    return () => {
      alive = false;
    };
  }, [open, side, noteId, available]);

  const target = targets?.find((row) => row.id === targetId);
  const limit = Math.min(available, target?.remaining ?? available);
  const valid = !!target && Number(amount) > 0 && Number(amount) <= limit;

  const apply = async () => {
    setSaving(true);
    try {
      await creditNoteApi.apply(side, noteId, {
        targetInvoiceId: targetId,
        amount: Number(amount),
      });
      toast.success(t('doc.creditNote.applied'));
      onApplied();
      onClose();
    } catch (error: any) {
      toast.error(error?.message || t('doc.creditNote.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t('doc.creditNote.apply')}
      maxWidth="md"
      footer={
        <div className="flex w-full justify-end gap-2 p-3">
          <Button variant="secondary" onClick={onClose}>
            {t('doc.common.back')}
          </Button>
          <Button onClick={apply} disabled={!valid} isLoading={saving}>
            {t('doc.creditNote.apply')}
          </Button>
        </div>
      }
    >
      {!targets ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : targets.length === 0 ? (
        <Alert tone="info">{t('doc.creditNote.noTargets')}</Alert>
      ) : (
        <div className="space-y-3">
          <Select
            label={t('doc.creditNote.target')}
            value={targetId}
            onChange={(id) => {
              setTargetId(id);
              const picked = targets.find((row) => row.id === id);
              setAmount(Math.min(available, picked?.remaining ?? available));
            }}
            options={targets.map((row) => ({
              value: row.id,
              label: `${formatDocCode(row)} · ${fmt.money(row.remaining)}`,
            }))}
          />
          <NumberInput
            label={t('doc.creditNote.amount')}
            helperText={t('doc.creditNote.upTo', { amount: fmt.money(limit) })}
            value={amount}
            min={0}
            max={limit}
            precision={2}
            onChange={setAmount}
          />
        </div>
      )}
    </Modal>
  );
};
