import type { ModuleManifest } from '../types';
import { DocumentTemplates } from './pages/DocumentTemplates';
import { DocumentTemplateDesigner } from './pages/DocumentTemplateDesigner';

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
      title: 'Plantillas PDF',
      iconName: 'FileCode',
      permissionPath: '/document-templates',
    },
    {
      pattern: '/document-templates/:id/designer',
      Component: DocumentTemplateDesigner,
      title: 'Diseñador de plantilla',
      iconName: 'FileCode',
      permissionPath: '/document-templates',
    },
  ],
};
