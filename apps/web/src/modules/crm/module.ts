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
const OpportunityDetail = lazy(() =>
  import('./pages/OpportunityDetail').then((m) => ({ default: m.OpportunityDetail })),
);
const Today = lazy(() => import('./pages/Today').then((m) => ({ default: m.Today })));
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })));
const CrmSettings = lazy(() =>
  import('./pages/CrmSettings').then((m) => ({ default: m.CrmSettings })),
);

export const crmModule: ModuleManifest = {
  nav: {
    id: 'crm',
    label: 'CRM',
    icon: 'Target',
    featureFlag: 'crmEnabled',
    description: 'Seguimiento comercial: oportunidades en un embudo, contactos y actividades.',
    category: 'Operaciones',
    subTabs: [
      { id: 'crm-today', label: 'Hoy', path: '/crm/today' },
      { id: 'crm-opportunities', label: 'Oportunidades', path: '/crm/opportunities' },
      { id: 'crm-activities', label: 'Actividades', path: '/crm/activities' },
      { id: 'crm-contacts', label: 'Contactos', path: '/crm/contacts' },
      { id: 'crm-reports', label: 'Informes', path: '/crm/reports' },
      { id: 'crm-stages', label: 'Etapas', path: '/crm/stages', adminOnly: true },
      { id: 'crm-settings', label: 'Ajustes', path: '/crm/settings' },
    ],
  },
  routes: [
    {
      pattern: '/crm/today',
      Component: Today,
      title: 'Hoy',
      iconName: 'Sun',
      permissionPath: '/crm/activities',
    },
    {
      pattern: '/crm/opportunities',
      Component: Opportunities,
      title: 'Oportunidades',
      iconName: 'Target',
      permissionPath: '/crm/opportunities',
    },
    {
      pattern: '/crm/opportunities/:opportunityId',
      Component: OpportunityDetail,
      title: 'Oportunidad',
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
    {
      pattern: '/crm/reports',
      Component: Reports,
      title: 'Informes del CRM',
      iconName: 'BarChart3',
      permissionPath: '/crm/reports',
    },
    {
      pattern: '/crm/settings',
      Component: CrmSettings,
      title: 'Ajustes del CRM',
      iconName: 'Settings',
      permissionPath: '/crm/settings',
    },
  ],
};
