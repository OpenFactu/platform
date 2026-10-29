import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const Opportunities = lazy(() =>
  import('./pages/Opportunities').then((m) => ({ default: m.Opportunities })),
);
const Contacts = lazy(() => import('./pages/Contacts').then((m) => ({ default: m.Contacts })));
const Activities = lazy(() =>
  import('./pages/Activities').then((m) => ({ default: m.Activities })),
);
const Stages = lazy(() => import('./pages/Stages').then((m) => ({ default: m.Stages })));

export const crmModule: ModuleManifest = {
  nav: {
    id: 'crm',
    label: 'CRM',
    icon: 'Target',
    featureFlag: 'crmEnabled',
    description: 'Seguimiento comercial: oportunidades en un embudo, contactos y actividades.',
    category: 'Operaciones',
    subTabs: [
      { id: 'crm-opportunities', label: 'Oportunidades', path: '/crm/opportunities' },
      { id: 'crm-activities', label: 'Actividades', path: '/crm/activities' },
      { id: 'crm-contacts', label: 'Contactos', path: '/crm/contacts' },
      { id: 'crm-stages', label: 'Etapas', path: '/crm/stages', adminOnly: true },
    ],
  },
  routes: [
    {
      pattern: '/crm/opportunities',
      Component: Opportunities,
      title: 'Oportunidades',
      iconName: 'Target',
      permissionPath: '/crm/opportunities',
    },
    {
      pattern: '/crm/activities',
      Component: Activities,
      title: 'Actividades',
      iconName: 'CalendarClock',
      permissionPath: '/crm/activities',
    },
    {
      pattern: '/crm/contacts',
      Component: Contacts,
      title: 'Contactos',
      iconName: 'Contact',
      permissionPath: '/crm/contacts',
    },
    {
      pattern: '/crm/stages',
      Component: Stages,
      title: 'Etapas del embudo',
      iconName: 'Workflow',
      permissionPath: '/crm/opportunities',
    },
  ],
};
