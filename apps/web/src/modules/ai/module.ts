import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const AiChat = lazy(() => import('./pages').then((m) => ({ default: m.AiChat })));

export const aiModule: ModuleManifest = {
  nav: {
    id: 'assistant',
    label: 'ai.nav.assistant',
    icon: 'Bot',
    featureFlag: 'assistantEnabled',
    description: 'ai.nav.description',
    category: 'Productividad',
    subTabs: [{ id: 'ai-chat', label: 'Keiro', path: '/ai/chat', status: 'beta' }],
  },
  routes: [
    {
      pattern: '/ai/chat',
      Component: AiChat,
      title: 'ai.nav.assistant',
      iconName: 'Bot',
      permissionPath: '/ai/chat',
    },
  ],
};
