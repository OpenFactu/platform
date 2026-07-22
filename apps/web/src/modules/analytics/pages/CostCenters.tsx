import React from 'react';
import { Layers } from 'lucide-react';
import { DimensionCrudPage } from '../../../components/analytics/DimensionCrudPage';

export const CostCenters: React.FC = () => (
  <DimensionCrudPage
    endpoint="/api/cost-centers"
    tableName="CostCenter"
    title="Centros de coste"
    subtitle="Dimensión analítica jerárquica para imputar gastos e ingresos a unidades de responsabilidad."
    icon={<Layers className="text-blue-600 dark:text-blue-300" size={32} />}
    autoCode
  />
);

export default CostCenters;
