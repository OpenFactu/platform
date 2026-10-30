import { lazy } from 'react';
import type { ModuleManifest } from '../types';

const Employees = lazy(() => import('./pages/Employees').then((m) => ({ default: m.Employees })));
const EmployeeDetail = lazy(() =>
  import('./pages/EmployeeDetail').then((m) => ({ default: m.EmployeeDetail })),
);
const Departments = lazy(() =>
  import('./pages/Departments').then((m) => ({ default: m.Departments })),
);
const Payrolls = lazy(() => import('./pages/Payrolls').then((m) => ({ default: m.Payrolls })));
const PayrollConcepts = lazy(() =>
  import('./pages/PayrollConcepts').then((m) => ({ default: m.PayrollConcepts })),
);
const IncidentTypes = lazy(() =>
  import('./pages/IncidentTypes').then((m) => ({ default: m.IncidentTypes })),
);
const Incidents = lazy(() => import('./pages/Incidents').then((m) => ({ default: m.Incidents })));
const ShiftTemplates = lazy(() =>
  import('./pages/ShiftTemplates').then((m) => ({ default: m.ShiftTemplates })),
);
const ShiftPatterns = lazy(() =>
  import('./pages/ShiftPatterns').then((m) => ({ default: m.ShiftPatterns })),
);
const Planning = lazy(() => import('./pages/Planning').then((m) => ({ default: m.Planning })));
const Timeclock = lazy(() => import('./pages/Timeclock').then((m) => ({ default: m.Timeclock })));
const Kiosks = lazy(() => import('./pages/Kiosks').then((m) => ({ default: m.Kiosks })));
const CollectiveAgreements = lazy(() =>
  import('./pages/CollectiveAgreements').then((m) => ({ default: m.CollectiveAgreements })),
);
const Evaluations = lazy(() =>
  import('./pages/Evaluations').then((m) => ({ default: m.Evaluations })),
);
const Objectives = lazy(() =>
  import('./pages/Objectives').then((m) => ({ default: m.Objectives })),
);
const Commissions = lazy(() =>
  import('./pages/Commissions').then((m) => ({ default: m.Commissions })),
);
const Performance = lazy(() =>
  import('./pages/Performance').then((m) => ({ default: m.Performance })),
);
const LaborCost = lazy(() => import('./pages/LaborCost').then((m) => ({ default: m.LaborCost })));
const Tasks = lazy(() => import('./pages/Tasks').then((m) => ({ default: m.Tasks })));
const Gantt = lazy(() => import('./pages/Gantt').then((m) => ({ default: m.Gantt })));

export const hrModule: ModuleManifest = {
  nav: {
    id: 'hr',
    hiddenInLogisticsOnly: true,
    label: 'hr.nav.module',
    icon: 'UserRound',
    featureFlag: 'hrEnabled',
    description: 'hr.nav.description',
    category: 'RRHH',
    subTabs: [
      // Inline (sin grupo)
      { id: 'employees', label: 'hr.nav.employees', path: '/hr/employees' },
      { id: 'departments', label: 'hr.nav.departments', path: '/hr/departments' },
      // Grupo: Nóminas
      {
        id: 'payrolls',
        label: 'hr.nav.payrolls',
        path: '/hr/payrolls',
        group: 'hr.nav.groupPayrolls',
      },
      {
        id: 'payroll-concepts',
        label: 'hr.nav.payrollConcepts',
        path: '/hr/payroll-concepts',
        group: 'hr.nav.groupPayrolls',
      },
      // Grupo: Tiempo y turnos
      {
        id: 'timeclock',
        label: 'hr.nav.timeclock',
        path: '/hr/timeclock',
        featureFlag: 'hrTimeclockEnabled',
        group: 'hr.nav.groupTime',
        status: 'beta',
      },
      {
        id: 'kiosks',
        label: 'hr.nav.kiosks',
        path: '/hr/kiosks',
        featureFlag: 'hrTimeclockEnabled',
        group: 'hr.nav.groupTime',
        status: 'beta',
      },
      {
        id: 'shift-templates',
        label: 'hr.nav.shiftTemplates',
        path: '/hr/shift-templates',
        featureFlag: 'hrShiftsEnabled',
        group: 'hr.nav.groupTime',
        status: 'beta',
      },
      {
        id: 'shift-patterns',
        label: 'hr.nav.shiftPatterns',
        path: '/hr/shift-patterns',
        featureFlag: 'hrShiftsEnabled',
        group: 'hr.nav.groupTime',
        status: 'beta',
      },
      {
        id: 'planning',
        label: 'hr.nav.planning',
        path: '/hr/planning',
        featureFlag: 'hrPlanningEnabled',
        group: 'hr.nav.groupTime',
        status: 'beta',
      },
      // Grupo: Incidencias
      {
        id: 'incidents',
        label: 'hr.nav.incidents',
        path: '/hr/incidents',
        featureFlag: 'hrIncidentsEnabled',
        group: 'hr.nav.groupIncidents',
        status: 'beta',
      },
      {
        id: 'incident-types',
        label: 'hr.nav.incidentTypes',
        path: '/hr/incident-types',
        featureFlag: 'hrIncidentsEnabled',
        group: 'hr.nav.groupIncidents',
        status: 'beta',
      },
      // Grupo: Avanzado+ (rendimientos, comisiones, evaluaciones, tareas)
      {
        id: 'performance',
        label: 'hr.nav.performance',
        path: '/hr/performance',
        featureFlag: 'hrAdvancedEnabled',
        group: 'hr.nav.groupAdvanced',
        status: 'alpha',
      },
      {
        id: 'labor-cost',
        label: 'hr.nav.laborCost',
        path: '/hr/labor-cost',
        featureFlag: 'hrAdvancedEnabled',
        group: 'hr.nav.groupAdvanced',
        status: 'alpha',
      },
      {
        id: 'commissions',
        label: 'hr.nav.commissions',
        path: '/hr/commissions',
        featureFlag: 'hrAdvancedEnabled',
        group: 'hr.nav.groupAdvanced',
        status: 'alpha',
      },
      {
        id: 'evaluations',
        label: 'hr.nav.evaluations',
        path: '/hr/evaluations',
        featureFlag: 'hrAdvancedEnabled',
        group: 'hr.nav.groupAdvanced',
        status: 'alpha',
      },
      {
        id: 'objectives',
        label: 'hr.nav.objectives',
        path: '/hr/objectives',
        featureFlag: 'hrAdvancedEnabled',
        group: 'hr.nav.groupAdvanced',
        status: 'alpha',
      },
      {
        id: 'collective-agreements',
        label: 'hr.nav.collectiveAgreements',
        path: '/hr/collective-agreements',
        featureFlag: 'hrAdvancedEnabled',
        group: 'hr.nav.groupAdvanced',
        status: 'alpha',
      },
      {
        id: 'tasks',
        label: 'hr.nav.tasks',
        path: '/hr/tasks',
        featureFlag: 'hrAdvancedEnabled',
        group: 'hr.nav.groupAdvanced',
        status: 'alpha',
      },
      {
        id: 'gantt',
        label: 'hr.nav.gantt',
        path: '/hr/gantt',
        featureFlag: 'hrAdvancedEnabled',
        group: 'hr.nav.groupAdvanced',
        status: 'alpha',
      },
    ],
  },
  routes: [
    {
      pattern: '/hr/employees/:employeeId',
      Component: EmployeeDetail,
      title: 'hr.nav.employeeDetail',
      iconName: 'UserRound',
      permissionPath: '/hr/employees',
    },
    {
      pattern: '/hr/employees',
      Component: Employees,
      title: 'hr.nav.employees',
      iconName: 'book-user',
      permissionPath: '/hr/employees',
    },
    {
      pattern: '/hr/departments',
      Component: Departments,
      title: 'hr.nav.departments',
      iconName: 'Building2',
      permissionPath: '/hr/departments',
    },
    {
      pattern: '/hr/payrolls',
      Component: Payrolls,
      title: 'hr.nav.payrolls',
      iconName: 'Banknote',
      permissionPath: '/hr/payrolls',
    },
    {
      pattern: '/hr/payroll-concepts',
      Component: PayrollConcepts,
      title: 'hr.nav.payrollConcepts',
      iconName: 'ListChecks',
      permissionPath: '/hr/payroll-concepts',
    },
    {
      pattern: '/hr/incident-types',
      Component: IncidentTypes,
      title: 'hr.nav.incidentTypes',
      iconName: 'AlertOctagon',
      permissionPath: '/hr/incident-types',
    },
    {
      pattern: '/hr/incidents',
      Component: Incidents,
      title: 'hr.nav.incidents',
      iconName: 'AlertTriangle',
      permissionPath: '/hr/incidents',
    },
    {
      pattern: '/hr/shift-templates',
      Component: ShiftTemplates,
      title: 'hr.nav.shiftTemplates',
      iconName: 'Clock',
      permissionPath: '/hr/shift-templates',
    },
    {
      pattern: '/hr/shift-patterns',
      Component: ShiftPatterns,
      title: 'hr.nav.shiftPatterns',
      iconName: 'Repeat',
      permissionPath: '/hr/shift-patterns',
    },
    {
      pattern: '/hr/planning',
      Component: Planning,
      title: 'hr.nav.planning',
      iconName: 'CalendarDays',
      permissionPath: '/hr/planning',
    },
    {
      pattern: '/hr/timeclock',
      Component: Timeclock,
      title: 'hr.nav.timeclock',
      iconName: 'Timer',
      permissionPath: '/hr/timeclock',
    },
    {
      pattern: '/hr/kiosks',
      Component: Kiosks,
      title: 'hr.nav.kiosks',
      iconName: 'Tablet',
      permissionPath: '/hr/kiosks',
    },
    {
      pattern: '/hr/collective-agreements',
      Component: CollectiveAgreements,
      title: 'hr.nav.collectiveAgreementsTitle',
      iconName: 'BookOpen',
      permissionPath: '/hr/collective-agreements',
    },
    {
      pattern: '/hr/evaluations',
      Component: Evaluations,
      title: 'hr.nav.evaluations',
      iconName: 'ClipboardCheck',
      permissionPath: '/hr/evaluations',
    },
    {
      pattern: '/hr/objectives',
      Component: Objectives,
      title: 'hr.nav.objectives',
      iconName: 'Target',
      permissionPath: '/hr/objectives',
    },
    {
      pattern: '/hr/commissions',
      Component: Commissions,
      title: 'hr.nav.commissions',
      iconName: 'Percent',
      permissionPath: '/hr/commissions',
    },
    {
      pattern: '/hr/performance',
      Component: Performance,
      title: 'hr.nav.performance',
      iconName: 'TrendingUp',
      permissionPath: '/hr/performance',
    },
    {
      pattern: '/hr/labor-cost',
      Component: LaborCost,
      title: 'hr.nav.laborCost',
      iconName: 'PiggyBank',
      permissionPath: '/hr/labor-cost',
    },
    {
      pattern: '/hr/tasks',
      Component: Tasks,
      title: 'hr.nav.tasks',
      iconName: 'ListTodo',
      permissionPath: '/hr/tasks',
    },
    {
      pattern: '/hr/gantt',
      Component: Gantt,
      title: 'hr.nav.gantt',
      iconName: 'GanttChart',
      permissionPath: '/hr/gantt',
    },
  ],
};
