import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const LogisticsHub = lazy(() =>
  import('./pages/LogisticsHub').then((m) => ({ default: m.LogisticsHub })),
);
const ShipmentDetail = lazy(() =>
  import('./pages/ShipmentDetail').then((m) => ({ default: m.ShipmentDetail })),
);
const DriverApp = lazy(() => import('./pages/DriverApp').then((m) => ({ default: m.DriverApp })));
const CarriersSettings = lazy(() =>
  import('./pages/CarriersSettings').then((m) => ({ default: m.CarriersSettings })),
);

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
