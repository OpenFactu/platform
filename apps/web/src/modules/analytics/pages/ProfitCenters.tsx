import React from 'react';
import { TrendingUp } from 'lucide-react';
import { DimensionCrudPage } from '@/components/analytics/DimensionCrudPage';
import { useI18n } from '@/i18n/I18nContext';

export const ProfitCenters: React.FC = () => {
  const { t } = useI18n();
  return (
    <DimensionCrudPage
      endpoint="/api/profit-centers"
      tableName="ProfitCenter"
      title={t('analytics.profitCenters.title')}
      subtitle={t('analytics.profitCenters.subtitle')}
      icon={<TrendingUp className="text-emerald-600 dark:text-emerald-300" size={32} />}
      autoCode
    />
  );
};

export default ProfitCenters;
