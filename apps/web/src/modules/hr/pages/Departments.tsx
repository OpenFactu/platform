import React from 'react';
import { Building2 } from 'lucide-react';
import { DimensionCrudPage } from '@/components/analytics/DimensionCrudPage';
import { useI18n } from '@/i18n/I18nContext';

export const Departments: React.FC = () => {
  const { t } = useI18n();
  return (
    <DimensionCrudPage
      endpoint="/api/hr/departments"
      tableName="Department"
      title={t('hr.departments.title')}
      subtitle={t('hr.departments.subtitle')}
      icon={<Building2 className="text-indigo-600 dark:text-indigo-300" size={32} />}
      autoCode
    />
  );
};

export default Departments;
