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
    label: 'Recursos Humanos',
    icon: 'UserRound',
    featureFlag: 'hrEnabled',
    description:
      'Empleados, departamentos y nóminas. Los sub-módulos de turnos, fichajes, planificación e incidencias se activan aparte, en Ajustes → Empresa → Flags.',
    category: 'RRHH',
    subTabs: [
      // Inline (sin grupo)
      { id: 'employees', label: 'Empleados', path: '/hr/employees' },
      { id: 'departments', label: 'Departamentos', path: '/hr/departments' },
      // Grupo: Nóminas
      { id: 'payrolls', label: 'Nóminas', path: '/hr/payrolls', group: 'Nóminas' },
      {
        id: 'payroll-concepts',
        label: 'Conceptos de nómina',
        path: '/hr/payroll-concepts',
        group: 'Nóminas',
      },
      // Grupo: Tiempo y turnos
      {
        id: 'timeclock',
        label: 'Mis fichajes',
        path: '/hr/timeclock',
        featureFlag: 'hrTimeclockEnabled',
        group: 'Tiempo y turnos',
        status: 'beta',
      },
      {
        id: 'kiosks',
        label: 'Kioskos de fichaje',
        path: '/hr/kiosks',
        featureFlag: 'hrTimeclockEnabled',
        group: 'Tiempo y turnos',
        status: 'beta',
      },
      {
        id: 'shift-templates',
        label: 'Plantillas de turno',
        path: '/hr/shift-templates',
        featureFlag: 'hrShiftsEnabled',
        group: 'Tiempo y turnos',
        status: 'beta',
      },
      {
        id: 'shift-patterns',
        label: 'Patrones de turno',
        path: '/hr/shift-patterns',
        featureFlag: 'hrShiftsEnabled',
        group: 'Tiempo y turnos',
        status: 'beta',
      },
      {
        id: 'planning',
        label: 'Planificación',
        path: '/hr/planning',
        featureFlag: 'hrPlanningEnabled',
        group: 'Tiempo y turnos',
        status: 'beta',
      },
      // Grupo: Incidencias
      {
        id: 'incidents',
        label: 'Incidencias',
        path: '/hr/incidents',
        featureFlag: 'hrIncidentsEnabled',
        group: 'Incidencias',
        status: 'beta',
      },
      {
        id: 'incident-types',
        label: 'Tipos de incidencia',
        path: '/hr/incident-types',
        featureFlag: 'hrIncidentsEnabled',
        group: 'Incidencias',
        status: 'beta',
      },
      // Grupo: Avanzado+ (rendimientos, comisiones, evaluaciones, tareas)
      {
        id: 'performance',
        label: 'Rendimiento',
        path: '/hr/performance',
        featureFlag: 'hrAdvancedEnabled',
        group: 'Avanzado+',
        status: 'alpha',
      },
      {
        id: 'labor-cost',
        label: 'Coste laboral',
        path: '/hr/labor-cost',
        featureFlag: 'hrAdvancedEnabled',
        group: 'Avanzado+',
        status: 'alpha',
      },
      {
        id: 'commissions',
        label: 'Comisiones',
        path: '/hr/commissions',
        featureFlag: 'hrAdvancedEnabled',
        group: 'Avanzado+',
        status: 'alpha',
      },
      {
        id: 'evaluations',
        label: 'Evaluaciones',
        path: '/hr/evaluations',
        featureFlag: 'hrAdvancedEnabled',
        group: 'Avanzado+',
        status: 'alpha',
      },
      {
        id: 'objectives',
        label: 'Objetivos',
        path: '/hr/objectives',
        featureFlag: 'hrAdvancedEnabled',
        group: 'Avanzado+',
        status: 'alpha',
      },
      {
        id: 'collective-agreements',
        label: 'Convenios',
        path: '/hr/collective-agreements',
        featureFlag: 'hrAdvancedEnabled',
        group: 'Avanzado+',
        status: 'alpha',
      },
      {
        id: 'tasks',
        label: 'Tareas',
        path: '/hr/tasks',
        featureFlag: 'hrAdvancedEnabled',
        group: 'Avanzado+',
        status: 'alpha',
      },
      {
        id: 'gantt',
        label: 'Gantt',
        path: '/hr/gantt',
        featureFlag: 'hrAdvancedEnabled',
        group: 'Avanzado+',
        status: 'alpha',
      },
    ],
  },
  routes: [
    {
      pattern: '/hr/employees/:employeeId',
      Component: EmployeeDetail,
      title: 'Ficha de empleado',
      iconName: 'UserRound',
      permissionPath: '/hr/employees',
    },
    {
      pattern: '/hr/employees',
      Component: Employees,
      title: 'Empleados',
      iconName: 'book-user',
      permissionPath: '/hr/employees',
    },
    {
      pattern: '/hr/departments',
      Component: Departments,
      title: 'Departamentos',
      iconName: 'Building2',
      permissionPath: '/hr/departments',
    },
    {
      pattern: '/hr/payrolls',
      Component: Payrolls,
      title: 'Nóminas',
      iconName: 'Banknote',
      permissionPath: '/hr/payrolls',
    },
    {
      pattern: '/hr/payroll-concepts',
      Component: PayrollConcepts,
      title: 'Conceptos de nómina',
      iconName: 'ListChecks',
      permissionPath: '/hr/payroll-concepts',
    },
    {
      pattern: '/hr/incident-types',
      Component: IncidentTypes,
      title: 'Tipos de incidencia',
      iconName: 'AlertOctagon',
      permissionPath: '/hr/incident-types',
    },
    {
      pattern: '/hr/incidents',
      Component: Incidents,
      title: 'Incidencias',
      iconName: 'AlertTriangle',
      permissionPath: '/hr/incidents',
    },
    {
      pattern: '/hr/shift-templates',
      Component: ShiftTemplates,
      title: 'Plantillas de turno',
      iconName: 'Clock',
      permissionPath: '/hr/shift-templates',
    },
    {
      pattern: '/hr/shift-patterns',
      Component: ShiftPatterns,
      title: 'Patrones de turno',
      iconName: 'Repeat',
      permissionPath: '/hr/shift-patterns',
    },
    {
      pattern: '/hr/planning',
      Component: Planning,
      title: 'Planificación',
      iconName: 'CalendarDays',
      permissionPath: '/hr/planning',
    },
    {
      pattern: '/hr/timeclock',
      Component: Timeclock,
      title: 'Mis fichajes',
      iconName: 'Timer',
      permissionPath: '/hr/timeclock',
    },
    {
      pattern: '/hr/kiosks',
      Component: Kiosks,
      title: 'Kioskos de fichaje',
      iconName: 'Tablet',
      permissionPath: '/hr/kiosks',
    },
    {
      pattern: '/hr/collective-agreements',
      Component: CollectiveAgreements,
      title: 'Convenios colectivos',
      iconName: 'BookOpen',
      permissionPath: '/hr/collective-agreements',
    },
    {
      pattern: '/hr/evaluations',
      Component: Evaluations,
      title: 'Evaluaciones',
      iconName: 'ClipboardCheck',
      permissionPath: '/hr/evaluations',
    },
    {
      pattern: '/hr/objectives',
      Component: Objectives,
      title: 'Objetivos',
      iconName: 'Target',
      permissionPath: '/hr/objectives',
    },
    {
      pattern: '/hr/commissions',
      Component: Commissions,
      title: 'Comisiones',
      iconName: 'Percent',
      permissionPath: '/hr/commissions',
    },
    {
      pattern: '/hr/performance',
      Component: Performance,
      title: 'Rendimiento',
      iconName: 'TrendingUp',
      permissionPath: '/hr/performance',
    },
    {
      pattern: '/hr/labor-cost',
      Component: LaborCost,
      title: 'Coste laboral',
      iconName: 'PiggyBank',
      permissionPath: '/hr/labor-cost',
    },
    {
      pattern: '/hr/tasks',
      Component: Tasks,
      title: 'Tareas',
      iconName: 'ListTodo',
      permissionPath: '/hr/tasks',
    },
    {
      pattern: '/hr/gantt',
      Component: Gantt,
      title: 'Gantt',
      iconName: 'GanttChart',
      permissionPath: '/hr/gantt',
    },
  ],
};
