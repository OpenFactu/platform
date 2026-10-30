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
    label: 'system.nav.system',
    icon: 'Activity',
    superuserOnly: true,
    subTabs: [
      { id: 'cockpit', label: 'system.nav.cockpit', path: '/system/cockpit' },
      { id: 'tasks', label: 'system.nav.tasks', path: '/background-tasks' },
    ],
  },
  routes: [
    {
      pattern: '/system/cockpit',
      Component: ServerCockpit,
      title: 'system.routes.cockpit',
      iconName: 'Activity',
      permissionPath: '/system/cockpit',
    },
    {
      pattern: '/background-tasks',
      Component: BackgroundTasks,
      title: 'system.routes.tasks',
      iconName: 'Activity',
      permissionPath: '/background-tasks',
    },
    {
      pattern: '/audit-logs',
      Component: AuditLogs,
      title: 'system.routes.audit',
      iconName: 'ClipboardList',
      permissionPath: '/audit-logs',
    },
  ],
};
