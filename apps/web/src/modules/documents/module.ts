import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const SalesQuotes = lazy(() =>
  import('./pages/SalesQuotes').then((m) => ({ default: m.SalesQuotes })),
);
const SalesOrders = lazy(() =>
  import('./pages/SalesOrders').then((m) => ({ default: m.SalesOrders })),
);
const SalesDeliveryNotes = lazy(() =>
  import('./pages/SalesDeliveryNotes').then((m) => ({ default: m.SalesDeliveryNotes })),
);
const SalesInvoices = lazy(() =>
  import('./pages/SalesInvoices').then((m) => ({ default: m.SalesInvoices })),
);
const PurchaseOrders = lazy(() =>
  import('./pages/PurchaseOrders').then((m) => ({ default: m.PurchaseOrders })),
);
const PurchaseDeliveryNotes = lazy(() =>
  import('./pages/PurchaseDeliveryNotes').then((m) => ({ default: m.PurchaseDeliveryNotes })),
);
const PurchaseInvoices = lazy(() =>
  import('./pages/PurchaseInvoices').then((m) => ({ default: m.PurchaseInvoices })),
);
const Documents = lazy(() => import('./pages/Documents'));
const DocumentSeries = lazy(() =>
  import('./pages/DocumentSeries').then((m) => ({ default: m.DocumentSeries })),
);
const PriceLists = lazy(() =>
  import('./pages/PriceLists').then((m) => ({ default: m.PriceLists })),
);

/**
 * Motor de documentos (ventas + compras). Un solo módulo es dueño de las
 * páginas de los 6 tipos de documento y aporta DOS entradas de navbar
 * (Ventas y Compras) — comparten componentes y adaptadores.
 */
export const documentsModule: ModuleManifest = {
  nav: [
    {
      id: 'sales',
      label: 'doc.nav.sales',
      icon: 'ShoppingCart',
      hiddenInLogisticsOnly: true,
      featureFlag: 'salesEnabled',
      description: 'doc.nav.salesDescription',
      category: 'Ventas y compras',
      subTabs: [
        { id: 'sales-quotes', label: 'doc.nav.quotes', path: '/sales/quotes' },
        { id: 'sales-orders', label: 'doc.nav.orders', path: '/sales-orders' },
        {
          id: 'sales-delivery-notes',
          label: 'doc.nav.deliveryNotes',
          path: '/sales/delivery-notes',
        },
        { id: 'sales-invoices', label: 'doc.nav.invoices', path: '/sales/invoices' },
        { id: 'pricelists', label: 'doc.nav.priceLists', path: '/pricelists' },
      ],
    },
    {
      id: 'purchases',
      label: 'doc.nav.purchases',
      icon: 'Truck',
      hiddenInLogisticsOnly: true,
      featureFlag: 'purchasesEnabled',
      description: 'doc.nav.purchasesDescription',
      category: 'Ventas y compras',
      subTabs: [
        { id: 'purchase-orders', label: 'doc.nav.orders', path: '/purchase-orders' },
        {
          id: 'purchase-delivery-notes',
          label: 'doc.nav.deliveryNotes',
          path: '/purchases/delivery-notes',
        },
        { id: 'purchase-invoices', label: 'doc.nav.invoices', path: '/purchases/invoices' },
      ],
    },
  ],
  routes: [
    // Ventas
    ...['/sales/quotes', '/sales/quotes/new', '/sales/quotes/:id', '/sales/quotes/:id/edit'].map(
      (pattern, i) => ({
        pattern,
        Component: SalesQuotes,
        title: [
          'doc.routes.quotes',
          'doc.routes.newQuote',
          'doc.routes.quote',
          'doc.routes.editQuote',
        ][i],
        iconName: 'FileSignature',
        permissionPath: '/sales/quotes',
      }),
    ),
    ...['/sales-orders', '/sales-orders/new', '/sales-orders/:id'].map((pattern, i) => ({
      pattern,
      Component: SalesOrders,
      title: i === 1 ? 'doc.routes.newSO' : i === 2 ? 'doc.types.SO' : 'doc.typesPlural.SO',
      iconName: 'FileDigit',
      permissionPath: '/sales-orders',
    })),
    ...['/sales/delivery-notes', '/sales/delivery-notes/new', '/sales/delivery-notes/:id'].map(
      (pattern, i) => ({
        pattern,
        Component: SalesDeliveryNotes,
        title: i === 1 ? 'doc.routes.newSDN' : i === 2 ? 'doc.types.SDN' : 'doc.typesPlural.SDN',
        iconName: 'Truck',
        permissionPath: '/sales/delivery-notes',
      }),
    ),
    ...['/sales/invoices', '/sales/invoices/new', '/sales/invoices/:id'].map((pattern, i) => ({
      pattern,
      Component: SalesInvoices,
      title: i === 1 ? 'doc.routes.newSINV' : i === 2 ? 'doc.types.SINV' : 'doc.typesPlural.SINV',
      iconName: 'FileStack',
      permissionPath: '/sales/invoices',
    })),
    // Compras
    ...['/purchase-orders', '/purchase-orders/new', '/purchase-orders/:id'].map((pattern, i) => ({
      pattern,
      Component: PurchaseOrders,
      title: i === 1 ? 'doc.routes.newPO' : i === 2 ? 'doc.types.PO' : 'doc.typesPlural.PO',
      iconName: 'FileDigit',
      permissionPath: '/purchase-orders',
    })),
    ...[
      '/purchases/delivery-notes',
      '/purchases/delivery-notes/new',
      '/purchases/delivery-notes/:id',
    ].map((pattern, i) => ({
      pattern,
      Component: PurchaseDeliveryNotes,
      title: i === 1 ? 'doc.routes.newPDN' : i === 2 ? 'doc.types.PDN' : 'doc.typesPlural.PDN',
      iconName: 'Truck',
      permissionPath: '/purchases/delivery-notes',
    })),
    ...['/purchases/invoices', '/purchases/invoices/new', '/purchases/invoices/:id'].map(
      (pattern, i) => ({
        pattern,
        Component: PurchaseInvoices,
        title: i === 1 ? 'doc.routes.newPINV' : i === 2 ? 'doc.types.PINV' : 'doc.typesPlural.PINV',
        iconName: 'FileStack',
        permissionPath: '/purchases/invoices',
      }),
    ),
    // Router unificado de documentos
    ...['/documents/:docType', '/documents/:docType/new', '/documents/:docType/:id'].map(
      (pattern, i) => ({
        pattern,
        Component: Documents,
        title:
          i === 1
            ? 'doc.routes.newDocument'
            : i === 2
              ? 'doc.routes.document'
              : 'doc.routes.documents',
        iconName: 'FileText',
        permissionPath: '/documents',
      }),
    ),
    {
      pattern: '/pricelists',
      Component: PriceLists,
      title: 'doc.nav.priceLists',
      iconName: 'Zap',
      permissionPath: '/pricelists',
    },
    // Series de numeración
    {
      pattern: '/document-series',
      Component: DocumentSeries,
      title: 'doc.routes.documentSeries',
      iconName: 'FileDigit',
      permissionPath: '/document-series',
    },
  ],
};
