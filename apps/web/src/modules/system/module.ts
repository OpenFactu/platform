import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const ServerCockpit = lazy(() =>
  import('./pages/ServerCockpit').then((m) => ({ default: m.ServerCockpit })),
);
const BackgroundTasks = lazy(() =>
  import('./pages/BackgroundTasks').then((m) => ({ default: m.BackgroundTasks })),
);
const AuditLogs = lazy(() => import('./pages/AuditLogs').then((m) => ({ default: m.AuditLogs })));

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
      permissionPath: '/background-tasks',
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
