import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const appsPluginManager = lazy(() =>
  import('./pages/PluginManager').then((m) => ({ default: m.appsPluginManager })),
);

export const appsModule: ModuleManifest = {
  nav: {
    id: 'apps',
    label: 'plugins.nav.apps',
    icon: 'LayoutGrid',
    adminOnly: true,
    subTabs: [{ id: 'apps-manager', label: 'plugins.nav.applications', path: '/apps' }],
  },
  routes: [
    {
      pattern: '/apps',
      Component: appsPluginManager,
      title: 'plugins.nav.apps',
      iconName: 'LayoutGrid',
      permissionPath: '/apps',
    },
  ],
};
