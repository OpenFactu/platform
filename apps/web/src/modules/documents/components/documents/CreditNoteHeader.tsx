import React from 'react';
import { DatePicker, FormGrid, Input, Select, Textarea } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import type { CreditNoteForm, CreditNotePreparation, InvoiceSide } from '../../domain/creditNote';

interface Props {
  side: InvoiceSide;
  data: CreditNotePreparation;
  form: CreditNoteForm;
  set: (patch: Partial<CreditNoteForm>) => void;
}

/** Cabecera del abono: de quién y qué factura vienen dadas, el resto se elige. */
export const CreditNoteHeader: React.FC<Props> = ({ side, data, form, set }) => {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <FormGrid columns={2}>
        <Input
          label={t(side === 'sales' ? 'doc.partner.customer' : 'doc.partner.supplier')}
          value={data.invoice.partnerName ?? ''}
          disabled
        />
        <Input label={t('doc.creditNote.invoice')} value={data.invoice.code} disabled />
        <Select
          label={t('doc.creditNote.type')}
          required
          value={form.documentTypeId}
          onChange={(documentTypeId) => set({ documentTypeId })}
          options={data.documentTypes.map((type) => ({ value: type.id, label: type.name }))}
        />
        <DatePicker
          label={t('doc.creditNote.date')}
          required
          value={form.date}
          onChange={(date) => set({ date: date ?? '' })}
        />
        {side === 'purchase' && (
          <Input
            label={t('doc.creditNote.supplierRef')}
            requiredMark
            value={form.externalRef}
            onChange={(e) => set({ externalRef: e.target.value })}
          />
        )}
      </FormGrid>
      <Textarea
        label={t('doc.creditNote.reason')}
        required
        rows={2}
        value={form.reason}
        onChange={(e) => set({ reason: e.target.value })}
      />
    </div>
  );
};
