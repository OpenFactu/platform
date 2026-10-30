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
    label: 'inventory.nav.inventory',
    icon: 'Package',
    featureFlag: 'inventoryEnabled',
    description: 'inventory.nav.description',
    category: 'Operaciones',
    subTabs: [
      { id: 'items', label: 'inventory.nav.items', path: '/items' },
      { id: 'categories', label: 'inventory.nav.categories', path: '/categories' },
      { id: 'uom', label: 'inventory.nav.uom', path: '/uom' },
      { id: 'warehouses', label: 'inventory.nav.warehouses', path: '/warehouses' },
      {
        id: 'stock-movements',
        label: 'inventory.nav.stockMovements',
        path: '/inventory/movements',
      },
    ],
  },
  routes: [
    {
      pattern: '/items',
      Component: Items,
      title: 'inventory.routes.items',
      iconName: 'Grid',
      permissionPath: '/items',
    },
    {
      pattern: '/items/:itemId',
      Component: ItemDetail,
      title: 'inventory.routes.itemDetail',
      iconName: 'Package',
      permissionPath: '/items',
    },
    {
      pattern: '/categories',
      Component: Categories,
      title: 'inventory.routes.categories',
      iconName: 'Hash',
      permissionPath: '/categories',
    },
    {
      pattern: '/uom',
      Component: Uom,
      title: 'inventory.routes.uom',
      iconName: 'Boxes',
      permissionPath: '/uom',
    },
    {
      pattern: '/warehouses',
      Component: Warehouses,
      title: 'inventory.routes.warehouses',
      iconName: 'MapPin',
      permissionPath: '/warehouses',
    },
    {
      pattern: '/inventory/movements',
      Component: StockMovements,
      title: 'inventory.routes.stockMovements',
      iconName: 'ArrowRightLeft',
      permissionPath: '/inventory/movements',
    },
  ],
};
