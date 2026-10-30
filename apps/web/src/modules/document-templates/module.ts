import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const DocumentTemplates = lazy(() =>
  import('./pages/DocumentTemplates').then((m) => ({ default: m.DocumentTemplates })),
);
const DocumentTemplateDesigner = lazy(() =>
  import('./pages/DocumentTemplateDesigner').then((m) => ({ default: m.DocumentTemplateDesigner })),
);

/**
 * Plantillas PDF (editor visual, diseñador canvas, generación con IA).
 * No aporta entrada propia de navbar: se llega desde Configuración →
 * Plantillas PDF (subTab del módulo configuration).
 */
export const documentTemplatesModule: ModuleManifest = {
  nav: [],
  routes: [
    {
      pattern: '/document-templates',
      Component: DocumentTemplates,
      title: 'templates.nav.pdfTemplates',
      iconName: 'FileCode',
      permissionPath: '/document-templates',
    },
    {
      pattern: '/document-templates/:id/designer',
      Component: DocumentTemplateDesigner,
      title: 'templates.nav.designer',
      iconName: 'FileCode',
      permissionPath: '/document-templates',
    },
  ],
};
