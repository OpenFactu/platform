import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const UserProfile = lazy(() =>
  import('./pages/UserProfile').then((m) => ({ default: m.UserProfile })),
);
const PhysicalDevices = lazy(() =>
  import('./pages/PhysicalDevices').then((m) => ({ default: m.PhysicalDevices })),
);
const CompanySettings = lazy(() =>
  import('./pages/CompanySettings').then((m) => ({ default: m.CompanySettings })),
);
const Users = lazy(() => import('./pages/Users').then((m) => ({ default: m.Users })));
const CustomFields = lazy(() =>
  import('./pages/CustomFields').then((m) => ({ default: m.CustomFields })),
);
const DashboardWidgets = lazy(() =>
  import('./pages/DashboardWidgets').then((m) => ({ default: m.DashboardWidgets })),
);
const WebhooksSettings = lazy(() =>
  import('./pages/WebhooksSettings').then((m) => ({ default: m.WebhooksSettings })),
);
const ApiTokens = lazy(() => import('./pages/ApiTokens').then((m) => ({ default: m.ApiTokens })));
const Automations = lazy(() =>
  import('./pages/Automations').then((m) => ({ default: m.Automations })),
);
const NewCompany = lazy(() =>
  import('./pages/NewCompany').then((m) => ({ default: m.NewCompany })),
);
const StyleGuide = lazy(() =>
  import('./pages/StyleGuide').then((m) => ({ default: m.StyleGuide })),
);

export const settingsModule: ModuleManifest = {
  nav: {
    id: 'configuration',
    label: 'Configuración',
    icon: 'SlidersHorizontal',
    subTabs: [
      { id: 'profile', label: 'Mi perfil', path: '/profile' },
      { id: 'company', label: 'Empresa', path: '/settings/company' },
      {
        id: 'physical-devices',
        label: 'Dispositivos físicos',
        path: '/settings/devices',
        adminOnly: true,
        featureFlag: 'hrTimeclockEnabled',
      },
      { id: 'templates', label: 'Plantillas PDF', path: '/document-templates' },
      { id: 'users', label: 'Usuarios', path: '/users' },
      {
        id: 'custom-fields',
        label: 'Campos personalizados',
        path: '/custom-fields',
        adminOnly: true,
      },
      {
        id: 'dashboard-widgets',
        label: 'Widgets de dashboard',
        path: '/dashboard-widgets',
        adminOnly: true,
      },
      { id: 'webhooks', label: 'Webhooks', path: '/settings/webhooks', adminOnly: true },
      { id: 'api-tokens', label: 'Tokens de API', path: '/settings/api-tokens', adminOnly: true },
      { id: 'automations', label: 'Automatizaciones', path: '/automations', adminOnly: true },
      {
        id: 'data-import',
        label: 'Importación de datos',
        path: '/data-import',
        adminOnly: true,
      },
      { id: 'audit', label: 'Auditoría', path: '/audit-logs' },
      { id: 'tasks', label: 'Tareas', path: '/background-tasks' },
      { id: 'styleguide', label: 'Style Guide', path: '/ui' },
    ],
  },
  routes: [
    {
      pattern: '/settings/devices',
      Component: PhysicalDevices,
      title: 'Dispositivos físicos',
      iconName: 'Usb',
      permissionPath: '/hr/kiosks',
    },
    { pattern: '/profile', Component: UserProfile, title: 'Mi perfil', iconName: 'UserCircle' },
    {
      pattern: '/settings/company',
      Component: CompanySettings,
      title: 'Empresa',
      iconName: 'Building',
      permissionPath: '/settings/company',
    },
    {
      pattern: '/users',
      Component: Users,
      title: 'Usuarios',
      iconName: 'Users',
      permissionPath: '/users',
    },
    {
      pattern: '/custom-fields',
      Component: CustomFields,
      title: 'Campos personalizados',
      iconName: 'Wrench',
      permissionPath: '/custom-fields',
    },
    {
      pattern: '/dashboard-widgets',
      Component: DashboardWidgets,
      title: 'Widgets de dashboard',
      iconName: 'LayoutGrid',
      permissionPath: '/dashboard-widgets',
    },
    {
      pattern: '/settings/webhooks',
      Component: WebhooksSettings,
      title: 'Webhooks',
      iconName: 'Webhook',
      permissionPath: '/settings/webhooks',
    },
    {
      pattern: '/settings/api-tokens',
      Component: ApiTokens,
      title: 'Tokens de API',
      iconName: 'Key',
      permissionPath: '/settings/api-tokens',
    },
    {
      pattern: '/automations',
      Component: Automations,
      title: 'Automatizaciones',
      iconName: 'Zap',
      permissionPath: '/automations',
    },
    {
      pattern: '/companies/new',
      Component: NewCompany,
      title: 'Nueva Empresa',
      iconName: 'Building',
      permissionPath: '/companies/new',
    },
    {
      pattern: '/ui',
      Component: StyleGuide,
      title: 'Dev Console',
      iconName: 'Terminal',
      permissionPath: '/ui',
    },
  ],
};
