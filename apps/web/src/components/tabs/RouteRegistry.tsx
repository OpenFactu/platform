import { matchRoutes } from 'react-router-dom';
import { moduleRoutes } from '@/modules';
import type { RouteEntry, RouteMeta } from '@/modules/types';
import { Dashboard } from '../../pages/Dashboard';
import { StyleGuide } from '../../pages/StyleGuide';
import { PluginManager } from '../../pages/PluginManager';
import { Users } from '../../pages/Users';
import { PriceLists } from '../../pages/PriceLists';
import { CarriersSettings } from '../../pages/settings/CarriersSettings';
import { WebhooksSettings } from '../../pages/settings/WebhooksSettings';
import { UserProfile } from '../../pages/UserProfile';
import { ReportsHub } from '../../pages/reports/ReportsHub';
import { ReportJournal } from '../../pages/reports/ReportJournal';
import { ReportLedger } from '../../pages/reports/ReportLedger';
import { ReportTrialBalance } from '../../pages/reports/ReportTrialBalance';
import { ReportPL } from '../../pages/reports/ReportPL';
import { ReportBalanceSheet } from '../../pages/reports/ReportBalanceSheet';
import { ReportVAT } from '../../pages/reports/ReportVAT';
import { ReportProfitCustomer } from '../../pages/reports/ReportProfitCustomer';
import { ReportProfitItem } from '../../pages/reports/ReportProfitItem';
import { ReportProfitProject } from '../../pages/reports/ReportProfitProject';
import { ReportProfitCostCenter } from '../../pages/reports/ReportProfitCostCenter';
import { ReportExecutive } from '../../pages/reports/ReportExecutive';
import { ReportAging } from '../../pages/reports/ReportAging';
import { ReportCashflow } from '../../pages/reports/ReportCashflow';
import { ReportPayslip } from '../../pages/reports/ReportPayslip';
import { ReportLaborCost } from '../../pages/reports/ReportLaborCost';
import { ReportHeadcount } from '../../pages/reports/ReportHeadcount';
import { ReportStockValuation } from '../../pages/reports/ReportStockValuation';
import { ReportStockRotation } from '../../pages/reports/ReportStockRotation';
import { ReportStockMovements } from '../../pages/reports/ReportStockMovements';
import { Employees } from '../../pages/hr/Employees';
import { Departments as HrDepartments } from '../../pages/hr/Departments';
import { Payrolls } from '../../pages/hr/Payrolls';
import { PayrollConcepts } from '../../pages/hr/PayrollConcepts';
import { IncidentTypes } from '../../pages/hr/IncidentTypes';
import { Incidents } from '../../pages/hr/Incidents';
import { ShiftTemplates } from '../../pages/hr/ShiftTemplates';
import { ShiftPatterns } from '../../pages/hr/ShiftPatterns';
import { Planning } from '../../pages/hr/Planning';
import { Timeclock } from '../../pages/hr/Timeclock';
import { Kiosks } from '../../pages/hr/Kiosks';
import { CollectiveAgreements } from '../../pages/hr/CollectiveAgreements';
import { Evaluations } from '../../pages/hr/Evaluations';
import { Objectives } from '../../pages/hr/Objectives';
import { Commissions } from '../../pages/hr/Commissions';
import { Performance } from '../../pages/hr/Performance';
import { LaborCost } from '../../pages/hr/LaborCost';
import { Tasks } from '../../pages/hr/Tasks';
import { Gantt } from '../../pages/hr/Gantt';
import { PurchaseOrders } from '../../pages/Documents/PurchaseOrders';
import { PurchaseDeliveryNotes } from '../../pages/Documents/PurchaseDeliveryNotes';
import { PurchaseInvoices } from '../../pages/Documents/PurchaseInvoices';
import { SalesOrders } from '../../pages/Documents/SalesOrders';
import { SalesDeliveryNotes } from '../../pages/Documents/SalesDeliveryNotes';
import { SalesInvoices } from '../../pages/Documents/SalesInvoices';
import { AuditLogs } from '../../pages/AuditLogs';
import { BackgroundTasks } from '../../pages/BackgroundTasks';
import { CompanySettings } from '../../pages/CompanySettings';
import { ApiTokens } from '../../pages/ApiTokens';
import { NewCompany } from '../../pages/NewCompany';
import { ServerCockpit } from '../../pages/ServerCockpit';
import { CustomFields } from '../../pages/CustomFields';
import { DashboardWidgets } from '../../pages/DashboardWidgets';
import { Automations } from '../../pages/Automations';
import { LogisticsHub } from '../../pages/logistics/LogisticsHub';
import { ShipmentDetail } from '../../pages/logistics/ShipmentDetail';
import { DriverApp } from '../../pages/logistics/DriverApp';
import { UserTableList } from '../../pages/user-tables/UserTableList';
import { UserTableDetail } from '../../pages/user-tables/UserTableDetail';
import Documents from '../../pages/Documents/Documents';
import { DocumentTemplateDesigner } from '../../pages/Documents/DocumentTemplateDesigner';
import { DocumentTemplates } from '../../pages/Documents/DocumentTemplates';
import { AiChat } from '../../pages/AiChat';
import { DocumentSeries } from '../../pages/Documents/DocumentSeries';

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
    pattern: '/purchase-orders',
    Component: PurchaseOrders,
    title: 'Pedidos Compra',
    iconName: 'FileDigit',
    permissionPath: '/purchase-orders',
  },
  {
    pattern: '/purchase-orders/new',
    Component: PurchaseOrders,
    title: 'Nuevo Pedido Compra',
    iconName: 'FileDigit',
    permissionPath: '/purchase-orders',
  },
  {
    pattern: '/purchase-orders/:id',
    Component: PurchaseOrders,
    title: 'Pedido Compra',
    iconName: 'FileDigit',
    permissionPath: '/purchase-orders',
  },
  {
    pattern: '/purchases/delivery-notes',
    Component: PurchaseDeliveryNotes,
    title: 'Albaranes Compra',
    iconName: 'Truck',
    permissionPath: '/purchases/delivery-notes',
  },
  {
    pattern: '/purchases/delivery-notes/new',
    Component: PurchaseDeliveryNotes,
    title: 'Nuevo Albarán Compra',
    iconName: 'Truck',
    permissionPath: '/purchases/delivery-notes',
  },
  {
    pattern: '/purchases/delivery-notes/:id',
    Component: PurchaseDeliveryNotes,
    title: 'Albarán Compra',
    iconName: 'Truck',
    permissionPath: '/purchases/delivery-notes',
  },
  {
    pattern: '/purchases/invoices',
    Component: PurchaseInvoices,
    title: 'Facturas Compra',
    iconName: 'FileStack',
    permissionPath: '/purchases/invoices',
  },
  {
    pattern: '/purchases/invoices/new',
    Component: PurchaseInvoices,
    title: 'Nueva Factura Compra',
    iconName: 'FileStack',
    permissionPath: '/purchases/invoices',
  },
  {
    pattern: '/purchases/invoices/:id',
    Component: PurchaseInvoices,
    title: 'Factura Compra',
    iconName: 'FileStack',
    permissionPath: '/purchases/invoices',
  },
  {
    pattern: '/sales-orders',
    Component: SalesOrders,
    title: 'Pedidos Venta',
    iconName: 'FileDigit',
    permissionPath: '/sales-orders',
  },
  {
    pattern: '/sales-orders/new',
    Component: SalesOrders,
    title: 'Nuevo Pedido Venta',
    iconName: 'FileDigit',
    permissionPath: '/sales-orders',
  },
  {
    pattern: '/sales-orders/:id',
    Component: SalesOrders,
    title: 'Pedido Venta',
    iconName: 'FileDigit',
    permissionPath: '/sales-orders',
  },
  {
    pattern: '/sales/delivery-notes',
    Component: SalesDeliveryNotes,
    title: 'Albaranes Venta',
    iconName: 'Truck',
    permissionPath: '/sales/delivery-notes',
  },
  {
    pattern: '/sales/delivery-notes/new',
    Component: SalesDeliveryNotes,
    title: 'Nuevo Albarán Venta',
    iconName: 'Truck',
    permissionPath: '/sales/delivery-notes',
  },
  {
    pattern: '/sales/delivery-notes/:id',
    Component: SalesDeliveryNotes,
    title: 'Albarán Venta',
    iconName: 'Truck',
    permissionPath: '/sales/delivery-notes',
  },
  {
    pattern: '/sales/invoices',
    Component: SalesInvoices,
    title: 'Facturas Venta',
    iconName: 'FileStack',
    permissionPath: '/sales/invoices',
  },
  {
    pattern: '/sales/invoices/new',
    Component: SalesInvoices,
    title: 'Nueva Factura Venta',
    iconName: 'FileStack',
    permissionPath: '/sales/invoices',
  },
  {
    pattern: '/sales/invoices/:id',
    Component: SalesInvoices,
    title: 'Factura Venta',
    iconName: 'FileStack',
    permissionPath: '/sales/invoices',
  },
  // ── Unified Documents Router ────────────────────────────────────
  {
    pattern: '/documents/:docType',
    Component: Documents,
    title: 'Documentos',
    iconName: 'FileText',
    permissionPath: '/documents',
  },
  {
    pattern: '/documents/:docType/new',
    Component: Documents,
    title: 'Nuevo Documento',
    iconName: 'FileText',
    permissionPath: '/documents',
  },
  {
    pattern: '/documents/:docType/:id',
    Component: Documents,
    title: 'Documento',
    iconName: 'FileText',
    permissionPath: '/documents',
  },
  {
    pattern: '/profile',
    Component: UserProfile,
    title: 'Mi perfil',
    iconName: 'UserCircle',
  },
  // Informes — hubs por categoría
  {
    pattern: '/reports/accounting',
    Component: () => <ReportsHub category="accounting" />,
    title: 'Informes contables',
    iconName: 'FileBarChart',
  },
  {
    pattern: '/reports/management',
    Component: () => <ReportsHub category="management" />,
    title: 'Informes de gestión',
    iconName: 'FileBarChart',
  },
  {
    pattern: '/reports/hr',
    Component: () => <ReportsHub category="hr" />,
    title: 'Informes RRHH',
    iconName: 'FileBarChart',
  },
  {
    pattern: '/reports/stock',
    Component: () => <ReportsHub category="stock" />,
    title: 'Informes stock',
    iconName: 'FileBarChart',
  },
  // Informes contables individuales
  { pattern: '/reports/accounting/journal', Component: ReportJournal, title: 'Diario' },
  { pattern: '/reports/accounting/ledger', Component: ReportLedger, title: 'Mayor' },
  {
    pattern: '/reports/accounting/trial-balance',
    Component: ReportTrialBalance,
    title: 'Sumas y saldos',
  },
  { pattern: '/reports/accounting/pl', Component: ReportPL, title: 'P&L' },
  {
    pattern: '/reports/accounting/balance-sheet',
    Component: ReportBalanceSheet,
    title: 'Balance situación',
  },
  { pattern: '/reports/accounting/vat', Component: ReportVAT, title: 'Libro IVA' },
  // Ola 3 — Gestión
  {
    pattern: '/reports/management/profit-customer',
    Component: ReportProfitCustomer,
    title: 'Rent. cliente',
  },
  {
    pattern: '/reports/management/profit-item',
    Component: ReportProfitItem,
    title: 'Rent. producto',
  },
  {
    pattern: '/reports/management/profit-project',
    Component: ReportProfitProject,
    title: 'Rent. proyecto',
  },
  {
    pattern: '/reports/management/profit-cost-center',
    Component: ReportProfitCostCenter,
    title: 'Rent. CC',
  },
  { pattern: '/reports/management/executive', Component: ReportExecutive, title: 'Ejecutivo' },
  {
    pattern: '/reports/management/aging-receivables',
    Component: () => <ReportAging kind="receivables" />,
    title: 'Aging cobros',
  },
  {
    pattern: '/reports/management/aging-payables',
    Component: () => <ReportAging kind="payables" />,
    title: 'Aging pagos',
  },
  { pattern: '/reports/management/cashflow', Component: ReportCashflow, title: 'Cash-flow' },
  // Ola 4 — RRHH
  { pattern: '/reports/hr/payslip', Component: ReportPayslip, title: 'Recibo nómina' },
  { pattern: '/reports/hr/labor-cost', Component: ReportLaborCost, title: 'Coste laboral' },
  { pattern: '/reports/hr/headcount', Component: ReportHeadcount, title: 'Plantilla' },
  // Ola 5 — Stock
  { pattern: '/reports/stock/valuation', Component: ReportStockValuation, title: 'Valoración' },
  { pattern: '/reports/stock/rotation', Component: ReportStockRotation, title: 'Rotación' },
  { pattern: '/reports/stock/movements', Component: ReportStockMovements, title: 'Movimientos' },
  {
    pattern: '/hr/employees',
    Component: Employees,
    title: 'Empleados',
    iconName: 'UserRound',
    permissionPath: '/hr/employees',
  },
  {
    pattern: '/hr/departments',
    Component: HrDepartments,
    title: 'Departamentos',
    iconName: 'Building2',
    permissionPath: '/hr/departments',
  },
  {
    pattern: '/hr/payrolls',
    Component: Payrolls,
    title: 'Nóminas',
    iconName: 'Banknote',
    permissionPath: '/hr/payrolls',
  },
  {
    pattern: '/hr/payroll-concepts',
    Component: PayrollConcepts,
    title: 'Conceptos de nómina',
    iconName: 'ListChecks',
    permissionPath: '/hr/payroll-concepts',
  },
  {
    pattern: '/hr/incident-types',
    Component: IncidentTypes,
    title: 'Tipos de incidencia',
    iconName: 'AlertOctagon',
    permissionPath: '/hr/incident-types',
  },
  {
    pattern: '/hr/incidents',
    Component: Incidents,
    title: 'Incidencias',
    iconName: 'AlertTriangle',
    permissionPath: '/hr/incidents',
  },
  {
    pattern: '/hr/shift-templates',
    Component: ShiftTemplates,
    title: 'Plantillas de turno',
    iconName: 'Clock',
    permissionPath: '/hr/shift-templates',
  },
  {
    pattern: '/hr/shift-patterns',
    Component: ShiftPatterns,
    title: 'Patrones de turno',
    iconName: 'Repeat',
    permissionPath: '/hr/shift-patterns',
  },
  {
    pattern: '/hr/planning',
    Component: Planning,
    title: 'Planificación',
    iconName: 'CalendarDays',
    permissionPath: '/hr/planning',
  },
  {
    pattern: '/hr/timeclock',
    Component: Timeclock,
    title: 'Mis fichajes',
    iconName: 'Timer',
    permissionPath: '/hr/timeclock',
  },
  {
    pattern: '/hr/kiosks',
    Component: Kiosks,
    title: 'Kioskos de fichaje',
    iconName: 'Tablet',
    permissionPath: '/hr/kiosks',
  },
  {
    pattern: '/hr/collective-agreements',
    Component: CollectiveAgreements,
    title: 'Convenios colectivos',
    iconName: 'BookOpen',
    permissionPath: '/hr/collective-agreements',
  },
  {
    pattern: '/hr/evaluations',
    Component: Evaluations,
    title: 'Evaluaciones',
    iconName: 'ClipboardCheck',
    permissionPath: '/hr/evaluations',
  },
  {
    pattern: '/hr/objectives',
    Component: Objectives,
    title: 'Objetivos',
    iconName: 'Target',
    permissionPath: '/hr/objectives',
  },
  {
    pattern: '/hr/commissions',
    Component: Commissions,
    title: 'Comisiones',
    iconName: 'Percent',
    permissionPath: '/hr/commissions',
  },
  {
    pattern: '/hr/performance',
    Component: Performance,
    title: 'Rendimiento',
    iconName: 'TrendingUp',
    permissionPath: '/hr/performance',
  },
  {
    pattern: '/hr/labor-cost',
    Component: LaborCost,
    title: 'Coste laboral',
    iconName: 'PiggyBank',
    permissionPath: '/hr/labor-cost',
  },
  {
    pattern: '/hr/tasks',
    Component: Tasks,
    title: 'Tareas',
    iconName: 'ListTodo',
    permissionPath: '/hr/tasks',
  },
  {
    pattern: '/hr/gantt',
    Component: Gantt,
    title: 'Gantt',
    iconName: 'GanttChart',
    permissionPath: '/hr/gantt',
  },
  {
    pattern: '/document-series',
    Component: DocumentSeries,
    title: 'Series Doc.',
    iconName: 'FileDigit',
    permissionPath: '/document-series',
  },
  {
    pattern: '/document-templates',
    Component: DocumentTemplates,
    title: 'Plantillas PDF',
    iconName: 'FileCode',
    permissionPath: '/document-templates',
  },
  {
    pattern: '/ai/chat',
    Component: AiChat,
    title: 'Asistente IA',
    iconName: 'Bot',
    permissionPath: '/ai/chat',
  },
  {
    pattern: '/document-templates/:id/designer',
    Component: DocumentTemplateDesigner,
    title: 'Diseñador de plantilla',
    iconName: 'FileCode',
    permissionPath: '/document-templates',
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
