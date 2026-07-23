import type { ModuleManifest } from '../types';
import { ServerCockpit } from './pages/ServerCockpit';
import { BackgroundTasks } from './pages/BackgroundTasks';
import { AuditLogs } from './pages/AuditLogs';

export const systemModule: ModuleManifest = {
  nav: {
    id: 'system',
    label: 'Sistema',
    icon: 'Activity',
    superuserOnly: true,
    subTabs: [
      { id: 'cockpit', label: 'Cockpit', path: '/system/cockpit' },
      { id: 'tasks', label: 'Tareas en 2º plano', path: '/background-tasks' },
    ],
  },
  routes: [
    {
      pattern: '/system/cockpit',
      Component: ServerCockpit,
      title: 'Cockpit',
      iconName: 'Activity',
      permissionPath: '/system/cockpit',
    },
    {
      pattern: '/background-tasks',
      Component: BackgroundTasks,
      title: 'Tareas',
      iconName: 'Activity',
      permissionPath: '/audit-logs',
    },
    {
      pattern: '/audit-logs',
      Component: AuditLogs,
      title: 'Auditoría',
      iconName: 'ClipboardList',
      permissionPath: '/audit-logs',
    },
  ],
};
