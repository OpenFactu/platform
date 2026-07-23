import type { ModuleManifest } from '../types';
import { ReportsHub } from './pages/ReportsHub';
import { ReportJournal } from './pages/ReportJournal';
import { ReportLedger } from './pages/ReportLedger';
import { ReportTrialBalance } from './pages/ReportTrialBalance';
import { ReportPL } from './pages/ReportPL';
import { ReportBalanceSheet } from './pages/ReportBalanceSheet';
import { ReportVAT } from './pages/ReportVAT';
import { ReportProfitCustomer } from './pages/ReportProfitCustomer';
import { ReportProfitItem } from './pages/ReportProfitItem';
import { ReportProfitProject } from './pages/ReportProfitProject';
import { ReportProfitCostCenter } from './pages/ReportProfitCostCenter';
import { ReportExecutive } from './pages/ReportExecutive';
import { ReportAging } from './pages/ReportAging';
import { ReportCashflow } from './pages/ReportCashflow';
import { ReportPayslip } from './pages/ReportPayslip';
import { ReportLaborCost } from './pages/ReportLaborCost';
import { ReportHeadcount } from './pages/ReportHeadcount';
import { ReportStockValuation } from './pages/ReportStockValuation';
import { ReportStockRotation } from './pages/ReportStockRotation';
import { ReportStockMovements } from './pages/ReportStockMovements';

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
  routes: [
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
  ],
};
