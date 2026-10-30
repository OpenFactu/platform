import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const Messages = lazy(() => import('./pages/Messages').then((m) => ({ default: m.Messages })));

export const messagingModule: ModuleManifest = {
  nav: {
    id: 'messaging',
    label: 'messaging.nav.label',
    icon: 'MessageSquare',
    featureFlag: 'messagingEnabled',
    description: 'messaging.nav.description',
    category: 'Operaciones',
    subTabs: [{ id: 'messaging-home', label: 'messaging.nav.messages', path: '/messaging' }],
  },
  routes: [
    {
      pattern: '/messaging',
      Component: Messages,
      title: 'messaging.nav.messages',
      iconName: 'MessageSquare',
      permissionPath: '/messaging',
    },
  ],
};
