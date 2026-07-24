import type { ModuleManifest } from '../types';
import { Pages } from './pages/Pages';
import { PageEditor } from './pages/PageEditor';
import { Settings } from './pages/Settings';
import { Messages } from './pages/Messages';

export const websiteModule: ModuleManifest = {
  nav: {
    id: 'website',
    label: 'Website',
    icon: 'Globe',
    featureFlag: 'websiteEnabled',
    description: 'Crea y publica la página web de tu empresa: landing por bloques con tu marca.',
    category: 'Operaciones',
    subTabs: [
      { id: 'pages', label: 'Páginas', path: '/website/pages' },
      { id: 'messages', label: 'Mensajes', path: '/website/messages' },
      { id: 'settings', label: 'Ajustes', path: '/website/settings', adminOnly: true },
    ],
  },
  routes: [
    {
      pattern: '/website/pages',
      Component: Pages,
      title: 'Páginas',
      iconName: 'Globe',
      permissionPath: '/website/pages',
    },
    {
      pattern: '/website/editor/:pageId',
      Component: PageEditor,
      title: 'Editor web',
      iconName: 'Globe',
      permissionPath: '/website/pages',
    },
    {
      pattern: '/website/messages',
      Component: Messages,
      title: 'Mensajes',
      iconName: 'Inbox',
      permissionPath: '/website/messages',
    },
    {
      pattern: '/website/settings',
      Component: Settings,
      title: 'Ajustes de la web',
      iconName: 'Settings',
      permissionPath: '/website/settings',
    },
  ],
};
