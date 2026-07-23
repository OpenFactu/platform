import type { ModuleManifest } from '../types';
import { LogisticsHub } from './pages/LogisticsHub';
import { ShipmentDetail } from './pages/ShipmentDetail';
import { DriverApp } from './pages/DriverApp';
import { CarriersSettings } from './pages/CarriersSettings';

export const logisticsModule: ModuleManifest = {
  nav: {
    id: 'logistics',
    label: 'Logística',
    icon: 'Route',
    /** Visible solo si `flags.logisticsEnabled=true`. El filtrado lo hace
     *  `IconSidebar`/`ModuleTabBar` al leer `useTheme().flags`. */
    featureFlag: 'logisticsEnabled',
    description: 'Envíos, rutas de reparto y seguimiento en tiempo real.',
    category: 'Logística',
    subTabs: [
      { id: 'logistics-hub', label: 'Centro logístico', path: '/logistics', status: 'beta' },
      { id: 'carriers', label: 'Transportistas', path: '/settings/carriers', status: 'beta' },
    ],
  },
  routes: [
    {
      pattern: '/logistics',
      Component: LogisticsHub,
      title: 'Logística',
      iconName: 'Truck',
      permissionPath: '/logistics',
    },
    {
      pattern: '/logistics/shipments/:id',
      Component: ShipmentDetail,
      title: 'Envío',
      iconName: 'Truck',
      permissionPath: '/logistics',
    },
    {
      pattern: '/driver',
      Component: DriverApp,
      title: 'Mi ruta',
      iconName: 'Navigation',
    },
    {
      pattern: '/settings/carriers',
      Component: CarriersSettings,
      title: 'Transportistas',
      iconName: 'Truck',
      permissionPath: '/settings/carriers',
    },
  ],
};
