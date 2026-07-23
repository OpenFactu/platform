import React from 'react';
import { Badge } from '@openfactu/ui';
import { Lock } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

interface Props {
  status?: string | null;
  isLocked?: boolean | null;
  compact?: boolean;
}

/**
 * Badge pequeño para el estado de cobro + icono de candado si la factura
 * está lockada. Se usa en listados y en la cabecera del detalle.
 */
export const PaymentStatusBadge: React.FC<Props> = ({ status, isLocked, compact }) => {
  const { t } = useI18n();

  const variant = (() => {
    switch (status) {
      case 'paid':
        return 'success' as const;
      case 'partial':
        return 'info' as const;
      case 'overdue':
        return 'error' as const;
      case 'pending':
      default:
        return 'neutral' as const;
    }
  })();

  const label = status ? t(`invoice.paymentStatus.${status}`) : t('invoice.paymentStatus.pending');

  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={variant} className={compact ? 'px-1.5 py-0.5 text-[10px]' : ''}>
        {label}
      </Badge>
      {isLocked && (
        <span
          className="inline-flex items-center text-ink-400 dark:text-ink-500"
          title={t('invoice.locked')}
        >
          <Lock size={12} />
        </span>
      )}
    </span>
  );
};
