import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const UserTableList = lazy(() =>
  import('./pages/UserTableList').then((m) => ({ default: m.UserTableList })),
);
const UserTableDetail = lazy(() =>
  import('./pages/UserTableDetail').then((m) => ({ default: m.UserTableDetail })),
);

/** Tablas definidas por el usuario/plugins (rutas /u/:name). Sin navbar propio. */
export const userTablesModule: ModuleManifest = {
  nav: [],
  routes: [
    {
      pattern: '/u/:name',
      Component: UserTableList,
      title: 'userTables.nav.table',
      iconName: 'Table',
      permissionPath: '/user-tables',
    },
    {
      pattern: '/u/:name/new',
      Component: UserTableDetail,
      title: 'userTables.nav.newRecord',
      iconName: 'Table',
      permissionPath: '/user-tables',
    },
    {
      pattern: '/u/:name/:id',
      Component: UserTableDetail,
      title: 'userTables.nav.record',
      iconName: 'Table',
      permissionPath: '/user-tables',
    },
  ],
};
