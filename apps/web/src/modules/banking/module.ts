import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const BankAccounts = lazy(() =>
  import('./pages/BankAccounts').then((m) => ({ default: m.BankAccounts })),
);
const BankReconciliation = lazy(() =>
  import('./pages/BankReconciliation').then((m) => ({ default: m.BankReconciliation })),
);
const PaymentBatches = lazy(() =>
  import('./pages/PaymentBatches').then((m) => ({ default: m.PaymentBatches })),
);
const PaymentBatchCreate = lazy(() =>
  import('./pages/PaymentBatchCreate').then((m) => ({ default: m.PaymentBatchCreate })),
);
const PaymentBatchDetail = lazy(() =>
  import('./pages/PaymentBatchDetail').then((m) => ({ default: m.PaymentBatchDetail })),
);

export const bankingModule: ModuleManifest = {
  nav: {
    id: 'banking',
    label: 'banking.nav.label',
    icon: 'Landmark',
    hiddenInLogisticsOnly: true,
    featureFlag: 'accountingEnabled',
    description: 'banking.nav.description',
    category: 'Finanzas',
    subTabs: [
      {
        id: 'reconciliation',
        label: 'banking.nav.reconciliation',
        path: '/banking/reconciliation',
      },
      { id: 'batches', label: 'banking.nav.batches', path: '/banking/batches' },
      { id: 'accounts', label: 'banking.nav.accounts', path: '/banking/accounts' },
    ],
  },
  routes: [
    {
      pattern: '/banking/reconciliation',
      Component: BankReconciliation,
      title: 'banking.nav.reconciliation',
      iconName: 'ArrowLeftRight',
      permissionPath: '/banking/reconciliation',
    },
    {
      pattern: '/banking/batches',
      Component: PaymentBatches,
      title: 'banking.nav.batches',
      iconName: 'Send',
      permissionPath: '/banking/batches',
    },
    {
      pattern: '/banking/batches/new',
      Component: PaymentBatchCreate,
      title: 'banking.batches.new',
      iconName: 'Send',
      permissionPath: '/banking/batches',
    },
    {
      pattern: '/banking/batches/:id',
      Component: PaymentBatchDetail,
      title: 'banking.nav.batches',
      iconName: 'Send',
      permissionPath: '/banking/batches',
    },
    {
      pattern: '/banking/accounts',
      Component: BankAccounts,
      title: 'banking.nav.accounts',
      iconName: 'Landmark',
      permissionPath: '/banking/accounts',
    },
  ],
};
