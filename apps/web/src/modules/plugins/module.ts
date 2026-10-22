import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const appsPluginManager = lazy(() =>
  import('./pages/PluginManager').then((m) => ({ default: m.appsPluginManager })),
);

export const appsModule: ModuleManifest = {
  nav: {
    id: 'apps',
    label: 'Apps',
    icon: 'LayoutGrid',
    adminOnly: true,
    subTabs: [{ id: 'apps-manager', label: 'Aplicaciones', path: '/apps' }],
  },
  routes: [
    {
      pattern: '/apps',
      Component: appsPluginManager,
      title: 'Apps',
      iconName: 'LayoutGrid',
      permissionPath: '/apps',
    },
  ],
};
