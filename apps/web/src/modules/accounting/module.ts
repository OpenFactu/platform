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
    label: 'accounting.nav.label',
    icon: 'Wallet',
    hiddenInLogisticsOnly: true,
    featureFlag: 'accountingEnabled',
    description: 'accounting.nav.description',
    category: 'Finanzas',
    subTabs: [
      { id: 'chart', label: 'accounting.nav.chart', path: '/chart-of-accounts' },
      { id: 'journal-entries', label: 'accounting.nav.journalEntries', path: '/journal-entries' },
      { id: 'ledger', label: 'accounting.nav.ledger', path: '/ledger' },
      { id: 'periods', label: 'accounting.nav.periods', path: '/accounting-periods' },
      // La ruta /document-series vive aún en el módulo documents (legacy hasta su fase).
      { id: 'series', label: 'accounting.nav.series', path: '/document-series' },
      { id: 'taxes', label: 'accounting.nav.taxes', path: '/taxes' },
    ],
  },
  routes: [
    {
      pattern: '/chart-of-accounts',
      Component: ChartOfAccounts,
      title: 'accounting.nav.chart',
      iconName: 'BookOpen',
      permissionPath: '/chart-of-accounts',
    },
    {
      pattern: '/journal-entries',
      Component: JournalEntries,
      title: 'accounting.nav.journalEntries',
      iconName: 'ScrollText',
      permissionPath: '/journal-entries',
    },
    {
      pattern: '/ledger',
      Component: Ledger,
      title: 'accounting.nav.ledger',
      iconName: 'BookOpenCheck',
      permissionPath: '/ledger',
    },
    {
      pattern: '/accounting-periods',
      Component: AccountingPeriods,
      title: 'accounting.nav.periods',
      iconName: 'Calendar',
      permissionPath: '/accounting-periods',
    },
    {
      pattern: '/taxes',
      Component: Taxes,
      title: 'accounting.nav.taxes',
      iconName: 'Percent',
      permissionPath: '/taxes',
    },
  ],
};
