import type { ModuleManifest } from '../types';
import { Items } from './pages/Items';
import { Categories } from './pages/Categories';
import { Uom } from './pages/Uom';
import { Warehouses } from './pages/Warehouses';
import { StockMovements } from './pages/StockMovements';

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
