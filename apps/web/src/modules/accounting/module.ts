import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const ChartOfAccounts = lazy(() =>
  import('./pages/ChartOfAccounts').then((m) => ({ default: m.ChartOfAccounts })),
);
const JournalEntries = lazy(() =>
  import('./pages/JournalEntries').then((m) => ({ default: m.JournalEntries })),
);
const Ledger = lazy(() => import('./pages/Ledger').then((m) => ({ default: m.Ledger })));
const AccountingPeriods = lazy(() =>
  import('./pages/AccountingPeriods').then((m) => ({ default: m.AccountingPeriods })),
);
const Taxes = lazy(() => import('./pages/Taxes').then((m) => ({ default: m.Taxes })));

export const accountingModule: ModuleManifest = {
  nav: {
    id: 'accounting',
    label: 'Contabilidad',
    icon: 'Wallet',
    hiddenInLogisticsOnly: true,
    featureFlag: 'accountingEnabled',
    description: 'Plan contable, asientos, libro mayor, periodos e impuestos.',
    category: 'Finanzas',
    subTabs: [
      { id: 'chart', label: 'Plan contable', path: '/chart-of-accounts' },
      { id: 'journal-entries', label: 'Asientos', path: '/journal-entries' },
      { id: 'ledger', label: 'Libro mayor', path: '/ledger' },
      { id: 'periods', label: 'Periodos', path: '/accounting-periods' },
      // La ruta /document-series vive aún en el módulo documents (legacy hasta su fase).
      { id: 'series', label: 'Series', path: '/document-series' },
      { id: 'taxes', label: 'Impuestos', path: '/taxes' },
    ],
  },
  routes: [
    {
      pattern: '/chart-of-accounts',
      Component: ChartOfAccounts,
      title: 'Plan contable',
      iconName: 'BookOpen',
      permissionPath: '/chart-of-accounts',
    },
    {
      pattern: '/journal-entries',
      Component: JournalEntries,
      title: 'Asientos',
      iconName: 'ScrollText',
      permissionPath: '/journal-entries',
    },
    {
      pattern: '/ledger',
      Component: Ledger,
      title: 'Libro mayor',
      iconName: 'BookOpenCheck',
      permissionPath: '/ledger',
    },
    {
      pattern: '/accounting-periods',
      Component: AccountingPeriods,
      title: 'Periodos',
      iconName: 'Calendar',
      permissionPath: '/accounting-periods',
    },
    {
      pattern: '/taxes',
      Component: Taxes,
      title: 'Impuestos',
      iconName: 'Percent',
      permissionPath: '/taxes',
    },
  ],
};
