import type { ModuleManifest } from '../types';
import { Partners } from './pages/Partners';
import { PartnerGroups } from './pages/PartnerGroups';

export const partnersModule: ModuleManifest = {
  nav: {
    id: 'partners',
    label: 'Interlocutores',
    icon: 'Users',
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
