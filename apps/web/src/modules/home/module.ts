import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));

export const homeModule: ModuleManifest = {
  nav: {
    id: 'home',
    label: 'Inicio',
    icon: 'Home',
    subTabs: [{ id: 'dashboard', label: 'Dashboard', path: '/' }],
  },
  routes: [{ pattern: '/', Component: Dashboard, title: 'Dashboard', iconName: 'BarChart3' }],
};
