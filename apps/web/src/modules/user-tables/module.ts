import type { ModuleManifest } from '../types';
import { UserTableList } from './pages/UserTableList';
import { UserTableDetail } from './pages/UserTableDetail';

/** Tablas definidas por el usuario/plugins (rutas /u/:name). Sin navbar propio. */
export const userTablesModule: ModuleManifest = {
  nav: [],
  routes: [
    { pattern: '/u/:name', Component: UserTableList, title: 'Tabla', iconName: 'Table' },
    {
      pattern: '/u/:name/new',
      Component: UserTableDetail,
      title: 'Nuevo registro',
      iconName: 'Table',
    },
    { pattern: '/u/:name/:id', Component: UserTableDetail, title: 'Registro', iconName: 'Table' },
  ],
};
