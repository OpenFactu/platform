import * as schema from '../../db/schema';

/**
 * Tipo de documento soportado por el sistema.
 */
export type DocType = 'SINV' | 'PINV' | 'SO' | 'PO' | 'SDN' | 'PDN';

/**
 * Categoría funcional del documento.
 */
export type DocCategory = 'invoice' | 'order' | 'delivery_note';

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
