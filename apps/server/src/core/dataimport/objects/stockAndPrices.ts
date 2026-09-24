/**
 * Almacenes, tarifas, precios por artículo y existencias iniciales.
 *
 * Las existencias NO se cargan escribiendo la columna `stock` del artículo:
 * eso dejaría la ficha diciendo una cosa y el histórico de movimientos otra,
 * y a la primera discrepancia nadie sabría de dónde salió el número. Entran
 * como una ENTRADA DE MERCANCÍA (`POST /api/goods-receipts`), que es el mismo
 * camino que se usa a mano y el que genera el movimiento.
 */

import { GROUP_COLUMN, type ImportObjectConfig } from '../ImportRegistry';
import warehousesRouter from '../../../api/warehouses';
import pricelistsRouter from '../../../api/pricelists';
import { goodsReceiptsRouter, goodsIssuesRouter } from '../../../api/stockMovements';

/**
 * Entradas y salidas de mercancía son la misma ficha con el signo cambiado:
 * cabecera con almacén y motivo, líneas con artículo, cantidad, zona y lote.
 * Se construyen las dos desde aquí para que no se separen con el tiempo.
 *
 * Ambas nacen en BORRADOR. El stock NO se mueve al importar: se mueve al
 * confirmar el documento desde Almacén, que es un acto explícito. Importar y
 * aplicar de golpe significaría cambiar las existencias de toda una empresa
 * sin que nadie haya mirado el fichero.
 */
function stockMovement(opts: {
  id: string;
  label: string;
  description: string;
  table: string;
  router: ImportObjectConfig['router'];
  types: string[];
  typeHelp: string;
  codePrefix: string;
  quantityExample: string;
}): ImportObjectConfig {
  return {
    id: opts.id,
    label: opts.label,
    description: opts.description,
    group: 'stock',
    modulePath: '/logistics/stock-movements',
    featureFlag: 'inventoryEnabled',
    table: opts.table,
    router: opts.router,
    createPath: '/',
    // Ni actualización ni borrado: un movimiento no se edita, se cancela desde
    // su pantalla — y eso es lo que revierte el stock si ya estaba aplicado.
    naturalKeys: [],
    dependsOn: ['warehouse', 'item'],

    fields: [
      {
        key: 'code',
        label: 'Código',
        type: 'string',
        example: `${opts.codePrefix}-APERTURA`,
        help: `Si se deja vacío se autogenera (${opts.codePrefix}-nnnnnn).`,
      },
      {
        key: 'warehouse',
        label: 'Almacén',
        type: 'ref',
        bodyKey: 'warehouseId',
        required: true,
        example: 'Almacén central',
        ref: { table: 'Warehouse', matchBy: ['name'], label: 'almacén' },
      },
      { key: 'date', label: 'Fecha', type: 'date', example: '01/01/2026' },
      {
        key: 'type',
        label: 'Motivo',
        type: 'enum',
        enumValues: opts.types,
        example: 'adjustment',
        help: opts.typeHelp,
      },
      { key: 'notes', label: 'Notas', type: 'string', example: 'Inventario de apertura' },
    ],

    lines: {
      label: 'Existencias',
      bodyKey: 'lines',
      groupBy: GROUP_COLUMN,
      fields: [
        {
          key: 'lineItem',
          label: 'Artículo',
          type: 'ref',
          bodyKey: 'itemId',
          required: true,
          example: 'TOR-000001',
          ref: { table: 'Item', matchBy: ['code', 'barcode', 'name'], label: 'artículo' },
        },
        {
          key: 'lineQuantity',
          label: 'Cantidad',
          type: 'number',
          bodyKey: 'quantity',
          required: true,
          example: opts.quantityExample,
        },
        {
          key: 'lineZone',
          label: 'Zona',
          type: 'ref',
          bodyKey: 'zoneId',
          ref: { table: 'WarehouseZone', matchBy: ['name'], label: 'zona del almacén' },
        },
        {
          key: 'lineBatch',
          label: 'Lote / nº de serie',
          type: 'string',
          bodyKey: 'batchNum',
          example: 'L-2026-001',
          help: 'Obligatorio en artículos gestionados por lote o número de serie.',
        },
        {
          key: 'lineUom',
          label: 'Unidad',
          type: 'ref',
          bodyKey: 'uomId',
          ref: { table: 'UnitOfMeasure', matchBy: ['code', 'name'], label: 'unidad de medida' },
        },
        { key: 'lineNotes', label: 'Notas de la línea', type: 'string', bodyKey: 'notes' },
      ],
    },
  };
}

export const stockAndPriceObjects: ImportObjectConfig[] = [
  {
    id: 'warehouse',
    label: 'Almacenes',
    description: 'Los almacenes físicos de la empresa.',
    group: 'stock',
    modulePath: '/warehouses',
    featureFlag: 'inventoryEnabled',
    table: 'Warehouse',
    router: () => warehousesRouter,
    createPath: '/',
    updatePath: (id) => `/${id}`,
    deletePath: (id) => `/${id}`,
    naturalKeys: [{ key: 'name', column: 'name', label: 'Nombre', unique: true }],
    fields: [
      {
        key: 'name',
        label: 'Nombre',
        type: 'string',
        required: 'onInsert',
        example: 'Almacén central',
      },
      { key: 'location', label: 'Ubicación', type: 'string', example: 'Polígono Norte, nave 4' },
      { key: 'isDefault', label: '¿Por defecto?', type: 'boolean', example: 'No' },
    ],
  },

  {
    id: 'priceList',
    label: 'Listas de precios',
    description: 'Las tarifas. Los precios de cada artículo van en su propio objeto.',
    group: 'stock',
    modulePath: '/pricelists',
    featureFlag: 'inventoryEnabled',
    table: 'PriceList',
    router: () => pricelistsRouter,
    createPath: '/',
    updatePath: (id) => `/${id}`,
    deletePath: (id) => `/${id}`,
    naturalKeys: [{ key: 'name', column: 'name', label: 'Nombre', unique: true }],
    fields: [
      {
        key: 'name',
        label: 'Nombre',
        type: 'string',
        required: 'onInsert',
        example: 'Tarifa mayorista',
      },
    ],
  },

  {
    id: 'itemPrice',
    label: 'Precios por tarifa',
    description: 'El precio de cada artículo en cada lista. Una fila por combinación.',
    group: 'stock',
    modulePath: '/pricelists',
    featureFlag: 'inventoryEnabled',
    table: 'ItemPrice',
    router: () => pricelistsRouter,
    // El endpoint cuelga de la tarifa: `/:priceListId/prices`. Ya hace upsert
    // por su cuenta, así que repetir un artículo actualiza su precio.
    createPath: (body) => `/${body.priceListId}/prices`,
    dependsOn: ['priceList', 'item'],
    naturalKeys: [],
    fields: [
      {
        key: 'priceList',
        label: 'Tarifa',
        type: 'ref',
        bodyKey: 'priceListId',
        required: true,
        example: 'Tarifa mayorista',
        ref: { table: 'PriceList', matchBy: ['name'], label: 'lista de precios' },
      },
      {
        key: 'item',
        label: 'Artículo',
        type: 'ref',
        bodyKey: 'itemId',
        required: true,
        example: 'TOR-000001',
        ref: { table: 'Item', matchBy: ['code', 'barcode', 'name'], label: 'artículo' },
      },
      { key: 'price', label: 'Precio', type: 'number', required: true, example: '0,39' },
    ],
  },

  stockMovement({
    id: 'goodsReceipt',
    label: 'Existencias (entradas)',
    description:
      'Entradas de mercancía. Es por donde se carga el inventario de apertura: suma stock y deja movimiento.',
    table: 'GoodsReceipt',
    router: () => goodsReceiptsRouter,
    types: ['internal', 'return', 'adjustment'],
    typeHelp:
      'Para un inventario de apertura, "adjustment". internal = hallazgo, return = devolución de cliente.',
    codePrefix: 'ENT',
    quantityExample: '250',
  }),

  stockMovement({
    id: 'goodsIssue',
    label: 'Existencias (salidas)',
    description: 'Salidas de mercancía: mermas, roturas y ajustes a la baja. Resta stock.',
    table: 'GoodsIssue',
    router: () => goodsIssuesRouter,
    types: ['internal', 'scrap', 'adjustment'],
    typeHelp: 'scrap = merma o rotura, adjustment = corrección de inventario, internal = consumo.',
    codePrefix: 'SAL',
    quantityExample: '12',
  }),
];
