import React from 'react';
import { Badge, type BadgeProps } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';

const TONE: Record<string, BadgeProps['variant']> = {
  delivered: 'success',
  exception: 'error',
  postponed: 'warning',
  en_route: 'info',
  arrived: 'info',
};

export const StopStatusBadge: React.FC<{ status: string; isPickup?: boolean }> = ({
  status,
  isPickup,
}) => {
  const { t } = useI18n();
  return (
    <Badge variant={TONE[status] ?? 'neutral'}>
      {isPickup && status === 'delivered'
        ? t('logistics.driver.collected')
        : t(`logistics.driver.stopStatus.${status}`)}
    </Badge>
  );
};
