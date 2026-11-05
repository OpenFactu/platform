import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const LogisticsHub = lazy(() =>
  import('./pages/LogisticsHub').then((m) => ({ default: m.LogisticsHub })),
);
const ShipmentDetail = lazy(() =>
  import('./pages/ShipmentDetail').then((m) => ({ default: m.ShipmentDetail })),
);
const DriverApp = lazy(() => import('./pages/DriverApp').then((m) => ({ default: m.DriverApp })));
const LogisticsSettings = lazy(() =>
  import('./pages/LogisticsSettings').then((m) => ({ default: m.LogisticsSettings })),
);
const CarriersSettings = lazy(() =>
  import('./pages/CarriersSettings').then((m) => ({ default: m.CarriersSettings })),
);

export const logisticsModule: ModuleManifest = {
  nav: {
    id: 'logistics',
    label: 'logistics.nav.label',
    icon: 'Route',
    /** Visible solo si `flags.logisticsEnabled=true`. El filtrado lo hace
     *  `IconSidebar`/`ModuleTabBar` al leer `useTheme().flags`. */
    featureFlag: 'logisticsEnabled',
    description: 'logistics.nav.description',
    category: 'Logística',
    subTabs: [
      { id: 'logistics-hub', label: 'logistics.nav.hub', path: '/logistics' },
      { id: 'driver-home', label: 'logistics.nav.myRoute', path: '/driver' },
      {
        id: 'carriers',
        label: 'logistics.nav.carriers',
        path: '/settings/carriers',
        status: 'beta',
      },
      { id: 'logistics-settings', label: 'logistics.nav.settings', path: '/logistics/settings' },
    ],
  },
  routes: [
    {
      pattern: '/logistics',
      Component: LogisticsHub,
      title: 'logistics.nav.label',
      iconName: 'Truck',
      permissionPath: '/logistics',
    },
    {
      pattern: '/logistics/settings',
      Component: LogisticsSettings,
      title: 'logistics.nav.settings',
      iconName: 'Settings',
      permissionPath: '/logistics',
    },
    {
      pattern: '/logistics/shipments/:id',
      Component: ShipmentDetail,
      title: 'logistics.nav.shipment',
      iconName: 'Truck',
      permissionPath: '/logistics',
    },
    {
      pattern: '/driver',
      Component: DriverApp,
      title: 'logistics.nav.myRoute',
      iconName: 'Navigation',
      permissionPath: '/driver',
    },
    {
      pattern: '/settings/carriers',
      Component: CarriersSettings,
      title: 'logistics.nav.carriers',
      iconName: 'Truck',
      permissionPath: '/settings/carriers',
    },
  ],
};
