import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const AiChat = lazy(() => import('./pages').then((m) => ({ default: m.AiChat })));

export const aiModule: ModuleManifest = {
  nav: {
    id: 'assistant',
    label: 'Asistente IA',
    icon: 'Bot',
    featureFlag: 'assistantEnabled',
    description: 'Chat con Keiro, el asistente de IA de Keirost.',
    category: 'Productividad',
    subTabs: [{ id: 'ai-chat', label: 'Keiro', path: '/ai/chat', status: 'beta' }],
  },
  routes: [
    {
      pattern: '/ai/chat',
      Component: AiChat,
      title: 'Asistente IA',
      iconName: 'Bot',
      permissionPath: '/ai/chat',
    },
  ],
};
