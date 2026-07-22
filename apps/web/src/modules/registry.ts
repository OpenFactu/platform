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
    id: 'inventory',
    label: 'Inventario',
    icon: 'Package',
    subTabs: [
      { id: 'items', label: 'Catálogo', path: '/items' },
      { id: 'categories', label: 'Categorías', path: '/categories' },
      { id: 'uom', label: 'Unidades', path: '/uom' },
      { id: 'warehouses', label: 'Almacenes', path: '/warehouses' },
      { id: 'stock-movements', label: 'Movimientos', path: '/inventory/movements' },
    ],
  },
  {
    id: 'sales',
    label: 'Ventas',
    icon: 'ShoppingCart',
    hiddenInLogisticsOnly: true,
    subTabs: [
      { id: 'sales-orders', label: 'Pedidos', path: '/sales-orders' },
      { id: 'sales-delivery-notes', label: 'Albaranes', path: '/sales/delivery-notes' },
      { id: 'sales-invoices', label: 'Facturas', path: '/sales/invoices' },
      { id: 'pricelists', label: 'Tarifas', path: '/pricelists' },
    ],
  },
  {
    id: 'purchases',
    label: 'Compras',
    icon: 'Truck',
    hiddenInLogisticsOnly: true,
    subTabs: [
      { id: 'purchase-orders', label: 'Pedidos', path: '/purchase-orders' },
      { id: 'purchase-delivery-notes', label: 'Albaranes', path: '/purchases/delivery-notes' },
      { id: 'purchase-invoices', label: 'Facturas', path: '/purchases/invoices' },
    ],
  },
  {
    id: 'partners',
    label: 'Interlocutores',
    icon: 'Users',
    subTabs: [
      { id: 'partners-list', label: 'Directorio', path: '/partners' },
      { id: 'partner-groups', label: 'Grupos', path: '/partner-groups' },
    ],
  },
  {
    id: 'accounting',
    label: 'Contabilidad',
    icon: 'Wallet',
    hiddenInLogisticsOnly: true,
    subTabs: [
      { id: 'chart', label: 'Plan contable', path: '/chart-of-accounts' },
      { id: 'journal-entries', label: 'Asientos', path: '/journal-entries' },
      { id: 'ledger', label: 'Libro mayor', path: '/ledger' },
      { id: 'periods', label: 'Periodos', path: '/accounting-periods' },
      { id: 'series', label: 'Series', path: '/document-series' },
      { id: 'taxes', label: 'Impuestos', path: '/taxes' },
    ],
  },
  {
    id: 'analytics',
    label: 'Analítica',
    icon: 'Layers',
    hiddenInLogisticsOnly: true,
    subTabs: [
      { id: 'cost-centers', label: 'Centros de coste', path: '/cost-centers' },
      { id: 'profit-centers', label: 'Centros de beneficio', path: '/profit-centers' },
      { id: 'internal-orders', label: 'Proyectos/Órdenes', path: '/internal-orders' },
    ],
  },
  {
    id: 'reports',
    label: 'Informes',
    icon: 'BarChart3',
    subTabs: [
      { id: 'accounting-reports', label: 'Contabilidad', path: '/reports/accounting' },
      { id: 'management-reports', label: 'Gestión', path: '/reports/management' },
      { id: 'hr-reports', label: 'RRHH', path: '/reports/hr' },
      { id: 'stock-reports', label: 'Stock', path: '/reports/stock' },
    ],
  },
  {
    id: 'hr',
    hiddenInLogisticsOnly: true,
    label: 'Recursos Humanos',
    icon: 'UsersRound',
    subTabs: [
      // Inline (sin grupo)
      { id: 'employees', label: 'Empleados', path: '/hr/employees' },
      { id: 'departments', label: 'Departamentos', path: '/hr/departments' },
      // Grupo: Nóminas
      { id: 'payrolls', label: 'Nóminas', path: '/hr/payrolls', group: 'Nóminas' },
      {
        id: 'payroll-concepts',
        label: 'Conceptos de nómina',
        path: '/hr/payroll-concepts',
        group: 'Nóminas',
      },
      // Grupo: Tiempo y turnos
      {
        id: 'timeclock',
        label: 'Mis fichajes',
        path: '/hr/timeclock',
        featureFlag: 'hrTimeclockEnabled',
        group: 'Tiempo y turnos',
        status: 'beta',
      },
      {
        id: 'kiosks',
        label: 'Kioskos de fichaje',
        path: '/hr/kiosks',
        featureFlag: 'hrTimeclockEnabled',
        group: 'Tiempo y turnos',
        status: 'beta',
      },
      {
        id: 'shift-templates',
        label: 'Plantillas de turno',
        path: '/hr/shift-templates',
        featureFlag: 'hrShiftsEnabled',
        group: 'Tiempo y turnos',
        status: 'beta',
      },
      {
        id: 'shift-patterns',
        label: 'Patrones de turno',
        path: '/hr/shift-patterns',
        featureFlag: 'hrShiftsEnabled',
        group: 'Tiempo y turnos',
        status: 'beta',
      },
      {
        id: 'planning',
        label: 'Planificación',
        path: '/hr/planning',
        featureFlag: 'hrPlanningEnabled',
        group: 'Tiempo y turnos',
        status: 'beta',
      },
      // Grupo: Incidencias
      {
        id: 'incidents',
        label: 'Incidencias',
        path: '/hr/incidents',
        featureFlag: 'hrIncidentsEnabled',
        group: 'Incidencias',
        status: 'beta',
      },
      {
        id: 'incident-types',
        label: 'Tipos de incidencia',
        path: '/hr/incident-types',
        featureFlag: 'hrIncidentsEnabled',
        group: 'Incidencias',
        status: 'beta',
      },
      // Grupo: Avanzado+ (rendimientos, comisiones, evaluaciones, tareas)
      {
        id: 'performance',
        label: 'Rendimiento',
        path: '/hr/performance',
        featureFlag: 'hrAdvancedEnabled',
        group: 'Avanzado+',
        status: 'alpha',
      },
      {
        id: 'labor-cost',
        label: 'Coste laboral',
        path: '/hr/labor-cost',
        featureFlag: 'hrAdvancedEnabled',
        group: 'Avanzado+',
        status: 'alpha',
      },
      {
        id: 'commissions',
        label: 'Comisiones',
        path: '/hr/commissions',
        featureFlag: 'hrAdvancedEnabled',
        group: 'Avanzado+',
        status: 'alpha',
      },
      {
        id: 'evaluations',
        label: 'Evaluaciones',
        path: '/hr/evaluations',
        featureFlag: 'hrAdvancedEnabled',
        group: 'Avanzado+',
        status: 'alpha',
      },
      {
        id: 'objectives',
        label: 'Objetivos',
        path: '/hr/objectives',
        featureFlag: 'hrAdvancedEnabled',
        group: 'Avanzado+',
        status: 'alpha',
      },
      {
        id: 'collective-agreements',
        label: 'Convenios',
        path: '/hr/collective-agreements',
        featureFlag: 'hrAdvancedEnabled',
        group: 'Avanzado+',
        status: 'alpha',
      },
      {
        id: 'tasks',
        label: 'Tareas',
        path: '/hr/tasks',
        featureFlag: 'hrAdvancedEnabled',
        group: 'Avanzado+',
        status: 'alpha',
      },
      {
        id: 'gantt',
        label: 'Gantt',
        path: '/hr/gantt',
        featureFlag: 'hrAdvancedEnabled',
        group: 'Avanzado+',
        status: 'alpha',
      },
    ],
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
