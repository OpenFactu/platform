import React from 'react';
import { Building2 } from 'lucide-react';
import { DimensionCrudPage } from '@/components/analytics/DimensionCrudPage';

export const Departments: React.FC = () => (
  <DimensionCrudPage
    endpoint="/api/hr/departments"
    tableName="Department"
    title="Departamentos"
    subtitle="Estructura organizativa jerárquica. Cada departamento puede vincularse a un centro de coste para imputación contable automática."
    icon={<Building2 className="text-indigo-600 dark:text-indigo-300" size={32} />}
    autoCode
  />
);

export default Departments;
