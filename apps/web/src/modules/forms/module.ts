import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const FormsList = lazy(() => import('./pages/FormsList').then((m) => ({ default: m.FormsList })));
const FormEditor = lazy(() =>
  import('./pages/FormEditor').then((m) => ({ default: m.FormEditor })),
);
const FormPreview = lazy(() =>
  import('./pages/FormPreview').then((m) => ({ default: m.FormPreview })),
);

export const formsModule: ModuleManifest = {
  nav: {
    id: 'forms',
    label: 'Formularios',
    icon: 'ClipboardList',
    featureFlag: 'formsEnabled',
    description:
      'Formularios, encuestas y cuestionarios con enlace público: secciones, lógica, archivos y resultados.',
    category: 'Operaciones',
    subTabs: [{ id: 'forms-list', label: 'Formularios', path: '/forms' }],
  },
  routes: [
    {
      pattern: '/forms',
      Component: FormsList,
      title: 'Formularios',
      iconName: 'ClipboardList',
      permissionPath: '/forms',
    },
    {
      pattern: '/forms/:formId',
      Component: FormEditor,
      title: 'Formulario',
      iconName: 'ClipboardList',
      permissionPath: '/forms',
    },
    {
      pattern: '/forms/:formId/preview',
      Component: FormPreview,
      title: 'Vista previa',
      iconName: 'ClipboardList',
      permissionPath: '/forms',
    },
  ],
};
