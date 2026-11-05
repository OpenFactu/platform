import React from 'react';
import { Badge } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';

/** En un listado de facturas: esta fila es un abono, o tiene alguno. */
export const InvoiceCreditChip: React.FC<{
  invoice: { rectifiesInvoiceId?: string | null; creditNoteCount?: number | null };
}> = ({ invoice }) => {
  const { t } = useI18n();
  if (invoice.rectifiesInvoiceId) {
    return <Badge variant="info">{t('doc.creditNote.chipNote')}</Badge>;
  }
  if (Number(invoice.creditNoteCount) > 0) {
    return <Badge variant="warning">{t('doc.creditNote.chipHasNote')}</Badge>;
  }
  return null;
};
