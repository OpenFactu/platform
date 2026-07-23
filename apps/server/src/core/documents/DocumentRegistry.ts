import * as schema from '../../db/schema';
import { type DocType } from '@openfactu/common';
import type { DocumentHooks } from './DocumentEngine';

/**
 * Tipo de documento soportado por el sistema — reexportado desde
 * @openfactu/common (fuente única compartida en todo el monorepo) en vez de
 * duplicarlo aquí como union literal propio.
 */
export type { DocType };

/**
 * Categoría funcional del documento. Abierta: los 4 valores conocidos con
 * autocompletado, más cualquier categoría aportada por tipos nuevos/plugins.
 */
export type DocCategory = 'invoice' | 'order' | 'delivery_note' | 'quote' | (string & {});

/**
 * Lado del documento (venta vs compra).
 */
export type DocSide = 'sales' | 'purchase';

/**
 * Acción de stock que realiza el documento.
 */
export type StockAction = 'IN' | 'OUT' | 'NONE';

/**
 * Configuración completa de un tipo de documento.
 * Centraliza toda la metadata que antes estaba dispersa en:
 * - DocumentEngine (hardcoded if/else)
 * - PdfPayloadBuilder (TABLE_MAP, headerPgName, linePgName, etc.)
 * - FactuApi (DOC_CLASSES, clases concretas)
 * - Rutas API (paths, eventPrefix)
 * - UI (labels, iconos, statusLabels)
 */
export interface DocumentTypeConfig {
  /** Código corto del documento (SINV, PINV, SO, PO, SDN, PDN) */
  docType: DocType;

  /** Lado: ventas o compras */
  side: DocSide;

  /** Categoría funcional */
  category: DocCategory;

  /** Etiqueta singular en español */
  label: string;

  /** Etiqueta plural en español */
  labelPlural: string;

  /** Nombre de la tabla Drizzle para el header */
  tableName: string;

  /** Tabla Drizzle del header */
  schemaTable: any;

  /** Tabla Drizzle de las líneas */
  lineSchemaTable: any;

  /** Tabla Drizzle de lotes (null si no aplica) */
  batchSchemaTable: any | null;

  /** Prefijo para eventos de hooks (p.ej. 'salesInvoice', 'purchaseOrder') */
  eventPrefix: string;

  /** Acción de stock que realiza este documento */
  stockAction: StockAction;

  /** Si true, cierra los documentos base al crear desde ellos */
  closeBaseDocuments: boolean;

  /** Puntos de extensión propios de este tipo (auto-FIFO, validaciones, fulfillment parcial de pedidos, ...) — ver `DocumentEngine.ts`. */
  hooks?: DocumentHooks;

  /** Estado inicial del documento */
  initialStatus: string;

  /** Nombre PostgreSQL de la tabla header (para queries raw) */
  headerPgName: string;

  /** Nombre PostgreSQL de la tabla de líneas (para queries raw) */
  linePgName: string;

  /** Nombre de la columna FK en las líneas que apunta al header */
  lineFk: string;

  /** Columna FK que las líneas usan para referenciar al header */
  headerRefKey: string;

  /** Ruta API base (p.ej. '/api/sales/invoices') */
  apiPath: string;

  /** Si tiene campos fiscales (documentTypeId, paymentTermId, etc.) */
  hasFiscalFields: boolean;

  /** Si soporta almacén en header y líneas */
  hasWarehouse: boolean;

  /** Si soporta proyecto/internal order en header */
  hasInternalOrder: boolean;

  /** Si soporta agente comercial en header */
  hasSalesAgent: boolean;

  /** Etiquetas de estado para UI/PDF */
  statusLabels: Record<string, string>;

  /** Tipo de documento base que puede servir como origen */
  baseDocType?: DocType;

  /** Ruta del frontend para este tipo (p.ej. '/sales/invoices'). Si falta,
   *  la UI genérica usa `/documents/{docType}`. */
  uiRoute?: string;

  /** Etiqueta del tercero ('Cliente'/'Proveedor'). Default derivado de `side`. */
  partnerLabel?: string;

  /** Placeholder del selector de tercero. Default derivado de `side`. */
  partnerPlaceholder?: string;

  /** FK de cabecera hacia un documento padre (p.ej. SDN.orderId → SO,
   *  SO.quoteId → SQ). Alimenta el grafo de trazabilidad genérico. */
  headerBaseRef?: { column: string; baseDocType: DocType };

  /** true si las líneas llevan baseType/baseId hacia documentos base
   *  (SINV/PINV). Alimenta el grafo de trazabilidad genérico. */
  linesCarryBaseRef?: boolean;

  /** Transiciones de estado manuales permitidas vía
   *  POST /api/documents/:docType/:id/status (p.ej. presupuesto
   *  Abierto→Aceptado/Rechazado). Si falta, el endpoint devuelve 404 para
   *  este tipo — los documentos con lógica fiscal/stock no se tocan a mano. */
  manualStatusTransitions?: Record<string, string[]>;
}

/**
 * Registro central de tipos de documento.
 *
 * Reemplaza los múltiples mappings hardcodeados que existían en:
 * - DocumentEngine.ts (LINE_TABLE_BY_DEF, headerRefKey, baseTables)
 * - PdfPayloadBuilder.ts (TABLE_MAP, headerPgName, linePgName, headerTableName)
 * - FactuApi.ts (DOC_CLASSES)
 *
 * Uso:
 *   const config = DocumentRegistry.get('SINV');
 *   const allInvoices = DocumentRegistry.getByCategory('invoice');
 *   const salesDocs = DocumentRegistry.getBySide('sales');
 */
export class DocumentRegistry {
  private static configs: Map<DocType, DocumentTypeConfig> = new Map();

  /**
   * Registra un tipo de documento. Debe llamarse una vez al inicio de la app.
   */
  static register(config: DocumentTypeConfig): void {
    DocumentRegistry.configs.set(config.docType, config);
  }

  /**
   * Obtiene la configuración de un tipo de documento.
   * Lanza error si no está registrado.
   */
  static get(docType: DocType): DocumentTypeConfig {
    const config = DocumentRegistry.configs.get(docType);
    if (!config) {
      throw new Error(
        `Tipo de documento no registrado: ${docType}. Regístralo con DocumentRegistry.register()`,
      );
    }
    return config;
  }

  /**
   * Obtiene todas las configuraciones registradas.
   */
  static getAll(): DocumentTypeConfig[] {
    return Array.from(DocumentRegistry.configs.values());
  }

  /**
   * Filtra por categoría (invoice, order, delivery_note).
   */
  static getByCategory(category: DocCategory): DocumentTypeConfig[] {
    return DocumentRegistry.getAll().filter((c) => c.category === category);
  }

  /**
   * Filtra por lado (sales, purchase).
   */
  static getBySide(side: DocSide): DocumentTypeConfig[] {
    return DocumentRegistry.getAll().filter((c) => c.side === side);
  }

  /**
   * Busca config por nombre de tabla PostgreSQL (header).
   */
  static getByHeaderPgName(pgName: string): DocumentTypeConfig | undefined {
    return DocumentRegistry.getAll().find((c) => c.headerPgName === pgName);
  }

  /**
   * Busca config por nombre de tabla PostgreSQL (líneas).
   */
  static getByLinePgName(pgName: string): DocumentTypeConfig | undefined {
    return DocumentRegistry.getAll().find((c) => c.linePgName === pgName);
  }

  /**
   * Busca config por tableName (Drizzle).
   */
  static getByTableName(tableName: string): DocumentTypeConfig | undefined {
    return DocumentRegistry.getAll().find((c) => c.tableName === tableName);
  }

  /**
   * Verifica si un docType está registrado.
   */
  static has(docType: string): boolean {
    return DocumentRegistry.configs.has(docType as DocType);
  }

  /**
   * Obtiene los docTypes válidos como array.
   */
  static getValidTypes(): DocType[] {
    return Array.from(DocumentRegistry.configs.keys());
  }
}
