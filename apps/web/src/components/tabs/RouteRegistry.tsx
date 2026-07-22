import { matchRoutes } from 'react-router-dom';
import { moduleRoutes } from '@/modules';
import type { RouteEntry, RouteMeta } from '@/modules/types';
import { Dashboard } from '@/pages/Dashboard';
import { StyleGuide } from '@/pages/StyleGuide';
import { PluginManager } from '@/pages/PluginManager';
import { Users } from '@/pages/Users';
import { PriceLists } from '@/pages/PriceLists';
import { CarriersSettings } from '@/pages/settings/CarriersSettings';
import { WebhooksSettings } from '@/pages/settings/WebhooksSettings';
import { UserProfile } from '@/pages/UserProfile';
import { AuditLogs } from '@/pages/AuditLogs';
import { BackgroundTasks } from '@/pages/BackgroundTasks';
import { CompanySettings } from '@/pages/CompanySettings';
import { ApiTokens } from '@/pages/ApiTokens';
import { NewCompany } from '@/pages/NewCompany';
import { ServerCockpit } from '@/pages/ServerCockpit';
import { CustomFields } from '@/pages/CustomFields';
import { DashboardWidgets } from '@/pages/DashboardWidgets';
import { Automations } from '@/pages/Automations';
import { LogisticsHub } from '@/pages/logistics/LogisticsHub';
import { ShipmentDetail } from '@/pages/logistics/ShipmentDetail';
import { DriverApp } from '@/pages/logistics/DriverApp';
import { UserTableList } from '@/pages/user-tables/UserTableList';
import { UserTableDetail } from '@/pages/user-tables/UserTableDetail';
import { AiChat } from '@/pages/AiChat';

export type { RouteEntry, RouteMeta } from '@/modules/types';

/**
 * Rutas de módulos AÚN NO migrados a manifiesto propio
 * (src/modules/<nombre>/module.ts). Cada fase de la modularización mueve las
 * suyas a su module.ts; `staticRoutes` combina manifiestos + legacy.
 */
const legacyRoutes: RouteEntry[] = [
  { pattern: '/', Component: Dashboard, title: 'Dashboard', iconName: 'BarChart3' },
  {
    pattern: '/plugins',
    Component: PluginManager,
    title: 'Plugins',
    iconName: 'Layers',
    permissionPath: '/plugins',
  },
  {
    pattern: '/users',
    Component: Users,
    title: 'Usuarios',
    iconName: 'Users',
    permissionPath: '/users',
  },
  {
    pattern: '/audit-logs',
    Component: AuditLogs,
    title: 'Auditoría',
    iconName: 'ClipboardList',
    permissionPath: '/audit-logs',
  },
  {
    pattern: '/background-tasks',
    Component: BackgroundTasks,
    title: 'Tareas',
    iconName: 'Activity',
    permissionPath: '/audit-logs',
  },
  {
    pattern: '/pricelists',
    Component: PriceLists,
    title: 'Tarifas',
    iconName: 'Zap',
    permissionPath: '/pricelists',
  },
  {
    pattern: '/settings/carriers',
    Component: CarriersSettings,
    title: 'Transportistas',
    iconName: 'Truck',
    permissionPath: '/settings/carriers',
  },
  {
    pattern: '/settings/webhooks',
    Component: WebhooksSettings,
    title: 'Webhooks',
    iconName: 'Webhook',
    permissionPath: '/settings/webhooks',
  },
  {
    pattern: '/profile',
    Component: UserProfile,
    title: 'Mi perfil',
    iconName: 'UserCircle',
  },
  {
    pattern: '/ai/chat',
    Component: AiChat,
    title: 'Asistente IA',
    iconName: 'Bot',
    permissionPath: '/ai/chat',
  },
  {
    pattern: '/settings/company',
    Component: CompanySettings,
    title: 'Empresa',
    iconName: 'Building',
    permissionPath: '/settings/company',
  },
  {
    pattern: '/settings/api-tokens',
    Component: ApiTokens,
    title: 'Tokens de API',
    iconName: 'Key',
    permissionPath: '/settings/api-tokens',
  },
  {
    pattern: '/companies/new',
    Component: NewCompany,
    title: 'Nueva Empresa',
    iconName: 'Building',
    permissionPath: '/companies/new',
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
    pattern: '/automations',
    Component: Automations,
    title: 'Automatizaciones',
    iconName: 'Zap',
    permissionPath: '/automations',
  },
  {
    pattern: '/logistics',
    Component: LogisticsHub,
    title: 'Logística',
    iconName: 'Truck',
    permissionPath: '/logistics',
  },
  {
    pattern: '/logistics/shipments/:id',
    Component: ShipmentDetail,
    title: 'Envío',
    iconName: 'Truck',
    permissionPath: '/logistics',
  },
  {
    pattern: '/driver',
    Component: DriverApp,
    title: 'Mi ruta',
    iconName: 'Navigation',
  },
  {
    pattern: '/u/:name',
    Component: UserTableList,
    title: 'Tabla',
    iconName: 'Table',
  },
  {
    pattern: '/u/:name/new',
    Component: UserTableDetail,
    title: 'Nuevo registro',
    iconName: 'Table',
  },
  {
    pattern: '/u/:name/:id',
    Component: UserTableDetail,
    title: 'Registro',
    iconName: 'Table',
  },
  {
    pattern: '/system/cockpit',
    Component: ServerCockpit,
    title: 'Cockpit',
    iconName: 'Activity',
    permissionPath: '/system/cockpit',
  },
  {
    pattern: '/ui',
    Component: StyleGuide,
    title: 'Dev Console',
    iconName: 'Terminal',
    permissionPath: '/ui',
  },
];

export const staticRoutes: RouteEntry[] = [...moduleRoutes, ...legacyRoutes];

const matchCandidates = staticRoutes.map((r) => ({ path: r.pattern }));

export function resolveRouteMeta(pathname: string): RouteMeta | null {
  const matches = matchRoutes(matchCandidates, pathname);
  if (!matches || matches.length === 0) return null;
  const matched = matches[0].route;
  const entry = staticRoutes.find((r) => r.pattern === matched.path);
  if (!entry) return null;
  return { title: entry.title, iconName: entry.iconName, permissionPath: entry.permissionPath };
}
