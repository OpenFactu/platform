import { lazy } from 'react';
import { withPermissionFromPattern, type ModuleManifest } from '../types';

const ReportsHub = lazy(() =>
  import('./pages/ReportsHub').then((m) => ({ default: m.ReportsHub })),
);
const ReportJournal = lazy(() =>
  import('./pages/ReportJournal').then((m) => ({ default: m.ReportJournal })),
);
const ReportLedger = lazy(() =>
  import('./pages/ReportLedger').then((m) => ({ default: m.ReportLedger })),
);
const ReportTrialBalance = lazy(() =>
  import('./pages/ReportTrialBalance').then((m) => ({ default: m.ReportTrialBalance })),
);
const ReportPL = lazy(() => import('./pages/ReportPL').then((m) => ({ default: m.ReportPL })));
const ReportBalanceSheet = lazy(() =>
  import('./pages/ReportBalanceSheet').then((m) => ({ default: m.ReportBalanceSheet })),
);
const ReportVAT = lazy(() => import('./pages/ReportVAT').then((m) => ({ default: m.ReportVAT })));
const ReportProfitCustomer = lazy(() =>
  import('./pages/ReportProfitCustomer').then((m) => ({ default: m.ReportProfitCustomer })),
);
const ReportProfitItem = lazy(() =>
  import('./pages/ReportProfitItem').then((m) => ({ default: m.ReportProfitItem })),
);
const ReportProfitProject = lazy(() =>
  import('./pages/ReportProfitProject').then((m) => ({ default: m.ReportProfitProject })),
);
const ReportProfitCostCenter = lazy(() =>
  import('./pages/ReportProfitCostCenter').then((m) => ({ default: m.ReportProfitCostCenter })),
);
const ReportExecutive = lazy(() =>
  import('./pages/ReportExecutive').then((m) => ({ default: m.ReportExecutive })),
);
const ReportAging = lazy(() =>
  import('./pages/ReportAging').then((m) => ({ default: m.ReportAging })),
);
const ReportCashflow = lazy(() =>
  import('./pages/ReportCashflow').then((m) => ({ default: m.ReportCashflow })),
);
const ReportPayslip = lazy(() =>
  import('./pages/ReportPayslip').then((m) => ({ default: m.ReportPayslip })),
);
const ReportLaborCost = lazy(() =>
  import('./pages/ReportLaborCost').then((m) => ({ default: m.ReportLaborCost })),
);
const ReportHeadcount = lazy(() =>
  import('./pages/ReportHeadcount').then((m) => ({ default: m.ReportHeadcount })),
);
const ReportStockValuation = lazy(() =>
  import('./pages/ReportStockValuation').then((m) => ({ default: m.ReportStockValuation })),
);
const ReportStockRotation = lazy(() =>
  import('./pages/ReportStockRotation').then((m) => ({ default: m.ReportStockRotation })),
);
const ReportStockMovements = lazy(() =>
  import('./pages/ReportStockMovements').then((m) => ({ default: m.ReportStockMovements })),
);

export const reportsModule: ModuleManifest = {
  nav: {
    id: 'reports',
    label: 'reports.nav.label',
    icon: 'BarChart3',
    featureFlag: 'reportsEnabled',
    description: 'reports.nav.description',
    category: 'Análisis',
    subTabs: [
      { id: 'accounting-reports', label: 'reports.nav.accounting', path: '/reports/accounting' },
      { id: 'management-reports', label: 'reports.nav.management', path: '/reports/management' },
      { id: 'hr-reports', label: 'reports.nav.hr', path: '/reports/hr' },
      { id: 'stock-reports', label: 'reports.nav.stock', path: '/reports/stock' },
    ],
  },
  // Cada informe con su permiso: el libro de IVA y la rotación de stock no
  // son el mismo dato. Antes ninguna de estas rutas pedía permiso, así que
  // las veía cualquier usuario autenticado.
  routes: withPermissionFromPattern([
    // Hubs por categoría
    {
      pattern: '/reports/accounting',
      Component: () => <ReportsHub category="accounting" />,
      title: 'reports.hub.accounting.title',
      iconName: 'FileBarChart',
    },
    {
      pattern: '/reports/management',
      Component: () => <ReportsHub category="management" />,
      title: 'reports.hub.management.title',
      iconName: 'FileBarChart',
    },
    {
      pattern: '/reports/hr',
      Component: () => <ReportsHub category="hr" />,
      title: 'reports.nav.routes.hr',
      iconName: 'FileBarChart',
    },
    {
      pattern: '/reports/stock',
      Component: () => <ReportsHub category="stock" />,
      title: 'reports.nav.routes.stock',
      iconName: 'FileBarChart',
    },
    // Contabilidad
    {
      pattern: '/reports/accounting/journal',
      Component: ReportJournal,
      title: 'reports.nav.routes.journal',
    },
    {
      pattern: '/reports/accounting/ledger',
      Component: ReportLedger,
      title: 'reports.nav.routes.ledger',
    },
    {
      pattern: '/reports/accounting/trial-balance',
      Component: ReportTrialBalance,
      title: 'reports.nav.routes.trialBalance',
    },
    { pattern: '/reports/accounting/pl', Component: ReportPL, title: 'reports.nav.routes.pl' },
    {
      pattern: '/reports/accounting/balance-sheet',
      Component: ReportBalanceSheet,
      title: 'reports.nav.routes.balanceSheet',
    },
    { pattern: '/reports/accounting/vat', Component: ReportVAT, title: 'reports.nav.routes.vat' },
    // Gestión
    {
      pattern: '/reports/management/profit-customer',
      Component: ReportProfitCustomer,
      title: 'reports.nav.routes.profitCustomer',
    },
    {
      pattern: '/reports/management/profit-item',
      Component: ReportProfitItem,
      title: 'reports.nav.routes.profitItem',
    },
    {
      pattern: '/reports/management/profit-project',
      Component: ReportProfitProject,
      title: 'reports.nav.routes.profitProject',
    },
    {
      pattern: '/reports/management/profit-cost-center',
      Component: ReportProfitCostCenter,
      title: 'reports.nav.routes.profitCostCenter',
    },
    {
      pattern: '/reports/management/executive',
      Component: ReportExecutive,
      title: 'reports.nav.routes.executive',
    },
    {
      pattern: '/reports/management/aging-receivables',
      Component: () => <ReportAging kind="receivables" />,
      title: 'reports.nav.routes.agingReceivables',
    },
    {
      pattern: '/reports/management/aging-payables',
      Component: () => <ReportAging kind="payables" />,
      title: 'reports.nav.routes.agingPayables',
    },
    {
      pattern: '/reports/management/cashflow',
      Component: ReportCashflow,
      title: 'reports.nav.routes.cashflow',
    },
    // RRHH
    {
      pattern: '/reports/hr/payslip',
      Component: ReportPayslip,
      title: 'reports.nav.routes.payslip',
    },
    {
      pattern: '/reports/hr/labor-cost',
      Component: ReportLaborCost,
      title: 'reports.nav.routes.laborCost',
    },
    {
      pattern: '/reports/hr/headcount',
      Component: ReportHeadcount,
      title: 'reports.nav.routes.headcount',
    },
    // Stock
    {
      pattern: '/reports/stock/valuation',
      Component: ReportStockValuation,
      title: 'reports.nav.routes.stockValuation',
    },
    {
      pattern: '/reports/stock/rotation',
      Component: ReportStockRotation,
      title: 'reports.nav.routes.stockRotation',
    },
    {
      pattern: '/reports/stock/movements',
      Component: ReportStockMovements,
      title: 'reports.nav.routes.stockMovements',
    },
  ]),
};
