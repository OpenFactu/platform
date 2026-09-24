/**
 * Datos maestros: lo primero que se carga al arrancar una empresa.
 *
 * El orden de `dependsOn` no es decorativo — un artículo necesita su unidad de
 * medida creada antes, y un interlocutor su grupo. La pantalla lo enseña para
 * que nadie empiece por el final.
 */

import type { ImportObjectConfig } from '../ImportRegistry';
import partnerGroupsRouter from '../../../api/partnerGroups';
import categoriesRouter from '../../../api/categories';
import uomRouter from '../../../api/uom';
import taxesRouter from '../../../api/taxes';
import itemsRouter from '../../../api/items';

export const masterDataObjects: ImportObjectConfig[] = [
  {
    id: 'partnerGroup',
    label: 'Grupos de interlocutores',
    description: 'Las familias de clientes y proveedores, con su prefijo de código.',
    group: 'maestros',
    modulePath: '/partners',
    featureFlag: 'partnersEnabled',
    table: 'PartnerGroup',
    router: () => partnerGroupsRouter,
    createPath: '/',
    updatePath: (id) => `/${id}`,
    deletePath: (id) => `/${id}`,
    naturalKeys: [
      { key: 'code', column: 'code', label: 'Código', unique: true },
      { key: 'name', column: 'name', label: 'Nombre' },
    ],
    fields: [
      { key: 'code', label: 'Código', type: 'string', required: 'onInsert', example: 'CLIENTES' },
      {
        key: 'name',
        label: 'Nombre',
        type: 'string',
        required: 'onInsert',
        example: 'Clientes nacionales',
      },
      {
        key: 'codePrefix',
        label: 'Prefijo de código',
        type: 'string',
        example: 'CLI',
        help: 'Si se informa, los interlocutores de este grupo se numeran solos: CLI-00001, CLI-00002…',
      },
      { key: 'isCustomer', label: '¿Es de clientes?', type: 'boolean', example: 'Sí' },
      { key: 'isVendor', label: '¿Es de proveedores?', type: 'boolean', example: 'No' },
    ],
  },

  {
    id: 'category',
    label: 'Categorías de artículos',
    description: 'El árbol de familias del catálogo.',
    group: 'maestros',
    modulePath: '/categories',
    featureFlag: 'inventoryEnabled',
    table: 'Category',
    router: () => categoriesRouter,
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
        example: 'Tornillería',
      },
      {
        key: 'codePrefix',
        label: 'Prefijo de código',
        type: 'string',
        example: 'TOR',
        help: 'Los artículos sin código propio se numeran con este prefijo.',
      },
      {
        key: 'parent',
        label: 'Categoría padre',
        type: 'ref',
        bodyKey: 'parentId',
        ref: { table: 'Category', matchBy: ['name'], label: 'categoría' },
        help: 'Deja vacío para una categoría de primer nivel. Impórtalas de arriba abajo.',
      },
    ],
  },

  {
    id: 'uom',
    label: 'Unidades de medida',
    description: 'Kilos, unidades, cajas… y su equivalencia con la unidad base.',
    group: 'maestros',
    modulePath: '/uom',
    featureFlag: 'inventoryEnabled',
    table: 'UnitOfMeasure',
    router: () => uomRouter,
    createPath: '/',
    updatePath: (id) => `/${id}`,
    deletePath: (id) => `/${id}`,
    naturalKeys: [
      { key: 'code', column: 'code', label: 'Código', unique: true },
      { key: 'name', column: 'name', label: 'Nombre' },
    ],
    fields: [
      { key: 'code', label: 'Código', type: 'string', required: 'onInsert', example: 'KG' },
      { key: 'name', label: 'Nombre', type: 'string', required: 'onInsert', example: 'Kilogramo' },
      {
        key: 'baseValue',
        label: 'Equivalencia',
        type: 'number',
        example: '1',
        help: 'Cuántas unidades base equivalen a una de ésta. Una caja de 12 → 12.',
      },
      {
        key: 'baseUom',
        label: 'Unidad base',
        type: 'ref',
        bodyKey: 'baseUomId',
        ref: { table: 'UnitOfMeasure', matchBy: ['code', 'name'], label: 'unidad de medida' },
      },
    ],
  },

  {
    id: 'taxGroup',
    label: 'Tipos de impuesto',
    description: 'Los tipos de IVA y equivalentes que usan los documentos.',
    group: 'maestros',
    modulePath: '/taxes',
    table: 'TaxGroup',
    router: () => taxesRouter,
    createPath: '/',
    updatePath: (id) => `/${id}`,
    deletePath: (id) => `/${id}`,
    naturalKeys: [{ key: 'code', column: 'code', label: 'Código', unique: true }],
    fields: [
      { key: 'code', label: 'Código', type: 'string', required: 'onInsert', example: 'IVA21' },
      { key: 'rate', label: 'Porcentaje', type: 'number', required: 'onInsert', example: '21' },
    ],
  },

  {
    id: 'item',
    label: 'Artículos',
    description: 'El catálogo: referencia, unidad, categoría, impuesto y precio base.',
    group: 'maestros',
    modulePath: '/items',
    featureFlag: 'inventoryEnabled',
    table: 'Item',
    router: () => itemsRouter,
    createPath: '/',
    updatePath: (id) => `/${id}`,
    deletePath: (id) => `/${id}`,
    dependsOn: ['uom', 'category', 'taxGroup'],
    naturalKeys: [
      { key: 'code', column: 'code', label: 'Código', unique: true },
      { key: 'barcode', column: 'barcode', label: 'Código de barras', unique: true },
      { key: 'name', column: 'name', label: 'Nombre' },
    ],
    fields: [
      {
        key: 'code',
        label: 'Código',
        type: 'string',
        example: 'TOR-000001',
        help: 'Si se deja vacío hay que indicar categoría, y se numera con su prefijo.',
      },
      {
        key: 'name',
        label: 'Nombre',
        type: 'string',
        required: 'onInsert',
        example: 'Tornillo M6 x 40',
      },
      { key: 'description', label: 'Descripción', type: 'string' },
      { key: 'barcode', label: 'Código de barras', type: 'string', example: '8412345678905' },
      {
        key: 'uom',
        label: 'Unidad de medida',
        type: 'ref',
        bodyKey: 'uomId',
        required: 'onInsert',
        example: 'UD',
        ref: { table: 'UnitOfMeasure', matchBy: ['code', 'name'], label: 'unidad de medida' },
      },
      {
        key: 'category',
        label: 'Categoría',
        type: 'ref',
        bodyKey: 'categoryId',
        example: 'Tornillería',
        ref: { table: 'Category', matchBy: ['name'], label: 'categoría' },
      },
      {
        key: 'taxGroup',
        label: 'Tipo de impuesto',
        type: 'ref',
        bodyKey: 'taxGroupId',
        example: 'IVA21',
        ref: { table: 'TaxGroup', matchBy: ['code'], label: 'tipo de impuesto' },
      },
      { key: 'basePrice', label: 'Precio base', type: 'number', example: '0,45' },
      { key: 'minStock', label: 'Stock mínimo', type: 'number', example: '100' },
      {
        key: 'manageBy',
        label: 'Gestión',
        type: 'enum',
        enumValues: ['N', 'B', 'S'],
        example: 'N',
        help: 'N = normal, B = por lotes, S = por número de serie.',
      },
      {
        key: 'kind',
        label: 'Tipo',
        type: 'enum',
        enumValues: ['product', 'box'],
        help: 'product = artículo normal, box = caja o embalaje.',
      },
      {
        key: 'defaultWarehouse',
        label: 'Almacén por defecto',
        type: 'ref',
        bodyKey: 'defaultWarehouseId',
        ref: { table: 'Warehouse', matchBy: ['name'], label: 'almacén' },
      },
    ],
  },
];
