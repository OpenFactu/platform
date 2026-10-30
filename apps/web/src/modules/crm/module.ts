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
    label: 'crm.nav.label',
    icon: 'Target',
    featureFlag: 'crmEnabled',
    description: 'crm.nav.description',
    category: 'Operaciones',
    subTabs: [
      { id: 'crm-today', label: 'crm.nav.today', path: '/crm/today' },
      { id: 'crm-opportunities', label: 'crm.nav.opportunities', path: '/crm/opportunities' },
      { id: 'crm-activities', label: 'crm.nav.activities', path: '/crm/activities' },
      { id: 'crm-contacts', label: 'crm.nav.contacts', path: '/crm/contacts' },
      { id: 'crm-reports', label: 'crm.nav.reports', path: '/crm/reports' },
      { id: 'crm-stages', label: 'crm.nav.stages', path: '/crm/stages', adminOnly: true },
      { id: 'crm-settings', label: 'crm.nav.settings', path: '/crm/settings' },
    ],
  },
  routes: [
    {
      pattern: '/crm/today',
      Component: Today,
      title: 'crm.nav.today',
      iconName: 'Sun',
      permissionPath: '/crm/activities',
    },
    {
      pattern: '/crm/opportunities',
      Component: Opportunities,
      title: 'crm.nav.opportunities',
      iconName: 'Target',
      permissionPath: '/crm/opportunities',
    },
    {
      pattern: '/crm/opportunities/:opportunityId',
      Component: OpportunityDetail,
      title: 'crm.nav.opportunity',
      iconName: 'Target',
      permissionPath: '/crm/opportunities',
    },
    {
      pattern: '/crm/activities',
      Component: Activities,
      title: 'crm.nav.activities',
      iconName: 'CalendarClock',
      permissionPath: '/crm/activities',
    },
    {
      pattern: '/crm/contacts',
      Component: Contacts,
      title: 'crm.nav.contacts',
      iconName: 'Contact',
      permissionPath: '/crm/contacts',
    },
    {
      pattern: '/crm/stages',
      Component: Stages,
      title: 'crm.nav.stagesTitle',
      iconName: 'Workflow',
      permissionPath: '/crm/opportunities',
    },
    {
      pattern: '/crm/reports',
      Component: Reports,
      title: 'crm.nav.reportsTitle',
      iconName: 'BarChart3',
      permissionPath: '/crm/reports',
    },
    {
      pattern: '/crm/settings',
      Component: CrmSettings,
      title: 'crm.nav.settingsTitle',
      iconName: 'Settings',
      permissionPath: '/crm/settings',
    },
  ],
};
