/**
 * Recursos humanos: la plantilla y su organigrama.
 *
 * Contratos, nóminas y fichajes quedan fuera del catálogo: son movimientos con
 * su propio ciclo (vigencias, conceptos, cierres) y cargarlos como filas
 * sueltas produce un histórico que no cuadra con nada.
 */

import type { ImportObjectConfig } from '../ImportRegistry';
import hrEmployeesRouter from '../../../api/hr/employees';
import hrDepartmentsRouter from '../../../api/hr/departments';

export const hrObjects: ImportObjectConfig[] = [
  {
    id: 'department',
    label: 'Departamentos',
    description: 'El organigrama, con su centro de coste asociado.',
    group: 'rrhh',
    modulePath: '/hr/departments',
    featureFlag: 'hrEnabled',
    table: 'Department',
    router: () => hrDepartmentsRouter,
    createPath: '/',
    updatePath: (id) => `/${id}`,
    deletePath: (id) => `/${id}`,
    naturalKeys: [
      { key: 'code', column: 'code', label: 'Código', unique: true },
      { key: 'name', column: 'name', label: 'Nombre' },
    ],
    fields: [
      {
        key: 'code',
        label: 'Código',
        type: 'string',
        example: 'DEP-00001',
        help: 'Si se deja vacío se autogenera.',
      },
      { key: 'name', label: 'Nombre', type: 'string', required: 'onInsert', example: 'Producción' },
      {
        key: 'parent',
        label: 'Departamento padre',
        type: 'ref',
        bodyKey: 'parentId',
        ref: { table: 'Department', matchBy: ['code', 'name'], label: 'departamento' },
      },
      {
        key: 'costCenter',
        label: 'Centro de coste',
        type: 'ref',
        bodyKey: 'costCenterId',
        ref: { table: 'CostCenter', matchBy: ['code', 'name'], label: 'centro de coste' },
      },
      { key: 'isActive', label: '¿Activo?', type: 'boolean', example: 'Sí' },
    ],
  },

  {
    id: 'employee',
    label: 'Empleados',
    description: 'La plantilla: datos personales, alta y adscripción.',
    group: 'rrhh',
    modulePath: '/hr/employees',
    featureFlag: 'hrEnabled',
    table: 'Employee',
    router: () => hrEmployeesRouter,
    createPath: '/',
    updatePath: (id) => `/${id}`,
    deletePath: (id) => `/${id}`,
    dependsOn: ['department', 'costCenter'],
    naturalKeys: [
      { key: 'code', column: 'code', label: 'Código', unique: true },
      { key: 'dni', column: 'dni', label: 'DNI' },
      { key: 'email', column: 'email', label: 'Email' },
    ],
    fields: [
      {
        key: 'code',
        label: 'Código',
        type: 'string',
        example: 'EMP-00001',
        help: 'Si se deja vacío se autogenera.',
      },
      { key: 'firstName', label: 'Nombre', type: 'string', required: 'onInsert', example: 'Lucía' },
      {
        key: 'lastName',
        label: 'Apellidos',
        type: 'string',
        required: 'onInsert',
        example: 'Marín Soto',
      },
      { key: 'dni', label: 'DNI/NIE', type: 'string', example: '12345678Z' },
      { key: 'email', label: 'Email', type: 'string', example: 'lucia.marin@empresa.es' },
      { key: 'phone', label: 'Teléfono', type: 'string' },
      { key: 'birthDate', label: 'Fecha de nacimiento', type: 'date', example: '14/05/1990' },
      { key: 'hireDate', label: 'Fecha de alta', type: 'date', example: '01/09/2021' },
      { key: 'terminationDate', label: 'Fecha de baja', type: 'date' },
      { key: 'iban', label: 'IBAN', type: 'string', help: 'Se valida el dígito de control.' },
      {
        key: 'department',
        label: 'Departamento',
        type: 'ref',
        bodyKey: 'departmentId',
        example: 'Producción',
        ref: { table: 'Department', matchBy: ['code', 'name'], label: 'departamento' },
      },
      {
        key: 'costCenter',
        label: 'Centro de coste',
        type: 'ref',
        bodyKey: 'costCenterId',
        ref: { table: 'CostCenter', matchBy: ['code', 'name'], label: 'centro de coste' },
      },
      {
        key: 'profitCenter',
        label: 'Centro de beneficio',
        type: 'ref',
        bodyKey: 'profitCenterId',
        ref: { table: 'ProfitCenter', matchBy: ['code', 'name'], label: 'centro de beneficio' },
      },
      {
        key: 'status',
        label: 'Situación',
        type: 'enum',
        enumValues: ['active', 'inactive', 'terminated'],
        example: 'active',
      },
      { key: 'notes', label: 'Notas', type: 'string' },
    ],
  },
];
