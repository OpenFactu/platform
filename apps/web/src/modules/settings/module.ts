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
    label: 'settings.nav.configuration',
    icon: 'SlidersHorizontal',
    subTabs: [
      { id: 'profile', label: 'settings.nav.profile', path: '/profile' },
      { id: 'company', label: 'settings.nav.company', path: '/settings/company' },
      { id: 'users', label: 'settings.nav.users', path: '/users' },
      // Cómo se ven y qué campos llevan los datos y documentos de la empresa.
      {
        id: 'templates',
        label: 'settings.nav.templates',
        path: '/document-templates',
        group: 'settings.nav.groups.customization',
      },
      {
        id: 'custom-fields',
        label: 'settings.nav.customFields',
        path: '/custom-fields',
        adminOnly: true,
        group: 'settings.nav.groups.customization',
      },
      {
        id: 'dashboard-widgets',
        label: 'settings.nav.dashboardWidgets',
        path: '/dashboard-widgets',
        adminOnly: true,
        group: 'settings.nav.groups.customization',
      },
      // Todo lo que conecta Keirost con otros sistemas o mueve datos de golpe.
      {
        id: 'automations',
        label: 'settings.nav.automations',
        path: '/automations',
        adminOnly: true,
        group: 'settings.nav.groups.integrations',
      },
      {
        id: 'webhooks',
        label: 'settings.nav.webhooks',
        path: '/settings/webhooks',
        adminOnly: true,
        group: 'settings.nav.groups.integrations',
      },
      {
        id: 'api-tokens',
        label: 'settings.nav.apiTokens',
        path: '/settings/api-tokens',
        adminOnly: true,
        group: 'settings.nav.groups.integrations',
      },
      {
        id: 'data-import',
        label: 'settings.nav.dataImport',
        path: '/data-import',
        adminOnly: true,
        group: 'settings.nav.groups.integrations',
      },
      // Hardware, trazas y herramientas de desarrollo. «Tareas en 2º plano» ya
      // vive en el módulo Sistema, así que no se repite aquí.
      {
        id: 'physical-devices',
        label: 'settings.nav.physicalDevices',
        path: '/settings/devices',
        adminOnly: true,
        featureFlag: 'hrTimeclockEnabled',
        group: 'settings.nav.groups.devicesSystem',
      },
      {
        id: 'audit',
        label: 'settings.nav.audit',
        path: '/audit-logs',
        group: 'settings.nav.groups.devicesSystem',
      },
      {
        id: 'styleguide',
        label: 'settings.nav.styleGuide',
        path: '/ui',
        group: 'settings.nav.groups.devicesSystem',
        status: 'dev',
      },
    ],
  },
  routes: [
    {
      pattern: '/settings/devices',
      Component: PhysicalDevices,
      title: 'settings.nav.physicalDevices',
      iconName: 'Usb',
      permissionPath: '/hr/kiosks',
    },
    {
      pattern: '/profile',
      Component: UserProfile,
      title: 'settings.nav.profile',
      iconName: 'UserCircle',
    },
    {
      pattern: '/settings/company',
      Component: CompanySettings,
      title: 'settings.nav.company',
      iconName: 'Building',
      permissionPath: '/settings/company',
    },
    {
      pattern: '/users',
      Component: Users,
      title: 'settings.nav.users',
      iconName: 'Users',
      permissionPath: '/users',
    },
    {
      pattern: '/custom-fields',
      Component: CustomFields,
      title: 'settings.nav.customFields',
      iconName: 'Wrench',
      permissionPath: '/custom-fields',
    },
    {
      pattern: '/dashboard-widgets',
      Component: DashboardWidgets,
      title: 'settings.nav.dashboardWidgets',
      iconName: 'LayoutGrid',
      permissionPath: '/dashboard-widgets',
    },
    {
      pattern: '/settings/webhooks',
      Component: WebhooksSettings,
      title: 'settings.nav.webhooks',
      iconName: 'Webhook',
      permissionPath: '/settings/webhooks',
    },
    {
      pattern: '/settings/api-tokens',
      Component: ApiTokens,
      title: 'settings.nav.apiTokens',
      iconName: 'Key',
      permissionPath: '/settings/api-tokens',
    },
    {
      pattern: '/automations',
      Component: Automations,
      title: 'settings.nav.automations',
      iconName: 'Zap',
      permissionPath: '/automations',
    },
    {
      pattern: '/companies/new',
      Component: NewCompany,
      title: 'settings.nav.newCompany',
      iconName: 'Building',
      permissionPath: '/companies/new',
    },
    {
      pattern: '/ui',
      Component: StyleGuide,
      title: 'settings.nav.devConsole',
      iconName: 'Terminal',
      permissionPath: '/ui',
    },
  ],
};
