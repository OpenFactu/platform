import type { ModuleManifest } from '../types';
import { SalesOrders } from './pages/SalesOrders';
import { SalesDeliveryNotes } from './pages/SalesDeliveryNotes';
import { SalesInvoices } from './pages/SalesInvoices';
import { PurchaseOrders } from './pages/PurchaseOrders';
import { PurchaseDeliveryNotes } from './pages/PurchaseDeliveryNotes';
import { PurchaseInvoices } from './pages/PurchaseInvoices';
import Documents from './pages/Documents';
import { DocumentSeries } from './pages/DocumentSeries';
import { PriceLists } from './pages/PriceLists';

/**
 * Motor de documentos (ventas + compras). Un solo módulo es dueño de las
 * páginas de los 6 tipos de documento y aporta DOS entradas de navbar
 * (Ventas y Compras) — comparten componentes y adaptadores.
 */
export const documentsModule: ModuleManifest = {
  nav: [
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
  ],
  routes: [
    // Ventas
    ...['/sales-orders', '/sales-orders/new', '/sales-orders/:id'].map((pattern, i) => ({
      pattern,
      Component: SalesOrders,
      title: i === 1 ? 'Nuevo Pedido Venta' : i === 2 ? 'Pedido Venta' : 'Pedidos Venta',
      iconName: 'FileDigit',
      permissionPath: '/sales-orders',
    })),
    ...['/sales/delivery-notes', '/sales/delivery-notes/new', '/sales/delivery-notes/:id'].map(
      (pattern, i) => ({
        pattern,
        Component: SalesDeliveryNotes,
        title: i === 1 ? 'Nuevo Albarán Venta' : i === 2 ? 'Albarán Venta' : 'Albaranes Venta',
        iconName: 'Truck',
        permissionPath: '/sales/delivery-notes',
      }),
    ),
    ...['/sales/invoices', '/sales/invoices/new', '/sales/invoices/:id'].map((pattern, i) => ({
      pattern,
      Component: SalesInvoices,
      title: i === 1 ? 'Nueva Factura Venta' : i === 2 ? 'Factura Venta' : 'Facturas Venta',
      iconName: 'FileStack',
      permissionPath: '/sales/invoices',
    })),
    // Compras
    ...['/purchase-orders', '/purchase-orders/new', '/purchase-orders/:id'].map((pattern, i) => ({
      pattern,
      Component: PurchaseOrders,
      title: i === 1 ? 'Nuevo Pedido Compra' : i === 2 ? 'Pedido Compra' : 'Pedidos Compra',
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
      title: i === 1 ? 'Nuevo Albarán Compra' : i === 2 ? 'Albarán Compra' : 'Albaranes Compra',
      iconName: 'Truck',
      permissionPath: '/purchases/delivery-notes',
    })),
    ...['/purchases/invoices', '/purchases/invoices/new', '/purchases/invoices/:id'].map(
      (pattern, i) => ({
        pattern,
        Component: PurchaseInvoices,
        title: i === 1 ? 'Nueva Factura Compra' : i === 2 ? 'Factura Compra' : 'Facturas Compra',
        iconName: 'FileStack',
        permissionPath: '/purchases/invoices',
      }),
    ),
    // Router unificado de documentos
    ...['/documents/:docType', '/documents/:docType/new', '/documents/:docType/:id'].map(
      (pattern, i) => ({
        pattern,
        Component: Documents,
        title: i === 1 ? 'Nuevo Documento' : i === 2 ? 'Documento' : 'Documentos',
        iconName: 'FileText',
        permissionPath: '/documents',
      }),
    ),
    {
      pattern: '/pricelists',
      Component: PriceLists,
      title: 'Tarifas',
      iconName: 'Zap',
      permissionPath: '/pricelists',
    },
    // Series de numeración
    {
      pattern: '/document-series',
      Component: DocumentSeries,
      title: 'Series Doc.',
      iconName: 'FileDigit',
      permissionPath: '/document-series',
    },
  ],
};
