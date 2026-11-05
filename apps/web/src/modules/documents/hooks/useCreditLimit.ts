import { useCallback, useEffect, useState } from 'react';
import { usePopup, useToast } from '@openfactu/ui';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import { creditApi } from '../api/salesApi';
import type { CreditStatus, CreditWarning } from '../domain/sales';

/** Cómo está de crédito un cliente, y si un importe más cabría. Sin permiso, nada. */
export function usePartnerCredit(partnerId: string | undefined, amount = 0): CreditStatus | null {
  const [status, setStatus] = useState<CreditStatus | null>(null);

  useEffect(() => {
    if (!partnerId) return;
    let alive = true;
    const timer = setTimeout(() => {
      creditApi
        .status(partnerId, amount)
        .then((result) => {
          if (alive) setStatus(result);
        })
        .catch(() => {
          if (alive) setStatus(null);
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [partnerId, amount]);

  return partnerId ? status : null;
}

/**
 * Guardar un documento de venta pasando por el límite de crédito. Si bloquearía y quien lo
 * hace puede saltárselo, lo confirma primero. Si no puede, se deja ir al servidor, que es
 * quien decide y explica por qué no. Devuelve `undefined` si se echa atrás.
 */
export function useCreditSubmit() {
  const { t } = useI18n();
  const fmt = useFormat();
  const popup = usePopup();
  const toast = useToast();

  return useCallback(
    async <T extends { creditWarning?: CreditWarning }>(
      partnerId: string,
      amount: number,
      submit: (extra: { creditOverride?: boolean }) => Promise<T>,
    ): Promise<T | undefined> => {
      const extra: { creditOverride?: boolean } = {};
      const status = await creditApi.status(partnerId, amount).catch(() => null);
      if (status?.mode === 'block' && status.wouldExceed && status.canOverride) {
        const ok = await popup.confirm({
          title: t('doc.credit.overrideTitle'),
          message: t('doc.credit.overrideMessage', {
            limit: fmt.money(status.limit),
            used: fmt.money(status.used + amount),
          }),
          tone: 'danger',
          confirmLabel: t('doc.credit.overrideConfirm'),
          cancelLabel: t('doc.common.back'),
        });
        if (!ok) return undefined;
        extra.creditOverride = true;
      }
      const created = await submit(extra);
      if (created?.creditWarning) {
        toast.warning(
          t('doc.credit.savedOver', {
            over: fmt.money(created.creditWarning.over),
            limit: fmt.money(created.creditWarning.limit),
          }),
        );
      }
      return created;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, fmt],
  );
}
