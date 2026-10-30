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
    label: 'forms.nav.label',
    icon: 'ClipboardList',
    featureFlag: 'formsEnabled',
    description: 'forms.nav.description',
    category: 'Operaciones',
    subTabs: [{ id: 'forms-list', label: 'forms.nav.list', path: '/forms' }],
  },
  routes: [
    {
      pattern: '/forms',
      Component: FormsList,
      title: 'forms.nav.list',
      iconName: 'ClipboardList',
      permissionPath: '/forms',
    },
    {
      pattern: '/forms/:formId',
      Component: FormEditor,
      title: 'forms.nav.form',
      iconName: 'ClipboardList',
      permissionPath: '/forms',
    },
    {
      pattern: '/forms/:formId/preview',
      Component: FormPreview,
      title: 'forms.nav.preview',
      iconName: 'ClipboardList',
      permissionPath: '/forms',
    },
  ],
};
