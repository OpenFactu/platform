/**
 * Catálogo de permisos: la ÚNICA lista de qué se puede conceder o denegar.
 *
 * Antes había tres fuentes que nadie sincronizaba — una constante dentro de la
 * página de Usuarios, los `permissionPath` de los manifiestos de la web, y un
 * servidor que no comprobaba nada. El resultado: 27 pantallas exigían un
 * permiso que el administrador no podía conceder, 6 permisos concedibles no
 * gobernaban ninguna pantalla, y los 24 informes no pedían permiso alguno, así
 * que cualquier usuario veía el libro de IVA y el coste laboral.
 *
 * Ahora manda esta lista. La pantalla de Usuarios la pide por
 * `GET /api/permissions/catalog` en vez de llevarla escrita, y el gate de la
 * API (`mountApi` en `server.ts`) solo admite rutas que estén aquí.
 *
 * Una `path` es la clave que se guarda en el permiso del usuario y la misma
 * que declaran las rutas de la web en su `permissionPath`. Que coincidan no es
 * casualidad ni se deja a la buena fe: `check-permissions.ts` lo comprueba.
 */

export interface PermissionEntry {
  /** Clave del permiso. Coincide con el `permissionPath` de la ruta en la web. */
  path: string;
  label: string;
  group: string;
  /**
   * Pantalla contenedora. Si se concede este permiso, el padre se ve en el
   * menú aunque no esté concedido — si no, para llegar a un informe habría
   * que conceder también su portada, y eso no lo adivina nadie.
   */
  parent?: string;
  /** No se ofrece en la pantalla de Usuarios: solo lo tiene SUPERUSER. */
  superuserOnly?: boolean;
  /** Qué gobierna, cuando el nombre no basta. Se enseña como ayuda. */
  hint?: string;
}

export const PERMISSION_CATALOG: PermissionEntry[] = [
  // ── Catálogos ─────────────────────────────────────────────────────────────
  { path: '/items', label: 'Artículos', group: 'Catálogos' },
  { path: '/categories', label: 'Categorías', group: 'Catálogos' },
  { path: '/uom', label: 'Unidades de medida', group: 'Catálogos' },
  { path: '/taxes', label: 'Impuestos', group: 'Catálogos' },
  { path: '/warehouses', label: 'Almacenes', group: 'Catálogos' },
  { path: '/pricelists', label: 'Tarifas', group: 'Catálogos' },
  {
    path: '/inventory/movements',
    label: 'Movimientos de inventario',
    group: 'Catálogos',
    hint: 'El histórico de entradas y salidas de cada artículo.',
  },

  // ── Terceros ──────────────────────────────────────────────────────────────
  { path: '/partners', label: 'Interlocutores', group: 'Terceros' },
  { path: '/partner-groups', label: 'Grupos de interlocutores', group: 'Terceros' },

  // ── CRM ───────────────────────────────────────────────────────────────────
  {
    path: '/crm/opportunities',
    label: 'Oportunidades',
    group: 'CRM',
    hint: 'El embudo de ventas y sus etapas.',
  },
  { path: '/crm/contacts', label: 'Contactos', group: 'CRM' },
  { path: '/crm/activities', label: 'Actividades comerciales', group: 'CRM' },
  {
    path: '/crm/forms',
    label: 'Formularios y encuestas',
    group: 'CRM',
    hint: 'Crearlos, ver sus respuestas y mandar encuestas a los contactos.',
  },
  {
    path: '/crm/settings',
    label: 'Ajustes del CRM',
    group: 'CRM',
    hint: 'Motivos de pérdida, orígenes, responsable por defecto y avisos.',
  },

  // ── Ventas ────────────────────────────────────────────────────────────────
  { path: '/sales/quotes', label: 'Presupuestos', group: 'Ventas' },
  { path: '/sales-orders', label: 'Pedidos de venta', group: 'Ventas' },
  { path: '/sales/delivery-notes', label: 'Albaranes de venta', group: 'Ventas' },
  { path: '/sales/invoices', label: 'Facturas de venta', group: 'Ventas' },

  // ── Compras ───────────────────────────────────────────────────────────────
  { path: '/purchase-orders', label: 'Pedidos de compra', group: 'Compras' },
  { path: '/purchases/delivery-notes', label: 'Albaranes de compra', group: 'Compras' },
  { path: '/purchases/invoices', label: 'Facturas de compra', group: 'Compras' },

  // ── Documentos (transversal) ──────────────────────────────────────────────
  {
    path: '/documents',
    label: 'Documentos (vista unificada)',
    group: 'Documentos',
    hint: 'La pantalla genérica /documents/:tipo y la API unificada que usan todos los tipos.',
  },
  { path: '/document-series', label: 'Series de numeración', group: 'Documentos' },
  { path: '/document-templates', label: 'Plantillas PDF', group: 'Documentos' },

  // ── Contabilidad ──────────────────────────────────────────────────────────
  { path: '/chart-of-accounts', label: 'Plan contable', group: 'Contabilidad' },
  { path: '/journal-entries', label: 'Asientos', group: 'Contabilidad' },
  { path: '/ledger', label: 'Mayor', group: 'Contabilidad' },
  { path: '/accounting-periods', label: 'Ejercicios y periodos', group: 'Contabilidad' },
  {
    path: '/payments',
    label: 'Cobros y pagos',
    group: 'Contabilidad',
    hint: 'Registrar cobros y pagos sobre facturas. No tiene pantalla propia: se opera desde la factura.',
  },

  // ── Analítica ─────────────────────────────────────────────────────────────
  { path: '/cost-centers', label: 'Centros de coste', group: 'Analítica' },
  { path: '/profit-centers', label: 'Centros de beneficio', group: 'Analítica' },
  { path: '/internal-orders', label: 'Órdenes internas', group: 'Analítica' },

  // ── Informes ──────────────────────────────────────────────────────────────
  // Son los datos más sensibles de la empresa y hasta ahora NO pedían permiso.
  // Uno por informe: quien lleva almacén no tiene por qué ver el P&L.
  { path: '/reports/accounting', label: 'Portada · Contabilidad', group: 'Informes' },
  {
    path: '/reports/accounting/journal',
    label: 'Libro diario',
    group: 'Informes',
    parent: '/reports/accounting',
  },
  {
    path: '/reports/accounting/ledger',
    label: 'Libro mayor',
    group: 'Informes',
    parent: '/reports/accounting',
  },
  {
    path: '/reports/accounting/trial-balance',
    label: 'Sumas y saldos',
    group: 'Informes',
    parent: '/reports/accounting',
  },
  {
    path: '/reports/accounting/pl',
    label: 'Pérdidas y ganancias',
    group: 'Informes',
    parent: '/reports/accounting',
  },
  {
    path: '/reports/accounting/balance-sheet',
    label: 'Balance de situación',
    group: 'Informes',
    parent: '/reports/accounting',
  },
  {
    path: '/reports/accounting/vat',
    label: 'Libro de IVA',
    group: 'Informes',
    parent: '/reports/accounting',
  },

  { path: '/reports/management', label: 'Portada · Gestión', group: 'Informes' },
  {
    path: '/reports/management/profit-customer',
    label: 'Margen por cliente',
    group: 'Informes',
    parent: '/reports/management',
  },
  {
    path: '/reports/management/profit-item',
    label: 'Margen por artículo',
    group: 'Informes',
    parent: '/reports/management',
  },
  {
    path: '/reports/management/profit-project',
    label: 'Margen por proyecto',
    group: 'Informes',
    parent: '/reports/management',
  },
  {
    path: '/reports/management/profit-cost-center',
    label: 'Margen por centro de coste',
    group: 'Informes',
    parent: '/reports/management',
  },
  {
    path: '/reports/management/executive',
    label: 'Cuadro ejecutivo',
    group: 'Informes',
    parent: '/reports/management',
  },
  {
    path: '/reports/management/aging-receivables',
    label: 'Vencimientos de cobro',
    group: 'Informes',
    parent: '/reports/management',
  },
  {
    path: '/reports/management/aging-payables',
    label: 'Vencimientos de pago',
    group: 'Informes',
    parent: '/reports/management',
  },
  {
    path: '/reports/management/cashflow',
    label: 'Cash-flow',
    group: 'Informes',
    parent: '/reports/management',
  },

  { path: '/reports/hr', label: 'Portada · RRHH', group: 'Informes' },
  {
    path: '/reports/hr/payslip',
    label: 'Recibos de nómina',
    group: 'Informes',
    parent: '/reports/hr',
  },
  {
    path: '/reports/hr/labor-cost',
    label: 'Coste laboral',
    group: 'Informes',
    parent: '/reports/hr',
  },
  { path: '/reports/hr/headcount', label: 'Plantilla', group: 'Informes', parent: '/reports/hr' },

  { path: '/reports/stock', label: 'Portada · Stock', group: 'Informes' },
  {
    path: '/reports/stock/valuation',
    label: 'Valoración de existencias',
    group: 'Informes',
    parent: '/reports/stock',
  },
  {
    path: '/reports/stock/rotation',
    label: 'Rotación',
    group: 'Informes',
    parent: '/reports/stock',
  },
  {
    path: '/reports/stock/movements',
    label: 'Movimientos',
    group: 'Informes',
    parent: '/reports/stock',
  },

  // ── Recursos humanos ──────────────────────────────────────────────────────
  { path: '/hr/employees', label: 'Empleados', group: 'Recursos humanos' },
  { path: '/hr/departments', label: 'Departamentos', group: 'Recursos humanos' },
  { path: '/hr/payrolls', label: 'Nóminas', group: 'Recursos humanos' },
  { path: '/hr/payroll-concepts', label: 'Conceptos de nómina', group: 'Recursos humanos' },
  { path: '/hr/contracts', label: 'Contratos', group: 'Recursos humanos' },
  { path: '/hr/incident-types', label: 'Tipos de incidencia', group: 'Recursos humanos' },
  { path: '/hr/incidents', label: 'Incidencias', group: 'Recursos humanos' },
  { path: '/hr/shift-templates', label: 'Plantillas de turno', group: 'Recursos humanos' },
  { path: '/hr/shift-patterns', label: 'Patrones de turno', group: 'Recursos humanos' },
  { path: '/hr/planning', label: 'Planificación', group: 'Recursos humanos' },
  { path: '/hr/timeclock', label: 'Fichajes', group: 'Recursos humanos' },
  { path: '/hr/kiosks', label: 'Kioskos de fichaje', group: 'Recursos humanos' },

  { path: '/hr/collective-agreements', label: 'Convenios colectivos', group: 'RRHH avanzado' },
  { path: '/hr/evaluations', label: 'Evaluaciones', group: 'RRHH avanzado' },
  { path: '/hr/objectives', label: 'Objetivos', group: 'RRHH avanzado' },
  { path: '/hr/commissions', label: 'Comisiones', group: 'RRHH avanzado' },
  { path: '/hr/performance', label: 'Rendimiento', group: 'RRHH avanzado' },
  { path: '/hr/labor-cost', label: 'Coste laboral', group: 'RRHH avanzado' },
  { path: '/hr/tasks', label: 'Tareas', group: 'RRHH avanzado' },
  { path: '/hr/gantt', label: 'Gantt', group: 'RRHH avanzado' },

  // ── Logística ─────────────────────────────────────────────────────────────
  // El centro logístico es UNA pantalla con pestañas dentro, no cinco. Antes se
  // ofrecían cinco permisos (envíos, rutas, zonas…) que no gobernaban nada:
  // marcarlos o no daba exactamente igual.
  {
    path: '/logistics',
    label: 'Centro logístico',
    group: 'Logística',
    hint: 'Envíos, rutas y seguimiento — es una sola pantalla con pestañas.',
  },
  { path: '/settings/carriers', label: 'Transportistas', group: 'Logística' },
  { path: '/logistics/zones', label: 'Zonas de almacén', group: 'Logística' },
  {
    path: '/logistics/stock-movements',
    label: 'Traslados, entradas y salidas',
    group: 'Logística',
  },

  // ── Website ───────────────────────────────────────────────────────────────
  { path: '/website/pages', label: 'Páginas de la web', group: 'Website' },
  { path: '/website/messages', label: 'Mensajes del formulario', group: 'Website' },
  { path: '/website/settings', label: 'Ajustes de la web', group: 'Website' },

  // ── Configuración ─────────────────────────────────────────────────────────
  { path: '/users', label: 'Usuarios y permisos', group: 'Configuración' },
  { path: '/settings/company', label: 'Datos de la empresa', group: 'Configuración' },
  { path: '/custom-fields', label: 'Campos personalizados', group: 'Configuración' },
  { path: '/user-tables', label: 'Tablas propias', group: 'Configuración' },
  { path: '/dashboard-widgets', label: 'Widgets del panel', group: 'Configuración' },
  { path: '/settings/webhooks', label: 'Webhooks', group: 'Configuración' },
  { path: '/settings/api-tokens', label: 'Tokens de API', group: 'Configuración' },
  { path: '/automations', label: 'Automatizaciones', group: 'Configuración' },
  { path: '/data-import', label: 'Importación de datos', group: 'Configuración' },
  { path: '/apps', label: 'Aplicaciones y plugins', group: 'Configuración' },
  { path: '/audit-logs', label: 'Auditoría', group: 'Configuración' },
  { path: '/background-tasks', label: 'Tareas en segundo plano', group: 'Configuración' },
  { path: '/ai/chat', label: 'Asistente de IA', group: 'Configuración' },

  // ── Plataforma (no se ofrece: solo SUPERUSER) ─────────────────────────────
  {
    path: '/system/cockpit',
    label: 'Cockpit del servidor',
    group: 'Plataforma',
    superuserOnly: true,
  },
  { path: '/companies/new', label: 'Alta de empresas', group: 'Plataforma', superuserOnly: true },
  { path: '/ui', label: 'Guía de estilos', group: 'Plataforma', superuserOnly: true },
];

/**
 * Pantallas que ve cualquier usuario autenticado, sin permiso que valga.
 *
 * Son las que no enseñan datos de negocio: su propio perfil y la portada. Sin
 * esto, un usuario recién creado no tendría ni dónde aterrizar al entrar.
 */
export const ALWAYS_ALLOWED_PATHS = new Set(['/', '/profile']);

const byPath = new Map(PERMISSION_CATALOG.map((e) => [e.path, e]));

export function isKnownPermission(path: string): boolean {
  return byPath.has(path);
}

export function getPermissionEntry(path: string): PermissionEntry | undefined {
  return byPath.get(path);
}

/** Hijos directos de una pantalla contenedora (los informes de una portada). */
export function childrenOf(path: string): PermissionEntry[] {
  return PERMISSION_CATALOG.filter((e) => e.parent === path);
}

/** El catálogo agrupado y sin lo que solo ve SUPERUSER, para la pantalla de Usuarios. */
export function catalogForAdmins(): Array<{ group: string; items: PermissionEntry[] }> {
  const groups: Array<{ group: string; items: PermissionEntry[] }> = [];
  for (const entry of PERMISSION_CATALOG) {
    if (entry.superuserOnly) continue;
    let bucket = groups.find((g) => g.group === entry.group);
    if (!bucket) {
      bucket = { group: entry.group, items: [] };
      groups.push(bucket);
    }
    bucket.items.push(entry);
  }
  return groups;
}
