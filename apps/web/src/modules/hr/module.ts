import type { ModuleManifest } from '../types';
import { Employees } from './pages/Employees';
import { Departments } from './pages/Departments';
import { Payrolls } from './pages/Payrolls';
import { PayrollConcepts } from './pages/PayrollConcepts';
import { IncidentTypes } from './pages/IncidentTypes';
import { Incidents } from './pages/Incidents';
import { ShiftTemplates } from './pages/ShiftTemplates';
import { ShiftPatterns } from './pages/ShiftPatterns';
import { Planning } from './pages/Planning';
import { Timeclock } from './pages/Timeclock';
import { Kiosks } from './pages/Kiosks';
import { CollectiveAgreements } from './pages/CollectiveAgreements';
import { Evaluations } from './pages/Evaluations';
import { Objectives } from './pages/Objectives';
import { Commissions } from './pages/Commissions';
import { Performance } from './pages/Performance';
import { LaborCost } from './pages/LaborCost';
import { Tasks } from './pages/Tasks';
import { Gantt } from './pages/Gantt';

export const hrModule: ModuleManifest = {
  nav: {
    id: 'hr',
    hiddenInLogisticsOnly: true,
    label: 'Recursos Humanos',
    icon: 'UsersRound',
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
      pattern: '/hr/employees',
      Component: Employees,
      title: 'Empleados',
      iconName: 'UserRound',
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
