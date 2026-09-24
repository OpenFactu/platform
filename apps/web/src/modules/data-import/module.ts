import type { ModuleManifest } from '../types';
import { DataImport } from './pages/DataImport';

/**
 * Importación de datos (el "DTW" de Keirost).
 *
 * No aporta entrada propia de navbar: se llega desde Configuración →
 * Importación de datos, un sub-tab `adminOnly` — misma convención que
 * Plantillas PDF.
 */
export const dataImportModule: ModuleManifest = {
  nav: [],
  routes: [
    {
      pattern: '/data-import',
      Component: DataImport,
      title: 'Importación de datos',
      iconName: 'Upload',
      permissionPath: '/data-import',
    },
  ],
};
