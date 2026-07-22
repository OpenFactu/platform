import type { ModuleManifest } from '../types';
import { PluginManager } from './pages/PluginManager';

export const pluginsModule: ModuleManifest = {
  nav: {
    id: 'plugins',
    label: 'Plugins',
    icon: 'Puzzle',
    subTabs: [{ id: 'plugins-manager', label: 'Gestor', path: '/plugins' }],
  },
  routes: [
    {
      pattern: '/plugins',
      Component: PluginManager,
      title: 'Plugins',
      iconName: 'Layers',
      permissionPath: '/plugins',
    },
  ],
};
