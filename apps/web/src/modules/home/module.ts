import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));

export const homeModule: ModuleManifest = {
  nav: {
    id: 'home',
    label: 'home.nav.home',
    icon: 'Home',
    subTabs: [{ id: 'dashboard', label: 'home.nav.dashboard', path: '/' }],
  },
  routes: [
    { pattern: '/', Component: Dashboard, title: 'home.nav.dashboard', iconName: 'BarChart3' },
  ],
};
