import type { ModuleManifest } from '../types';
import { UserProfile } from './pages/UserProfile';
import { CompanySettings } from './pages/CompanySettings';
import { Users } from './pages/Users';
import { CustomFields } from './pages/CustomFields';
import { DashboardWidgets } from './pages/DashboardWidgets';
import { WebhooksSettings } from './pages/WebhooksSettings';
import { ApiTokens } from './pages/ApiTokens';
import { Automations } from './pages/Automations';
import { NewCompany } from './pages/NewCompany';
import { StyleGuide } from './pages/StyleGuide';

export const settingsModule: ModuleManifest = {
  nav: {
    id: 'configuration',
    label: 'Configuración',
    icon: 'SlidersHorizontal',
    subTabs: [
      { id: 'profile', label: 'Mi perfil', path: '/profile' },
      { id: 'company', label: 'Empresa', path: '/settings/company' },
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
      { id: 'audit', label: 'Auditoría', path: '/audit-logs' },
      { id: 'tasks', label: 'Tareas', path: '/background-tasks' },
      { id: 'styleguide', label: 'Style Guide', path: '/ui' },
    ],
  },
  routes: [
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
