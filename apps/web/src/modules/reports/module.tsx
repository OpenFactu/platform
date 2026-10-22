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
    label: 'Informes',
    icon: 'BarChart3',
    featureFlag: 'reportsEnabled',
    description: 'Informes contables, de gestión, RRHH y stock.',
    category: 'Análisis',
    subTabs: [
      { id: 'accounting-reports', label: 'Contabilidad', path: '/reports/accounting' },
      { id: 'management-reports', label: 'Gestión', path: '/reports/management' },
      { id: 'hr-reports', label: 'RRHH', path: '/reports/hr' },
      { id: 'stock-reports', label: 'Stock', path: '/reports/stock' },
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
    // Contabilidad
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
    // Gestión
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
    // RRHH
    { pattern: '/reports/hr/payslip', Component: ReportPayslip, title: 'Recibo nómina' },
    { pattern: '/reports/hr/labor-cost', Component: ReportLaborCost, title: 'Coste laboral' },
    { pattern: '/reports/hr/headcount', Component: ReportHeadcount, title: 'Plantilla' },
    // Stock
    { pattern: '/reports/stock/valuation', Component: ReportStockValuation, title: 'Valoración' },
    { pattern: '/reports/stock/rotation', Component: ReportStockRotation, title: 'Rotación' },
    { pattern: '/reports/stock/movements', Component: ReportStockMovements, title: 'Movimientos' },
  ]),
};
