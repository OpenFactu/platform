import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const CostCenters = lazy(() =>
  import('./pages/CostCenters').then((m) => ({ default: m.CostCenters })),
);
const ProfitCenters = lazy(() =>
  import('./pages/ProfitCenters').then((m) => ({ default: m.ProfitCenters })),
);
const InternalOrders = lazy(() =>
  import('./pages/InternalOrders').then((m) => ({ default: m.InternalOrders })),
);

export const analyticsModule: ModuleManifest = {
  nav: {
    id: 'analytics',
    label: 'analytics.nav.label',
    icon: 'Layers',
    hiddenInLogisticsOnly: true,
    featureFlag: 'analyticsEnabled',
    description: 'analytics.nav.description',
    category: 'Análisis',
    subTabs: [
      { id: 'cost-centers', label: 'analytics.nav.costCenters', path: '/cost-centers' },
      { id: 'profit-centers', label: 'analytics.nav.profitCenters', path: '/profit-centers' },
      { id: 'internal-orders', label: 'analytics.nav.internalOrders', path: '/internal-orders' },
    ],
  },
  routes: [
    {
      pattern: '/cost-centers',
      Component: CostCenters,
      title: 'analytics.nav.costCenters',
      iconName: 'Layers',
      permissionPath: '/cost-centers',
    },
    {
      pattern: '/profit-centers',
      Component: ProfitCenters,
      title: 'analytics.nav.profitCenters',
      iconName: 'TrendingUp',
      permissionPath: '/profit-centers',
    },
    {
      pattern: '/internal-orders',
      Component: InternalOrders,
      title: 'analytics.nav.projects',
      iconName: 'Briefcase',
      permissionPath: '/internal-orders',
    },
  ],
};
