import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const Pages = lazy(() => import('./pages/Pages').then((m) => ({ default: m.Pages })));
const PageEditor = lazy(() =>
  import('./pages/PageEditor').then((m) => ({ default: m.PageEditor })),
);
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Messages = lazy(() => import('./pages/Messages').then((m) => ({ default: m.Messages })));

export const websiteModule: ModuleManifest = {
  nav: {
    id: 'website',
    label: 'website.nav.label',
    icon: 'Globe',
    featureFlag: 'websiteEnabled',
    description: 'website.nav.description',
    category: 'Operaciones',
    subTabs: [
      { id: 'pages', label: 'website.nav.pages', path: '/website/pages' },
      { id: 'messages', label: 'website.nav.messages', path: '/website/messages' },
      { id: 'settings', label: 'website.nav.settings', path: '/website/settings', adminOnly: true },
    ],
  },
  routes: [
    {
      pattern: '/website/pages',
      Component: Pages,
      title: 'website.nav.pages',
      iconName: 'Globe',
      permissionPath: '/website/pages',
    },
    {
      pattern: '/website/editor/:pageId',
      Component: PageEditor,
      title: 'website.nav.editor',
      iconName: 'Globe',
      permissionPath: '/website/pages',
    },
    {
      pattern: '/website/messages',
      Component: Messages,
      title: 'website.nav.messages',
      iconName: 'Inbox',
      permissionPath: '/website/messages',
    },
    {
      pattern: '/website/settings',
      Component: Settings,
      title: 'website.nav.settingsTitle',
      iconName: 'Settings',
      permissionPath: '/website/settings',
    },
  ],
};
