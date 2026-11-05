import React from 'react';
import { Card, CurrencyInput, Progress, Switch } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import { creditTone, creditUsedPercent, type CreditStatus } from '@/modules/documents/domain/sales';
import { usePartnerCredit } from '@/modules/documents/hooks/useCreditLimit';
import type { usePartnerForm } from '../hooks/usePartnerForm';

const Row: React.FC<{ label: string; value: string; strong?: boolean }> = ({
  label,
  value,
  strong,
}) => (
  <div className="flex justify-between gap-4 text-sm">
    <span className={strong ? 'font-bold text-fg-default' : 'text-fg-muted'}>{label}</span>
    <span className={`tabular-nums ${strong ? 'font-bold text-fg-default' : 'text-fg-body'}`}>
      {value}
    </span>
  </div>
);

const Usage: React.FC<{ status: CreditStatus }> = ({ status }) => {
  const { t } = useI18n();
  const fmt = useFormat();
  return (
    <div className="space-y-3">
      {status.limit !== null && (
        <Progress
          value={creditUsedPercent(status)}
          variant={creditTone(status)}
          label={t('partners.credit.usedOf', {
            used: fmt.money(status.used),
            limit: fmt.money(status.limit),
          })}
        />
      )}
      <div className="space-y-1">
        <Row label={t('partners.credit.invoices')} value={fmt.money(status.invoices)} />
        <Row label={t('partners.credit.deliveryNotes')} value={fmt.money(status.deliveryNotes)} />
        <Row label={t('partners.credit.orders')} value={fmt.money(status.orders)} />
        {status.creditBalance > 0 && (
          <Row label={t('partners.credit.balance')} value={fmt.money(-status.creditBalance)} />
        )}
        <Row label={t('partners.credit.used')} value={fmt.money(status.used)} strong />
        {status.available !== null && (
          <Row label={t('partners.credit.available')} value={fmt.money(status.available)} strong />
        )}
      </div>
    </div>
  );
};

/** Límite de crédito y reclamaciones de un interlocutor, con lo usado y lo disponible. */
export const PartnerCreditCard: React.FC<{
  form: ReturnType<typeof usePartnerForm>;
  partnerId?: string;
  disabled?: boolean;
}> = ({ form, partnerId, disabled }) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const status = usePartnerCredit(partnerId);
  // Subir el límite sería saltárselo: pide el mismo permiso.
  const canChangeLimit =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    !!user?.permissions?.['/credit-override']?.write;
  const value = form.data.creditLimit;

  return (
    <Card title={t('partners.credit.title')} subtitle={t('partners.credit.hint')}>
      <div className="space-y-4">
        <CurrencyInput
          label={t('partners.credit.limit')}
          value={value === '' || value === null ? undefined : Number(value)}
          onChange={(v) => form.set('creditLimit', v ?? '')}
          disabled={disabled || !canChangeLimit}
          helperText={
            canChangeLimit ? t('partners.credit.limitHint') : t('partners.credit.limitNoPermission')
          }
        />
        {status && <Usage status={status} />}
        <Switch
          label={t('partners.credit.excluded')}
          checked={form.data.dunningExcluded}
          onChange={(checked) => form.set('dunningExcluded', checked)}
          disabled={disabled}
        />
      </div>
    </Card>
  );
};
