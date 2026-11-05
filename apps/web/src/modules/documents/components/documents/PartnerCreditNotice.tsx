import React from 'react';
import { Alert } from '@openfactu/ui';
import { CreditCard } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import { usePartnerCredit } from '../../hooks/useCreditLimit';

/** En el alta de un documento de venta: solo dice algo si este documento pasa del límite. */
export const PartnerCreditNotice: React.FC<{ partnerId?: string; amount: number }> = ({
  partnerId,
  amount,
}) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const status = usePartnerCredit(partnerId, amount);

  if (!status || status.limit === null || status.mode === 'off' || !status.wouldExceed) return null;
  const blocks = status.mode === 'block';
  return (
    <Alert
      tone={blocks ? 'danger' : 'warning'}
      icon={<CreditCard size={16} />}
      title={t(blocks ? 'doc.credit.noticeBlockTitle' : 'doc.credit.noticeWarnTitle')}
    >
      {t('doc.credit.notice', {
        used: fmt.money(status.used),
        limit: fmt.money(status.limit),
        amount: fmt.money(amount),
      })}
      {blocks && !status.canOverride && ` ${t('doc.credit.noticeNoOverride')}`}
    </Alert>
  );
};
