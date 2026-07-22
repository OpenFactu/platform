import type { ModuleManifest } from '../types';
import { PluginManager } from './pages/PluginManager';

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
      Component: PluginManager,
      title: 'Apps',
      iconName: 'LayoutGrid',
      permissionPath: '/apps',
    },
  ],
};
