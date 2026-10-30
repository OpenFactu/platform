import React from 'react';
import { Layers } from 'lucide-react';
import { DimensionCrudPage } from '@/components/analytics/DimensionCrudPage';
import { useI18n } from '@/i18n/I18nContext';

export const CostCenters: React.FC = () => {
  const { t } = useI18n();
  return (
    <DimensionCrudPage
      endpoint="/api/cost-centers"
      tableName="CostCenter"
      title={t('analytics.costCenters.title')}
      subtitle={t('analytics.costCenters.subtitle')}
      icon={<Layers className="text-blue-600 dark:text-blue-300" size={32} />}
      autoCode
    />
  );
};

export default CostCenters;
