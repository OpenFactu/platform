import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const Partners = lazy(() => import('./pages/Partners').then((m) => ({ default: m.Partners })));
const PartnerDetail = lazy(() =>
  import('./pages/PartnerDetail').then((m) => ({ default: m.PartnerDetail })),
);
const PartnerGroups = lazy(() =>
  import('./pages/PartnerGroups').then((m) => ({ default: m.PartnerGroups })),
);

export const partnersModule: ModuleManifest = {
  nav: {
    id: 'partners',
    label: 'partners.nav.label',
    icon: 'Users',
    featureFlag: 'partnersEnabled',
    description: 'partners.nav.description',
    category: 'Operaciones',
    subTabs: [
      { id: 'partners-list', label: 'partners.nav.directory', path: '/partners' },
      { id: 'partner-groups', label: 'partners.nav.groups', path: '/partner-groups' },
    ],
  },
  routes: [
    {
      pattern: '/partners',
      Component: Partners,
      title: 'partners.nav.directory',
      iconName: 'Users',
      permissionPath: '/partners',
    },
    {
      pattern: '/partners/:partnerId',
      Component: PartnerDetail,
      title: 'partners.nav.detail',
      iconName: 'Users',
      permissionPath: '/partners',
    },
    {
      pattern: '/partner-groups',
      Component: PartnerGroups,
      title: 'partners.nav.groups',
      iconName: 'Network',
      permissionPath: '/partner-groups',
    },
  ],
};
