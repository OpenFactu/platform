import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const Items = lazy(() => import('./pages/Items').then((m) => ({ default: m.Items })));
const ItemDetail = lazy(() =>
  import('./pages/ItemDetail').then((m) => ({ default: m.ItemDetail })),
);
const Categories = lazy(() =>
  import('./pages/Categories').then((m) => ({ default: m.Categories })),
);
const Uom = lazy(() => import('./pages/Uom').then((m) => ({ default: m.Uom })));
const Warehouses = lazy(() =>
  import('./pages/Warehouses').then((m) => ({ default: m.Warehouses })),
);
const StockMovements = lazy(() =>
  import('./pages/StockMovements').then((m) => ({ default: m.StockMovements })),
);

export const inventoryModule: ModuleManifest = {
  nav: {
    id: 'inventory',
    label: 'Inventario',
    icon: 'Package',
    featureFlag: 'inventoryEnabled',
    description: 'Catálogo, categorías, unidades, almacenes y movimientos de stock.',
    category: 'Operaciones',
    subTabs: [
      { id: 'items', label: 'Catálogo', path: '/items' },
      { id: 'categories', label: 'Categorías', path: '/categories' },
      { id: 'uom', label: 'Unidades', path: '/uom' },
      { id: 'warehouses', label: 'Almacenes', path: '/warehouses' },
      { id: 'stock-movements', label: 'Movimientos', path: '/inventory/movements' },
    ],
  },
  routes: [
    {
      pattern: '/items',
      Component: Items,
      title: 'Catálogo',
      iconName: 'Grid',
      permissionPath: '/items',
    },
    {
      pattern: '/items/:itemId',
      Component: ItemDetail,
      title: 'Ficha de artículo',
      iconName: 'Package',
      permissionPath: '/items',
    },
    {
      pattern: '/categories',
      Component: Categories,
      title: 'Categorías',
      iconName: 'Hash',
      permissionPath: '/categories',
    },
    {
      pattern: '/uom',
      Component: Uom,
      title: 'Unidades',
      iconName: 'Boxes',
      permissionPath: '/uom',
    },
    {
      pattern: '/warehouses',
      Component: Warehouses,
      title: 'Gestión Bins',
      iconName: 'MapPin',
      permissionPath: '/warehouses',
    },
    {
      pattern: '/inventory/movements',
      Component: StockMovements,
      title: 'Movimientos de stock',
      iconName: 'ArrowRightLeft',
      permissionPath: '/inventory/movements',
    },
  ],
};
