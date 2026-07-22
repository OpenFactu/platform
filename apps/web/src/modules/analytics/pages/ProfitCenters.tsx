import React from 'react';
import { TrendingUp } from 'lucide-react';
import { DimensionCrudPage } from '../../../components/analytics/DimensionCrudPage';

export const ProfitCenters: React.FC = () => (
  <DimensionCrudPage
    endpoint="/api/profit-centers"
    tableName="ProfitCenter"
    title="Centros de beneficio"
    subtitle="Dimensión ortogonal a centros de coste — útil para segmentar por línea de negocio o mercado."
    icon={<TrendingUp className="text-emerald-600 dark:text-emerald-300" size={32} />}
    autoCode
  />
);

export default ProfitCenters;
