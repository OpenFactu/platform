import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const Messages = lazy(() => import('./pages/Messages').then((m) => ({ default: m.Messages })));
const Meetings = lazy(() => import('./pages/Meetings').then((m) => ({ default: m.Meetings })));
const Channels = lazy(() => import('./pages/Channels').then((m) => ({ default: m.Channels })));

export const messagingModule: ModuleManifest = {
  nav: {
    id: 'messaging',
    label: 'messaging.nav.label',
    icon: 'MessageSquare',
    featureFlag: 'messagingEnabled',
    description: 'messaging.nav.description',
    category: 'Operaciones',
    subTabs: [
      { id: 'messaging-home', label: 'messaging.nav.messages', path: '/messaging' },
      { id: 'messaging-meetings', label: 'messaging.nav.meetings', path: '/messaging/meetings' },
      // Conectar el bot de la empresa: cosa de administradores.
      {
        id: 'messaging-channels',
        label: 'messaging.nav.channels',
        path: '/messaging/channels',
        adminOnly: true,
      },
    ],
  },
  routes: [
    {
      pattern: '/messaging',
      Component: Messages,
      title: 'messaging.nav.messages',
      iconName: 'MessageSquare',
      permissionPath: '/messaging',
    },
    {
      pattern: '/messaging/meetings',
      Component: Meetings,
      title: 'messaging.nav.meetings',
      iconName: 'CalendarDays',
      permissionPath: '/messaging',
    },
    {
      pattern: '/messaging/channels',
      Component: Channels,
      title: 'messaging.nav.channels',
      iconName: 'Send',
      permissionPath: '/messaging',
    },
  ],
};
