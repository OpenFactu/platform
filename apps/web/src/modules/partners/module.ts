import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const Partners = lazy(() => import('./pages/Partners').then((m) => ({ default: m.Partners })));
const PartnerGroups = lazy(() =>
  import('./pages/PartnerGroups').then((m) => ({ default: m.PartnerGroups })),
);

export const partnersModule: ModuleManifest = {
  nav: {
    id: 'partners',
    label: 'Interlocutores',
    icon: 'Users',
    featureFlag: 'partnersEnabled',
    description: 'Directorio de clientes y proveedores, agrupados por categorías.',
    category: 'Operaciones',
    subTabs: [
      { id: 'partners-list', label: 'Directorio', path: '/partners' },
      { id: 'partner-groups', label: 'Grupos', path: '/partner-groups' },
    ],
  },
  routes: [
    {
      pattern: '/partners',
      Component: Partners,
      title: 'Directorio',
      iconName: 'Users',
      permissionPath: '/partners',
    },
    {
      pattern: '/partner-groups',
      Component: PartnerGroups,
      title: 'Grupos',
      iconName: 'Network',
      permissionPath: '/partner-groups',
    },
  ],
};
