/**
 * Registro de módulos top-level del navbar.
 *
 * Cada módulo es un icono en el sidebar de 60px (IconSidebar). Cuando está activo,
 * la topbar (ModuleTabBar) muestra sus sub-tabs.
 *
 * Los plugins pueden:
 *   - Registrar sus propios módulos (manifest.ui.modules)
 *   - Inyectar sub-tabs en módulos existentes (manifest.ui.subTabs)
 *
 * El merge se hace en PluginContext.
 */

export interface SubTab {
  id: string;
  label: string;
  path: string;
  /** Nombre de un icono lucide-react. Opcional. */
  icon?: string;
  /** Si es true, solo se muestra en el menú para usuarios ADMIN/SUPERUSER. */
  adminOnly?: boolean;
  /** Si se pasa, el sub-tab solo se renderiza si `flags[featureFlag] === true`. */
  featureFlag?: string;
  /** Etiqueta de grupo: tabs con el mismo `group` se colapsan en un
   *  desplegable en la barra superior. Sin `group` = tab visible inline. */
  group?: string;
  /** Estado de madurez. Se muestra como badge en el menú lateral. */
  status?: 'alpha' | 'beta' | 'dev';
}

export interface Module {
  id: string;
  label: string;
  /** Nombre de un icono lucide-react. */
  icon: string;
  subTabs: SubTab[];
  /** Si es true, solo se renderiza en el sidebar para usuarios con rol SUPERUSER. */
  superuserOnly?: boolean;
  /** Si se pasa, el módulo solo se renderiza si `flags[featureFlag] === true`. */
  featureFlag?: string;
  /** Si es true, el módulo se esconde cuando el flag `logisticsOnly` está activo
   *  (modo "sólo logística" para clientes que nos contratan únicamente el
   *  módulo de reparto). Se marcan los módulos que NO son logísticos. */
  hiddenInLogisticsOnly?: boolean;
}

/**
 * Entradas de navbar de módulos AÚN NO migrados a manifiesto propio
 * (src/modules/<nombre>/module.ts). Cada fase de la modularización mueve su
 * entrada de aquí a su module.ts. `CORE_MODULES` se compone en ./index.ts.
 */
export const LEGACY_NAV: Module[] = [
  {
    id: 'home',
    label: 'Inicio',
    icon: 'Home',
    subTabs: [{ id: 'dashboard', label: 'Dashboard', path: '/' }],
  },
  {
    id: 'logistics',
    label: 'Logística',
    icon: 'Route',
    /** Visible solo si `flags.logisticsEnabled=true`. El filtrado lo hace
     *  `PluginContext` al mergear módulos. */
    featureFlag: 'logisticsEnabled',
    subTabs: [
      { id: 'logistics-hub', label: 'Centro logístico', path: '/logistics', status: 'beta' },
      { id: 'carriers', label: 'Transportistas', path: '/settings/carriers', status: 'beta' },
    ],
  },
  {
    id: 'assistant',
    label: 'Asistente IA',
    icon: 'Bot',
    subTabs: [{ id: 'ai-chat', label: 'Keiro', path: '/ai/chat', status: 'beta' }],
  },
  {
    id: 'plugins',
    label: 'Plugins',
    icon: 'Puzzle',
    subTabs: [{ id: 'plugins-manager', label: 'Gestor', path: '/plugins' }],
  },
  {
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
  {
    id: 'system',
    label: 'Sistema',
    icon: 'Activity',
    superuserOnly: true,
    subTabs: [
      { id: 'cockpit', label: 'Cockpit', path: '/system/cockpit' },
      { id: 'tasks', label: 'Tareas en 2º plano', path: '/background-tasks' },
    ],
  },
];

/**
 * Encuentra el módulo activo dado un pathname.
 * Hace match exacto primero, luego prefijo más largo.
 */
export function findActiveModule(modules: Module[], pathname: string): Module {
  // Match exacto en sub-tab path
  for (const m of modules) {
    if (m.subTabs.some((s) => s.path === pathname)) return m;
  }
  // Match por prefijo (ej: /items/abc-123 → catálogo)
  let best: { module: Module; depth: number } | null = null;
  for (const m of modules) {
    for (const s of m.subTabs) {
      if (s.path !== '/' && pathname.startsWith(s.path)) {
        const depth = s.path.length;
        if (!best || depth > best.depth) best = { module: m, depth };
      }
    }
  }
  if (best) return best.module;
  // Fallback al primer módulo (Home)
  return modules[0];
}
