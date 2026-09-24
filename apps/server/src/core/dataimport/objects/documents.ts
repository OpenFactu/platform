/**
 * Documentos: facturas, pedidos, albaranes y presupuestos.
 *
 * No hay una entrada escrita a mano por tipo. Los objetos se GENERAN a partir
 * de `DocumentRegistry`, que ya es la fuente de verdad de qué tipos existen:
 * así, el día que se añada un tipo nuevo aparece solo en el importador, sin
 * que nadie tenga que acordarse de tocar este fichero.
 *
 * Cada documento se crea de una vez —cabecera y líneas en la misma llamada a
 * `POST /api/documents/:docType`—, así que un documento entra entero o no
 * entra: no puede quedarse una factura con la mitad de sus líneas. Las líneas
 * viajan en una segunda hoja del mismo Excel, emparejadas con su cabecera por
 * la columna "Referencia".
 *
 * Todos nacen en BORRADOR, igual que si se hubieran tecleado. Postearlos o
 * confirmarlos sigue siendo un acto explícito desde su pantalla — un
 * importador no debería poder mover stock ni cerrar ejercicios sin que nadie
 * haya mirado lo que entró.
 */

import { GROUP_COLUMN, type ImportObjectConfig, type ImportFieldDef } from '../ImportRegistry';
import { DocumentRegistry } from '../../documents/DocumentRegistry';
import documentRouter from '../../../api/documentos/documentRouter';

/**
 * Ruta de permiso de cada tipo. Mismos valores que `RouteRegistry` en la web y
 * que `DOC_TYPE_PERMISSION_PATH` en las tools de IA.
 */
const PERMISSION_PATHS: Record<string, string> = {
  SINV: '/sales/invoices',
  PINV: '/purchases/invoices',
  SO: '/sales-orders',
  PO: '/purchase-orders',
  SDN: '/sales/delivery-notes',
  PDN: '/purchases/delivery-notes',
  SQ: '/sales/quotes',
};

const HEADER_FIELDS: ImportFieldDef[] = [
  {
    key: 'series',
    label: 'Serie',
    type: 'ref',
    bodyKey: 'seriesId',
    required: true,
    example: 'FV-2026',
    ref: { table: 'DocumentSeries', matchBy: ['name'], label: 'serie de documentos' },
  },
  {
    key: 'period',
    label: 'Ejercicio',
    type: 'ref',
    bodyKey: 'periodId',
    required: true,
    example: '2026',
    ref: { table: 'AccountingPeriod', matchBy: ['code', 'name'], label: 'ejercicio contable' },
  },
  {
    key: 'partner',
    label: 'Interlocutor',
    type: 'ref',
    bodyKey: 'partnerId',
    required: true,
    example: 'CLI-00001',
    ref: { table: 'BusinessPartner', matchBy: ['code', 'nif', 'name'], label: 'interlocutor' },
  },
  { key: 'date', label: 'Fecha', type: 'date', required: true, example: '15/01/2026' },
  { key: 'documentDate', label: 'Fecha del documento', type: 'date' },
  {
    key: 'docNum',
    label: 'Número',
    type: 'number',
    help: 'Solo si la serie es de numeración MANUAL. Con series automáticas, déjalo vacío.',
  },
  {
    key: 'warehouse',
    label: 'Almacén',
    type: 'ref',
    bodyKey: 'warehouseId',
    ref: { table: 'Warehouse', matchBy: ['name'], label: 'almacén' },
  },
  { key: 'comments', label: 'Comentarios', type: 'string' },
];

const LINE_FIELDS: ImportFieldDef[] = [
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
    example: '10',
  },
  {
    key: 'linePrice',
    label: 'Precio',
    type: 'number',
    bodyKey: 'price',
    required: true,
    example: '0,45',
  },
  {
    key: 'lineTaxGroup',
    label: 'Tipo de impuesto',
    type: 'ref',
    bodyKey: 'taxGroupId',
    required: true,
    example: 'IVA21',
    ref: { table: 'TaxGroup', matchBy: ['code'], label: 'tipo de impuesto' },
  },
  { key: 'lineDescription', label: 'Descripción', type: 'string', bodyKey: 'description' },
  { key: 'lineDiscount', label: 'Descuento (%)', type: 'number', bodyKey: 'discountRate' },
  {
    key: 'lineWarehouse',
    label: 'Almacén de la línea',
    type: 'ref',
    bodyKey: 'warehouseId',
    ref: { table: 'Warehouse', matchBy: ['name'], label: 'almacén' },
  },
];

/**
 * Un objeto de importación por cada tipo registrado.
 *
 * Se llama en el arranque, DESPUÉS de `registerDocumentTypes` (que `server.ts`
 * importa el primero de todo), así que el registro ya está poblado.
 */
export function buildDocumentObjects(): ImportObjectConfig[] {
  return DocumentRegistry.getAll().map((doc) => ({
    id: `document:${doc.docType}`,
    label: doc.labelPlural,
    description: `Cabecera y líneas en dos hojas del mismo fichero. Entran en borrador.`,
    group: 'documentos' as const,
    modulePath: PERMISSION_PATHS[doc.docType] || '/sales/invoices',
    featureFlag: doc.side === 'sales' ? 'salesEnabled' : 'purchasesEnabled',
    table: doc.headerPgName,
    router: () => documentRouter,
    createPath: `/${doc.docType}`,
    // Ni actualización ni borrado: los documentos no tienen PUT/PATCH — se
    // cancelan, que es otra cosa y tiene sus propias consecuencias contables.
    naturalKeys: [],
    dependsOn: ['partner', 'item', 'taxGroup'],
    fields: HEADER_FIELDS,
    lines: {
      label: 'Líneas',
      bodyKey: 'lines',
      groupBy: GROUP_COLUMN,
      fields: LINE_FIELDS,
    },
  }));
}
