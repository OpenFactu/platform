import type { ModuleManifest } from '../types';
import { CostCenters } from './pages/CostCenters';
import { ProfitCenters } from './pages/ProfitCenters';
import { InternalOrders } from './pages/InternalOrders';

export const analyticsModule: ModuleManifest = {
  nav: {
    id: 'analytics',
    label: 'Analítica',
    icon: 'Layers',
    hiddenInLogisticsOnly: true,
    featureFlag: 'analyticsEnabled',
    description: 'Centros de coste, centros de beneficio y proyectos/órdenes internas.',
    category: 'Análisis',
    subTabs: [
      { id: 'cost-centers', label: 'Centros de coste', path: '/cost-centers' },
      { id: 'profit-centers', label: 'Centros de beneficio', path: '/profit-centers' },
      { id: 'internal-orders', label: 'Proyectos/Órdenes', path: '/internal-orders' },
    ],
  },
  routes: [
    {
      pattern: '/cost-centers',
      Component: CostCenters,
      title: 'Centros de coste',
      iconName: 'Layers',
      permissionPath: '/cost-centers',
    },
    {
      pattern: '/profit-centers',
      Component: ProfitCenters,
      title: 'Centros de beneficio',
      iconName: 'TrendingUp',
      permissionPath: '/profit-centers',
    },
    {
      pattern: '/internal-orders',
      Component: InternalOrders,
      title: 'Proyectos',
      iconName: 'Briefcase',
      permissionPath: '/internal-orders',
    },
  ],
};
