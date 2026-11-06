import { useEffect, useState } from 'react';
import { DocType } from '@openfactu/common';
import { useDataVersion } from '@/utils/dataRefresh';
import { creditNoteApi } from '../api/docsApi';
import type { InvoiceCreditNotes, InvoiceSide } from '../domain/creditNote';

const NOTHING: InvoiceCreditNotes = { notes: [], creditable: false, pendingReturn: 0 };

/**
 * Los abonos de una factura y si admite otro. Hasta saberlo no se ofrece crearlo; si no se
 * puede saber, sí, porque el servidor rechaza lo que no quepa.
 */
export function useInvoiceCreditNotes(
  side: InvoiceSide,
  invoiceId: string,
  enabled: boolean,
): InvoiceCreditNotes {
  const version = useDataVersion(side === 'sales' ? DocType.SalesInvoice : DocType.PurchaseInvoice);
  const [data, setData] = useState<InvoiceCreditNotes>(NOTHING);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    creditNoteApi
      .ofInvoice(side, invoiceId)
      .then((result) => {
        if (alive) setData(result);
      })
      .catch(() => {
        if (alive) setData({ notes: [], creditable: true, pendingReturn: 0 });
      });
    return () => {
      alive = false;
    };
  }, [side, invoiceId, enabled, version]);

  return enabled ? data : NOTHING;
}
