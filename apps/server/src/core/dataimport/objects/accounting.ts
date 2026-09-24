/**
 * Plan contable y dimensiones analíticas.
 *
 * Los asientos no están: un asiento importado sin cuadrar dejaría la
 * contabilidad descuadrada sin que nadie se entere hasta el cierre, y el
 * endpoint de asientos tiene su propio flujo de validación por líneas. Se
 * cargan las estructuras; los movimientos entran por su pantalla.
 */

import type { ImportObjectConfig } from '../ImportRegistry';
import chartOfAccountsRouter from '../../../api/chartOfAccounts';
import costCentersRouter from '../../../api/costCenters';
import profitCentersRouter from '../../../api/profitCenters';

/** Centros de coste y de beneficio son la misma ficha con otro nombre. */
function dimension(
  id: string,
  label: string,
  description: string,
  modulePath: string,
  table: string,
  router: ImportObjectConfig['router'],
): ImportObjectConfig {
  return {
    id,
    label,
    description,
    group: 'contabilidad',
    modulePath,
    featureFlag: 'analyticsEnabled',
    table,
    router,
    createPath: '/',
    updatePath: (rowId) => `/${rowId}`,
    deletePath: (rowId) => `/${rowId}`,
    naturalKeys: [
      { key: 'code', column: 'code', label: 'Código', unique: true },
      { key: 'name', column: 'name', label: 'Nombre' },
    ],
    fields: [
      { key: 'code', label: 'Código', type: 'string', required: 'onInsert', example: 'CC-001' },
      { key: 'name', label: 'Nombre', type: 'string', required: 'onInsert', example: 'Producción' },
      {
        key: 'parent',
        label: 'Padre',
        type: 'ref',
        bodyKey: 'parentId',
        ref: { table, matchBy: ['code', 'name'], label: label.toLowerCase() },
        help: 'Impórtalos de arriba abajo: el padre tiene que existir ya.',
      },
      { key: 'isActive', label: '¿Activo?', type: 'boolean', example: 'Sí' },
      { key: 'notes', label: 'Notas', type: 'string' },
    ],
  };
}

export const accountingObjects: ImportObjectConfig[] = [
  {
    id: 'chartOfAccount',
    label: 'Plan contable',
    description: 'Las cuentas contables, con su jerarquía.',
    group: 'contabilidad',
    modulePath: '/chart-of-accounts',
    featureFlag: 'accountingEnabled',
    table: 'ChartOfAccount',
    router: () => chartOfAccountsRouter,
    createPath: '/',
    updatePath: (id) => `/${id}`,
    deletePath: (id) => `/${id}`,
    naturalKeys: [
      { key: 'code', column: 'code', label: 'Código', unique: true },
      { key: 'name', column: 'name', label: 'Nombre' },
    ],
    fields: [
      { key: 'code', label: 'Código', type: 'string', required: 'onInsert', example: '430000' },
      { key: 'name', label: 'Nombre', type: 'string', required: 'onInsert', example: 'Clientes' },
      {
        key: 'type',
        label: 'Naturaleza',
        type: 'enum',
        required: 'onInsert',
        enumValues: ['asset', 'liability', 'equity', 'income', 'expense'],
        example: 'asset',
        help: 'asset = activo, liability = pasivo, equity = patrimonio, income = ingreso, expense = gasto.',
      },
      {
        key: 'parent',
        label: 'Cuenta padre',
        type: 'ref',
        bodyKey: 'parentId',
        example: '430',
        ref: { table: 'ChartOfAccount', matchBy: ['code'], label: 'cuenta contable' },
        help: 'Impórtalas de arriba abajo: primero los grupos, luego el detalle.',
      },
      {
        key: 'isAnalytical',
        label: '¿Exige analítica?',
        type: 'boolean',
        help: 'Si es Sí, los asientos que usen la cuenta tendrán que llevar dimensión analítica.',
      },
      { key: 'isActive', label: '¿Activa?', type: 'boolean', example: 'Sí' },
      { key: 'notes', label: 'Notas', type: 'string' },
    ],
  },

  dimension(
    'costCenter',
    'Centros de coste',
    'Dimensión analítica de gasto, jerárquica.',
    '/cost-centers',
    'CostCenter',
    () => costCentersRouter,
  ),

  dimension(
    'profitCenter',
    'Centros de beneficio',
    'Dimensión analítica de ingreso, jerárquica.',
    '/profit-centers',
    'ProfitCenter',
    () => profitCentersRouter,
  ),
];
