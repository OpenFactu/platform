import { usePopup } from '@openfactu/ui';
import { useTabs } from '@/context/TabsContext';
import { useI18n } from '@/i18n/I18nContext';
import type { ShipmentReturnResult } from '../api/shipmentsApi';

/**
 * Lo que queda por hacer después de devolver un envío. La entrada trae la mercancía, pero la
 * factura sigue entera: si ya estaba emitida se ofrece su abono, con lo devuelto ya puesto y sin
 * volver a meter el stock.
 */
export function useReturnFollowUp() {
  const popup = usePopup();
  const { openTab } = useTabs();
  const { t } = useI18n();

  return async (result: ShipmentReturnResult) => {
    if (result.alreadyReturned) {
      await popup.alert({
        title: t('logistics.returnFollowUp.title'),
        message: t('logistics.returnFollowUp.alreadyReturned'),
      });
      return;
    }
    const { invoice } = result;
    if (!invoice) return;
    if (invoice.status === 'D') {
      await popup.alert({
        title: t('logistics.returnFollowUp.title'),
        message: t('logistics.returnFollowUp.draft', { code: invoice.code }),
      });
      return;
    }
    if (invoice.status !== 'O') return;
    const wanted = await popup.confirm({
      title: t('logistics.returnFollowUp.title'),
      message: t('logistics.returnFollowUp.issued', { code: invoice.code }),
      confirmLabel: t('logistics.returnFollowUp.create'),
      cancelLabel: t('logistics.returnFollowUp.later'),
    });
    if (wanted) openTab(`/sales/invoices/${invoice.id}/credit-note?fromReturn=1`);
  };
}
