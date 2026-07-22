import type { ModuleManifest } from '../types';
import { AiChat } from './pages';

export const aiModule: ModuleManifest = {
  nav: {
    id: 'assistant',
    label: 'Asistente IA',
    icon: 'Bot',
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
