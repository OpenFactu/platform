import type { ModuleManifest } from '../types';
import { Dashboard } from './pages/Dashboard';

export const homeModule: ModuleManifest = {
  nav: {
    id: 'home',
    label: 'Inicio',
    icon: 'Home',
    subTabs: [{ id: 'dashboard', label: 'Dashboard', path: '/' }],
  },
  routes: [{ pattern: '/', Component: Dashboard, title: 'Dashboard', iconName: 'BarChart3' }],
};
