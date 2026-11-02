import { eq, and, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { HookManager } from '../plugins/HookManager';
import { PluginFieldManager } from '../plugins/PluginFieldManager';
import { DocumentRegistry, type StockAction } from './DocumentRegistry';
import { getConfigSection } from '../config/systemConfigSection';
import { FLAGS_DEFAULTS } from '../config/appConfig';
import { JournalEngine } from '../accounting/JournalEngine';
import { TaxEngine, componentAmount, type DocSide, type TaxComponent } from '../tax/TaxEngine';
import { FiscalConnectors, type FiscalResult } from '../fiscal/FiscalConnectors';
import { buildPaymentDueLines, computeWithholding, latestDueDate } from './invoiceLock';
import * as schema from '../../db/schema';

export type { StockAction };

export interface DocumentLine {
  itemId: string;
  quantity: number | string;
  price: number | string;
  taxGroupId: string;
  warehouseId?: string;
  zoneId?: string;
  batchDetails?: Array<{
    batchNum: string;
    quantity: number;
    expiryDate?: Date;
  }>;
  baseType?: string;
  baseId?: string;
  baseLine?: number;
  [key: string]: any;
}

export interface DocumentCreateRequest {
  seriesId: string;
  /** Número tecleado por el usuario cuando la serie es de modo MANUAL. */
  docNum?: number;
  periodId: string;
  partnerId: string;
  date: Date | string;
  warehouseId?: string;
  lines: DocumentLine[];
  [key: string]: any;
}

/**
 * Contexto común pasado a todos los hooks de línea — todo lo que un hook de
 * un tipo de documento concreto (SDN, PDN, ...) suele necesitar para validar
 * o completar una línea sin que el motor tenga que conocer esa lógica.
 */
export interface LineHookContext {
  tx: any;
  tenantId: string;
  user: any;
  def: DocumentDefinition;
  request: DocumentCreateRequest;
  documentId: string;
  line: DocumentLine;
  index: number;
  itemInfo: any;
  warehouseId: string | undefined;
  /** Cantidad en UoM base = cantidad tecleada × factor de conversión. */
  baseQty: number;
  /**
   * true si el documento base de esta línea (p. ej. el albarán del que viene
   * una línea de factura) ya movió el stock físico él mismo — esta línea NO
   * moverá stock, así que las validaciones de stock/lotes/zona no aplican.
   */
  baseAlreadyMovedStock: boolean;
  flags: any;
}

export interface BatchDetailHookContext extends LineHookContext {
  batchDetail: { batchNum: string; quantity: number; expiryDate?: Date };
  action: StockAction;
}

export interface DocumentHookContext {
  tx: any;
  tenantId: string;
  user: any;
  def: DocumentDefinition;
  request: DocumentCreateRequest;
  documentId: string;
  docNum: number;
  flags: any;
}

/** Contexto de `beforeCreate`: la cabecera tal cual llega, antes de numerar nada. */
export interface DocumentBeforeCreateHookContext {
  tx: any;
  tenantId: string;
  user: any;
  def: DocumentDefinition;
  request: DocumentCreateRequest;
  flags: any;
}

/** Contexto pasado al hook `afterCancel` — espejo de `DocumentHookContext` pero para cancelación. */
export interface DocumentCancelHookContext {
  tx: any;
  tenantId: string;
  user: any;
  def: DocumentDefinition;
  documentId: string;
  /** Fila de cabecera leída ANTES de marcarla 'X' (incluye p. ej. orderId). */
  header: any;
  /** Filas de línea ya persistidas (baseType/baseId/baseLine/quantity/itemId/...). */
  lines: any[];
}

/**
 * Puntos de extensión con nombre que un `DocumentTypeConfig` puede registrar
 * para sus particularidades (ver `registerDocumentTypes.ts`), en vez de que
 * el motor conozca conceptos específicos de un tipo de documento (auto-FIFO,
 * unicidad de serie, zona requerida, fulfillment parcial de pedidos, ...).
 * Los tipos que no registran `hooks` se comportan exactamente igual que hoy.
 */
export interface DocumentHooks {
  /** Una vez, antes de numerar y de tocar nada — validar la cabecera/lanzar error. */
  beforeCreate?: (ctx: DocumentBeforeCreateHookContext) => Promise<void> | void;
  /** Por línea, antes del check de trazabilidad y del insert — validar/lanzar error. */
  beforeLine?: (ctx: LineHookContext) => Promise<void> | void;
  /** Solo si la línea no trae batchDetails y el artículo es trazable — puede devolver una lista para usar en vez de exigir selección manual. */
  resolveBatchDetails?: (
    ctx: LineHookContext,
  ) => Promise<Array<{ batchNum: string; quantity: number; expiryDate?: Date }> | undefined>;
  /** Por cada entrada de batchDetails, antes de aplicar su delta de stock — validar/lanzar error. */
  beforeBatchDetail?: (ctx: BatchDetailHookContext) => Promise<void> | void;
  /** Una vez, tras procesar todas las líneas y aplicar los totales finales — post-proceso a nivel documento. */
  afterLinesProcessed?: (ctx: DocumentHookContext) => Promise<void> | void;
  /** Tras revertir stock y marcar 'X' en `DocumentEngine.cancel()` — post-proceso específico de cancelación (p. ej. decrementar el fulfillment del pedido origen). */
  afterCancel?: (ctx: DocumentCancelHookContext) => Promise<void> | void;
}

export interface DocumentDefinition {
  tableName: string;
  schemaTable: any;
  lineSchemaTable: any;
  batchSchemaTable?: any;
  eventPrefix: string;
  stockAction: StockAction;
  closeBaseDocuments?: boolean;
  initialStatus?: string;
  hooks?: DocumentHooks;
}

interface LineAmounts {
  bruto: number;
  discount: number;
  neto: number;
  taxRate: number;
  taxAmount: number;
  withholding: number;
}

/** Lo necesario para calcular impuestos de un documento, cargado una sola vez. */
interface DocumentTaxContext {
  rates: Record<string, number>;
  groupsById: Map<string, any>;
  /** Componentes que deciden los plugins, por línea. `null` si ninguno interviene. */
  lineTaxes: Array<TaxComponent[] | null> | null;
  side: DocSide;
}

function sideOf(def: DocumentDefinition): DocSide {
  return DocumentRegistry.getByTableName(def.tableName)?.side ?? 'sales';
}

/** Error de negocio con el código HTTP que debe ver quien llama. */
function statusError(statusCode: number, message: string): Error {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

const FISCAL_FIELDS: Array<keyof FiscalResult> = [
  'fiscalHash',
  'fiscalHashPrev',
  'fiscalStatus',
  'fiscalRef',
  'fiscalSentAt',
];

export class DocumentEngine {
  /**
   * Motor Universal de Creación de Documentos
   */
  public static async create(
    tenantId: string,
    db: any, // req.tenantClient
    user: any,
    def: DocumentDefinition,
    request: DocumentCreateRequest,
  ) {
    // 1. Validar y extraer campos de plugins (filtra por plugins activos del tenant)
    const pluginFields = await PluginFieldManager.validateAndExtract(
      def.eventPrefix.charAt(0).toUpperCase() + def.eventPrefix.slice(1),
      request,
      tenantId,
      user?.role,
    );

    // Flags del tenant — necesarios para los hooks (auto-FIFO, stock
    // negativo, zonas requeridas, ...). Se leen fuera de la transacción,
    // igual que hacían los routers de albaranes antes de migrar aquí.
    const flags = await getConfigSection(db, 'flags', FLAGS_DEFAULTS);

    const result = await db.transaction(async (tx: any) => {
      // 1b. Validación de cabecera propia del tipo (p. ej. la referencia del
      // proveedor, obligatoria en facturas de compra).
      await def.hooks?.beforeCreate?.({ tx, tenantId, user, def, request, flags });

      // 2. Numeración
      const { docNum, isManualSeries } = await this.resolveDocNumber(tx, def, request);

      // 3. Pre-calcular totales para validación de hooks
      const taxContext = await this.loadTaxContext(tx, tenantId, def, request);
      const { preliminarySubtotal, preliminaryTaxTotal, docWhRate, docWithholding } =
        this.computePreliminaryTotals(request, taxContext.rates, taxContext.lineTaxes);

      // 4. Hook Before Create
      await HookManager.trigger(`${def.eventPrefix}.beforeCreate`, {
        tenantId,
        db: tx,
        data: {
          ...request,
          docNum,
          subtotal: preliminarySubtotal,
          taxTotal: preliminaryTaxTotal,
          withholdingAmount: docWithholding,
          total: preliminarySubtotal + preliminaryTaxTotal - docWithholding,
        },
        user,
      });

      // Actualizar número de serie (solo en modo automático; las manuales no
      // llevan contador porque el número lo aporta el usuario).
      await this.incrementSeriesCounter(tx, request.seriesId, docNum, isManualSeries);

      const documentId = (request as any).id || crypto.randomUUID();

      // 4. Insertar Cabecera (Temporales a 0)
      const headerValues = this.buildHeaderValues(
        def,
        request,
        pluginFields,
        docNum,
        documentId,
        user,
      );
      await tx.insert(def.schemaTable).values(headerValues);

      // 5. Procesar Líneas
      const { calculatedSubtotal, calculatedTaxTotal, breakdownMap } = await this.processLines(
        tx,
        tenantId,
        user,
        def,
        request,
        taxContext,
        documentId,
        flags,
      );

      // 7. Actualizar Totales Finales — resta la retención del documento
      await this.applyFinalTotals(
        tx,
        def,
        request,
        documentId,
        calculatedSubtotal,
        calculatedTaxTotal,
        breakdownMap,
        docWithholding,
        docWhRate,
      );

      // Post-proceso a nivel documento (p. ej. fulfillment parcial de un
      // pedido origen) — solo si el tipo de documento lo registra.
      if (def.hooks?.afterLinesProcessed) {
        await def.hooks.afterLinesProcessed({
          tx,
          tenantId,
          user,
          def,
          request,
          documentId,
          docNum,
          flags,
        });
      }

      // 8. Cierre de documentos base (si aplica)
      await this.closeBaseDocumentsIfNeeded(tx, def, request);

      // 9. Hook After Create
      await HookManager.trigger(`${def.eventPrefix}.afterCreate`, {
        tenantId,
        db: tx,
        data: { ...request, id: documentId, docNum },
        user,
      });

      return { id: documentId, docNum };
    });

    return result;
  }

  /**
   * Edición de un documento que aún no ha tenido efectos: cabecera y líneas se
   * reescriben y los totales se recalculan con el mismo cálculo que el alta.
   * Conserva id, número, serie, periodo, estado y autor.
   *
   * Solo para tipos sin movimiento de stock y en los estados que su
   * `editableStatuses` declare; quien llama comprueba además que no tenga ya
   * documentos derivados (un presupuesto convertido no se toca).
   */
  public static async update(
    tenantId: string,
    db: any,
    user: any,
    def: DocumentDefinition,
    documentId: string,
    request: DocumentCreateRequest,
  ): Promise<{ id: string; docNum: number }> {
    const config = DocumentRegistry.getByTableName(def.tableName);
    if (!config) throw new Error(`Tipo de documento no registrado para tabla ${def.tableName}`);
    if (def.stockAction !== 'NONE' || !config.editableStatuses?.length)
      throw new Error('Este tipo de documento no se puede editar una vez creado.');
    if (!Array.isArray(request.lines) || request.lines.length === 0)
      throw new Error('El documento no tiene líneas.');

    const pluginFields = await PluginFieldManager.validateAndExtract(
      def.eventPrefix.charAt(0).toUpperCase() + def.eventPrefix.slice(1),
      request,
      tenantId,
      user?.role,
    );
    const flags = await getConfigSection(db, 'flags', FLAGS_DEFAULTS);

    return db.transaction(async (tx: any) => {
      const [header] = await tx
        .select()
        .from(def.schemaTable)
        .where(eq(def.schemaTable.id, documentId));
      if (!header) throw new Error('Documento no encontrado');
      if (!config.editableStatuses!.includes(header.status))
        throw new Error('Solo se puede editar el documento mientras está abierto.');

      // Se conserva lo que identifica al documento; el resto viene del request.
      const fullRequest = {
        ...request,
        seriesId: header.seriesId,
        periodId: header.periodId,
      } as DocumentCreateRequest;
      const taxContext = await this.loadTaxContext(tx, tenantId, def, fullRequest);
      const { docWhRate, docWithholding } = this.computePreliminaryTotals(
        fullRequest,
        taxContext.rates,
        taxContext.lineTaxes,
      );

      const values = this.buildHeaderValues(
        def,
        fullRequest,
        pluginFields,
        header.docNum,
        documentId,
        user,
      );
      for (const k of ['id', 'docNum', 'seriesId', 'periodId', 'status', 'createdBy', 'createdAt'])
        delete values[k];
      await tx.update(def.schemaTable).set(values).where(eq(def.schemaTable.id, documentId));

      await tx
        .delete(def.lineSchemaTable)
        .where(eq(def.lineSchemaTable[config.lineFk], documentId));
      await TaxEngine.deleteDocumentTaxes(tx, def.tableName, documentId);
      const { calculatedSubtotal, calculatedTaxTotal, breakdownMap } = await this.processLines(
        tx,
        tenantId,
        user,
        def,
        fullRequest,
        taxContext,
        documentId,
        flags,
      );
      await this.applyFinalTotals(
        tx,
        def,
        fullRequest,
        documentId,
        calculatedSubtotal,
        calculatedTaxTotal,
        breakdownMap,
        docWithholding,
        docWhRate,
      );

      await HookManager.trigger(`${def.eventPrefix}.afterUpdate`, {
        tenantId,
        db: tx,
        data: { ...fullRequest, id: documentId, docNum: header.docNum },
        user,
      });
      return { id: documentId, docNum: header.docNum };
    });
  }

  /**
   * Motor Universal de Cancelación de Documentos — espejo de `create()`: revierte
   * stock línea a línea (respetando la misma regla `baseAlreadyMovedStock` que usa
   * la creación), reabre documentos base si el tipo cierra base docs al crear
   * (`closeBaseDocuments`), y delega en `def.hooks.afterCancel` lo específico de
   * cada tipo (p. ej. decrementar el fulfillment de un pedido origen).
   *
   * Recibe `tx` ya abierta (no `db`) porque los routers de albaranes necesitan
   * intercalar su propia cascada a shipments/picking tasks dentro de la MISMA
   * transacción que la reversión de stock.
   */
  public static async cancel(
    tx: any,
    tenantId: string,
    user: any,
    def: DocumentDefinition,
    documentId: string,
  ): Promise<{ success: true }> {
    const [header] = await tx
      .select()
      .from(def.schemaTable)
      .where(eq(def.schemaTable.id, documentId));
    if (!header) throw new Error('Documento no encontrado');
    if (header.status === 'X') throw new Error('El documento ya está cancelado');

    const config = DocumentRegistry.getByTableName(def.tableName);
    if (!config) throw new Error(`Tipo de documento no registrado para tabla ${def.tableName}`);

    const lines = await tx
      .select()
      .from(def.lineSchemaTable)
      .where(eq(def.lineSchemaTable[config.lineFk], documentId));

    await HookManager.trigger(`${def.eventPrefix}.beforeCancel`, {
      tenantId,
      db: tx,
      data: { ...header, id: documentId },
      user,
    });

    for (const line of lines) {
      await this.reverseLineStock(tx, def, line);
    }

    await tx.update(def.schemaTable).set({ status: 'X' }).where(eq(def.schemaTable.id, documentId));

    await this.reopenBaseDocumentsIfNeeded(tx, def, lines);

    if (def.hooks?.afterCancel) {
      await def.hooks.afterCancel({ tx, tenantId, user, def, documentId, header, lines });
    }

    // Solo lo que ya se había asentado existe para la administración.
    if (header.isLocked) {
      await this.notifyFiscalConnectors(tx, 'onCancel', {
        tenantId,
        user,
        config,
        documentId,
        header: { ...header, status: 'X' },
        lines,
      });
    }

    await HookManager.trigger(`${def.eventPrefix}.afterCancel`, {
      tenantId,
      db: tx,
      data: { ...header, id: documentId, status: 'X' },
      user,
    });

    return { success: true };
  }

  /**
   * Asienta un documento en borrador (D → O): lo bloquea, calcula vencimientos,
   * avisa a los conectores fiscales y genera su asiento.
   *
   * Lo fiscal va en la transacción: si un conector falla, el documento sigue en
   * borrador. El asiento va después y no impide asentar, igual que siempre: sin
   * mapeos contables el documento queda asentado, pendiente de contabilizar.
   */
  public static async post(
    tenantId: string,
    db: any,
    user: any,
    def: DocumentDefinition,
    documentId: string,
  ) {
    const config = DocumentRegistry.getByTableName(def.tableName);
    if (!config) throw new Error(`Tipo de documento no registrado para tabla ${def.tableName}`);

    const { header, paymentDueLines, dueDate } = await db.transaction(async (tx: any) => {
      const [current] = await tx
        .select()
        .from(def.schemaTable)
        .where(eq(def.schemaTable.id, documentId));
      if (!current) throw statusError(404, 'No encontrada');
      if (current.status !== 'D') {
        throw statusError(400, 'Solo se pueden asentar facturas en estado Borrador.');
      }

      await HookManager.trigger(`${def.eventPrefix}.beforePost`, {
        tenantId,
        db: tx,
        data: current,
        user,
      });

      // Si tiene PaymentTerm, calcular paymentDueLines a partir de date+days.
      let dues: Array<{ date: string; amount: number }> = [];
      let due: string | null = current.dueDate || null;
      if (current.paymentTermId) {
        const [term] = await tx
          .select()
          .from(schema.paymentTerms)
          .where(eq(schema.paymentTerms.id, current.paymentTermId));
        if (term && Array.isArray(term.lines) && term.lines.length > 0) {
          dues = buildPaymentDueLines(
            new Date(current.date),
            term.lines as Array<{ days: number; percentage: number }>,
            Number(current.total),
          );
          due = latestDueDate(dues) || due;
        }
      }

      // Con tasa de cabecera se recalcula; sin ella, la retención ya guardada
      // (por importe o por línea) es la que descontó el total y debe seguir ahí.
      const withholdingAmount =
        computeWithholding(Number(current.subtotal), current.withholdingRate) ??
        current.withholdingAmount;

      await tx
        .update(def.schemaTable)
        .set({
          status: 'O',
          isLocked: true,
          lockedAt: new Date(),
          paymentDueLines: dues,
          dueDate: due,
          withholdingAmount: withholdingAmount != null ? String(withholdingAmount) : null,
        })
        .where(eq(def.schemaTable.id, documentId));

      const lines = await tx
        .select()
        .from(def.lineSchemaTable)
        .where(eq(def.lineSchemaTable[config.lineFk], documentId));
      await this.notifyFiscalConnectors(tx, 'onPost', {
        tenantId,
        user,
        config,
        documentId,
        header: { ...current, status: 'O', isLocked: true },
        lines,
      });

      return { header: current, paymentDueLines: dues, dueDate: due };
    });

    let journalEntryId: string | null = null;
    try {
      const fresh = { ...header, isLocked: true };
      const lines = await db
        .select()
        .from(def.lineSchemaTable)
        .where(eq(def.lineSchemaTable[config.lineFk], documentId));
      // De momento solo las facturas generan asiento; otros tipos asentables, no.
      let result: { id: string } | null = null;
      if (config.category === 'invoice') {
        result =
          config.side === 'sales'
            ? await JournalEngine.createFromSalesInvoice(db, fresh, lines, user?.id, def.tableName)
            : await JournalEngine.createFromPurchaseInvoice(
                db,
                fresh,
                lines,
                user?.id,
                def.tableName,
              );
      }
      if (result) {
        await JournalEngine.post(db, result.id, user?.id);
        journalEntryId = result.id;
      }
    } catch (je: any) {
      console.warn(`[${def.eventPrefix} post] No se pudo generar asiento:`, je.message);
    }

    try {
      await HookManager.trigger(`${def.eventPrefix}.afterPost`, {
        tenantId,
        db,
        data: { ...header, status: 'O', isLocked: true, id: documentId, journalEntryId },
        user,
      });
    } catch (err: any) {
      // Ya está asentado: un fallo aquí no puede dejarlo a medias.
      console.warn(`[${def.eventPrefix} post] Fallo en un hook afterPost:`, err.message);
    }

    return { success: true, isLocked: true, paymentDueLines, dueDate, journalEntryId };
  }

  /** Avisa a los conectores fiscales de la empresa y guarda lo que devuelvan. */
  private static async notifyFiscalConnectors(
    tx: any,
    event: 'onPost' | 'onCancel',
    args: {
      tenantId: string;
      user: any;
      config: NonNullable<ReturnType<typeof DocumentRegistry.getByTableName>>;
      documentId: string;
      header: any;
      lines: any[];
    },
  ): Promise<void> {
    const { tenantId, user, config, documentId, header, lines } = args;
    if ((config.schemaTable as any).fiscalStatus === undefined) return;
    for (const connector of FiscalConnectors.activeFor(tenantId)) {
      const result = await connector[event]?.({
        tenantId,
        db: tx,
        user,
        docType: config.docType,
        side: config.side,
        document: header,
        lines,
      });
      if (!result) continue;
      const fields: Record<string, unknown> = {};
      for (const field of FISCAL_FIELDS) {
        if (result[field] !== undefined) fields[field] = result[field];
      }
      if (Object.keys(fields).length > 0) {
        await tx
          .update(config.schemaTable)
          .set(fields)
          .where(eq(config.schemaTable.id, documentId));
      }
    }
  }

  private static async resolveDocNumber(
    tx: any,
    def: DocumentDefinition,
    request: DocumentCreateRequest,
  ): Promise<{ docNum: number; isManualSeries: boolean }> {
    const [series] = await tx
      .select()
      .from(schema.documentSeries)
      .where(eq(schema.documentSeries.id, request.seriesId));
    if (!series) throw new Error('Serie no encontrada');

    // Series manuales: el número lo teclea el usuario. Series automáticas:
    // se toma y auto-incrementa `nextNumber`.
    const isManualSeries = series.numberingMode === 'MANUAL';
    let docNum: number;
    if (isManualSeries) {
      const rawDocNum = (request as any).docNum;
      docNum = Number(rawDocNum);
      if (rawDocNum == null || rawDocNum === '' || !Number.isInteger(docNum) || docNum <= 0) {
        throw new Error(
          'Debes indicar un número de documento válido (entero positivo) para una serie manual.',
        );
      }
      // Unicidad dentro de la serie: no permitir dos documentos con el
      // mismo número en la misma serie.
      const [dup] = await tx
        .select({ id: def.schemaTable.id })
        .from(def.schemaTable)
        .where(
          and(eq(def.schemaTable.seriesId, request.seriesId), eq(def.schemaTable.docNum, docNum)),
        )
        .limit(1);
      if (dup) {
        throw new Error(`Ya existe un documento con el número ${docNum} en esta serie.`);
      }
    } else {
      docNum = series.nextNumber;
    }
    return { docNum, isManualSeries };
  }

  private static async incrementSeriesCounter(
    tx: any,
    seriesId: string,
    docNum: number,
    isManualSeries: boolean,
  ) {
    if (isManualSeries) return;
    await tx
      .update(schema.documentSeries)
      .set({ nextNumber: docNum + 1 })
      .where(eq(schema.documentSeries.id, seriesId));
  }

  private static async loadTaxContext(
    tx: any,
    tenantId: string,
    def: DocumentDefinition,
    request: DocumentCreateRequest,
  ): Promise<DocumentTaxContext> {
    const allTaxGroups = await tx.select().from(schema.taxGroups);
    const side = sideOf(def);
    return {
      rates: allTaxGroups.reduce((acc: any, curr: any) => {
        acc[curr.id] = Number(curr.rate);
        return acc;
      }, {}),
      groupsById: new Map(allTaxGroups.map((g: any) => [g.id, g])),
      lineTaxes: await TaxEngine.resolveDocument(tx, tenantId, side, def.tableName, request),
      side,
    };
  }

  // Helper para aplicar discount a nivel línea (explícito o por rate)
  private static computeLineAmounts(
    line: any,
    taxRateMap: Record<string, number>,
    components?: TaxComponent[] | null,
  ): LineAmounts {
    const bruto = Number(line.quantity || 0) * Number(line.price || 0);
    const discRate = Number(line.discountRate || 0);
    const discAmt = Number(line.discountAmount || 0);
    const discount = discAmt > 0 ? discAmt : (bruto * discRate) / 100;
    const neto = bruto - discount;
    const whAmt = Number(line.withholdingAmount || 0);
    const whRate = Number(line.withholdingRate || 0);
    let withholding = whAmt > 0 ? whAmt : (neto * whRate) / 100;

    if (components) {
      const taxes = components.filter((c) => !c.isWithholding);
      const taxAmount = taxes.reduce((sum, c) => sum + componentAmount(c, neto), 0);
      // El tipo de la línea es solo la suma visible; el detalle está en los componentes.
      const taxRate =
        taxes.length === 1
          ? Number(taxes[0].rate)
          : neto !== 0
            ? Number(((taxAmount / neto) * 100).toFixed(2))
            : 0;
      if (withholding === 0) {
        withholding = components
          .filter((c) => c.isWithholding)
          .reduce((sum, c) => sum + componentAmount(c, neto), 0);
      }
      return { bruto, discount, neto, taxRate, taxAmount, withholding };
    }

    const taxRate = line.taxRate != null ? Number(line.taxRate) : taxRateMap[line.taxGroupId] || 0;
    const taxAmount = (neto * taxRate) / 100;
    return { bruto, discount, neto, taxRate, taxAmount, withholding };
  }

  private static computePreliminaryTotals(
    request: DocumentCreateRequest,
    taxRateMap: Record<string, number>,
    lineTaxes?: Array<TaxComponent[] | null> | null,
  ) {
    let preliminarySubtotal = 0;
    let preliminaryTaxTotal = 0;
    let preliminaryWithholding = 0;
    for (let i = 0; i < request.lines.length; i++) {
      const a = this.computeLineAmounts(request.lines[i], taxRateMap, lineTaxes?.[i]);
      preliminarySubtotal += a.neto;
      preliminaryTaxTotal += a.taxAmount;
      preliminaryWithholding += a.withholding;
    }
    // Retención a nivel documento: si se especifica a nivel cabecera, gana
    // sobre las de línea para no doblar.
    const docWhRate = Number((request as any).withholdingRate || 0);
    const docWhAmt = Number((request as any).withholdingAmount || 0);
    const docWithholding =
      docWhAmt > 0
        ? docWhAmt
        : docWhRate > 0
          ? (preliminarySubtotal * docWhRate) / 100
          : preliminaryWithholding;
    return {
      preliminarySubtotal,
      preliminaryTaxTotal,
      preliminaryWithholding,
      docWhRate,
      docWhAmt,
      docWithholding,
    };
  }

  private static buildHeaderValues(
    def: DocumentDefinition,
    request: DocumentCreateRequest,
    pluginFields: any,
    docNum: number,
    documentId: string,
    user: any,
  ) {
    const headerValues: any = {
      id: documentId,
      seriesId: request.seriesId,
      docNum,
      periodId: request.periodId,
      partnerId: request.partnerId,
      date: new Date(request.date),
      status: def.initialStatus || 'O',
      billToAddress: request.billToAddress || null,
      shipToAddress: request.shipToAddress || null,
      subtotal: '0',
      taxTotal: '0',
      total: '0',
      taxBreakdown: '{}',
      ...pluginFields,
    };

    // Añadir warehouseId si la tabla lo soporta
    if (def.schemaTable.warehouseId) {
      headerValues.warehouseId = request.warehouseId || null;
    }

    // Pedido origen (SDN/PDN generados desde un SO/PO) — referencia de
    // cabecera, independiente del baseId/baseType a nivel de línea.
    if (def.schemaTable.orderId) {
      headerValues.orderId = (request as any).orderId || null;
    }

    // Presupuesto origen (SO generado desde un SQ) — mismo patrón que orderId.
    if ((def.schemaTable as any).quoteId !== undefined) {
      headerValues.quoteId = (request as any).quoteId || null;
    }

    // Validez del presupuesto (solo tablas que la declaran, p.ej. SalesQuote).
    if ((def.schemaTable as any).validUntil !== undefined && (request as any).validUntil) {
      headerValues.validUntil = new Date((request as any).validUntil);
    }

    // Proyecto en cabecera (las líneas heredan si no traen propio).
    if (def.schemaTable.internalOrderId) {
      headerValues.internalOrderId = (request as any).internalOrderId || null;
    }

    // Comercial atribuido (para comisiones).
    if ((def.schemaTable as any).salesAgentId !== undefined) {
      headerValues.salesAgentId = (request as any).salesAgentId || null;
    }

    // Origen del documento (p. ej. 'web' cuando lo crea la tienda pública).
    if ((def.schemaTable as any).origin !== undefined) {
      headerValues.origin = (request as any).origin || null;
    }

    const creatorUserId = user?.id || null;
    if (creatorUserId) headerValues.createdBy = creatorUserId;

    return headerValues;
  }

  private static async processLines(
    tx: any,
    tenantId: string,
    user: any,
    def: DocumentDefinition,
    request: DocumentCreateRequest,
    taxContext: DocumentTaxContext,
    documentId: string,
    flags: any,
  ) {
    let calculatedSubtotal = 0;
    let calculatedTaxTotal = 0;
    const breakdownMap: Record<string, { base: number; tax: number }> = {};

    for (let i = 0; i < request.lines.length; i++) {
      const line = request.lines[i];
      const { lineSubtotal, lineTax } = await this.processSingleLine(
        tx,
        tenantId,
        user,
        def,
        request,
        line,
        i,
        documentId,
        taxContext,
        breakdownMap,
        flags,
      );
      calculatedSubtotal += lineSubtotal;
      calculatedTaxTotal += lineTax;
    }

    return { calculatedSubtotal, calculatedTaxTotal, breakdownMap };
  }

  private static async processSingleLine(
    tx: any,
    tenantId: string,
    user: any,
    def: DocumentDefinition,
    request: DocumentCreateRequest,
    line: DocumentLine,
    index: number,
    documentId: string,
    taxContext: DocumentTaxContext,
    breakdownMap: Record<string, { base: number; tax: number }>,
    flags: any,
  ): Promise<{ lineSubtotal: number; lineTax: number }> {
    const [itemInfo] = await tx.select().from(schema.items).where(eq(schema.items.id, line.itemId));
    if (!itemInfo) throw new Error(`Artículo ${line.itemId} no encontrado`);

    const warehouseId = line.warehouseId || request.warehouseId;
    const baseQty = Number(line.quantity) * Number(line.uomFactor || 1);

    // ¿El documento base de esta línea ya movió el stock físico él mismo?
    // (p. ej. facturar un albarán ya entregado/recibido: el albarán movió el
    // stock al crearse, así que la factura no debe volver a moverlo o se
    // cuenta dos veces). Un Pedido (SO/PO) no mueve stock, así que facturar
    // directamente desde un pedido sigue moviendo stock como antes. Se
    // expone a los hooks para que sus validaciones de stock tampoco apliquen.
    const baseConfig = line.baseType ? DocumentRegistry.get(line.baseType as any) : null;
    const baseAlreadyMovedStock = !!baseConfig && baseConfig.stockAction !== 'NONE';

    const lineHookCtx: LineHookContext = {
      tx,
      tenantId,
      user,
      def,
      request,
      documentId,
      line,
      index,
      itemInfo,
      warehouseId,
      baseQty,
      baseAlreadyMovedStock,
      flags,
    };

    // Validación de Trazabilidad — si no hay batchDetails y el tipo de
    // documento registra un resolvedor (p. ej. auto-FIFO), le damos la
    // oportunidad de completarlos antes de exigir selección manual.
    if (itemInfo.manageBy !== 'N' && def.batchSchemaTable) {
      if (
        (!line.batchDetails || line.batchDetails.length === 0) &&
        def.hooks?.resolveBatchDetails
      ) {
        const resolved = await def.hooks.resolveBatchDetails(lineHookCtx);
        if (resolved) line.batchDetails = resolved;
      }
      const totalBatched = (line.batchDetails || []).reduce(
        (acc: number, curr: any) => acc + Number(curr.quantity),
        0,
      );
      if (totalBatched < Number(line.quantity)) {
        throw new Error(
          `Artículo ${itemInfo.name} requiere trazabilidad. Pendiente: ${Number(line.quantity) - totalBatched}`,
        );
      }
    }

    // Hook de validación de línea (p. ej. stock global insuficiente, zona
    // requerida) — solo si el tipo de documento lo registra.
    if (def.hooks?.beforeLine) {
      await def.hooks.beforeLine(lineHookCtx);
    }

    const pluginComponents = taxContext.lineTaxes?.[index] ?? null;
    const amounts = this.computeLineAmounts(line, taxContext.rates, pluginComponents);
    const lineSubtotal = amounts.neto; // base imponible con descuento aplicado
    const lineTax = amounts.taxAmount;

    const components: TaxComponent[] = pluginComponents ?? [
      TaxEngine.standardComponent(
        taxContext.side,
        amounts.taxRate,
        amounts.taxAmount,
        amounts.neto,
        taxContext.groupsById.get(line.taxGroupId) ?? null,
      ),
    ];

    for (const c of components) {
      if (c.isWithholding) continue;
      const rateKey = String(c.rate);
      if (!breakdownMap[rateKey]) breakdownMap[rateKey] = { base: 0, tax: 0 };
      breakdownMap[rateKey].base += c.base != null ? Number(c.base) : lineSubtotal;
      breakdownMap[rateKey].tax += componentAmount(c, lineSubtotal);
    }

    const lineId = crypto.randomUUID();
    const config = DocumentRegistry.getByTableName(def.tableName);

    // Insertar Línea — incluye los campos de descuento/tax/retención
    // persistidos (se usan en el PDF y en re-cálculos posteriores).
    const lineValues = this.buildLineValues(
      def,
      request,
      line,
      index,
      documentId,
      lineId,
      amounts,
      config,
    );

    // Campos custom de plugins a nivel de línea. Se persisten como
    // columnas físicas con prefijo `p_` creadas vía
    // `MigrationEngine.addCustomField`. El tableName esperado por
    // `validateAndExtract` es el nombre PG real (PascalCase singular).
    const pgLineTable = config?.linePgName || '';
    if (pgLineTable) {
      const linePluginFields = await PluginFieldManager.validateAndExtract(
        pgLineTable,
        line,
        tenantId,
        user?.role,
      );
      Object.assign(lineValues, linePluginFields);
    }

    await tx.insert(def.lineSchemaTable).values(lineValues);
    await TaxEngine.saveLineTaxes(
      tx,
      def.tableName,
      documentId,
      lineId,
      taxContext.side,
      lineSubtotal,
      components,
    );

    // 6. Gestionar Stock y Lotes — pero NO si el documento base de esta
    // línea ya movió ese stock físico él mismo (ver cálculo de
    // `baseAlreadyMovedStock` arriba).
    if (!baseAlreadyMovedStock && (def.stockAction !== 'NONE' || line.batchDetails)) {
      await this.applyStockMovement(lineHookCtx, lineId);
    }

    return { lineSubtotal, lineTax };
  }

  private static buildLineValues(
    def: DocumentDefinition,
    request: DocumentCreateRequest,
    line: DocumentLine,
    index: number,
    documentId: string,
    lineId: string,
    amounts: LineAmounts,
    config: ReturnType<typeof DocumentRegistry.getByTableName>,
  ) {
    // El nombre del campo cantidad varía según la tabla:
    // SalesOrderLine/PurchaseOrderLine usan "orderedQty",
    // PurchaseInvoiceLine usa "quantity". Ambas mapean a DB "quantity".
    const qtyKey = def.lineSchemaTable.orderedQty !== undefined ? 'orderedQty' : 'quantity';

    const lineValues: any = {
      id: lineId,
      lineNum: index + 1,
      itemId: line.itemId,
      [qtyKey]: String(line.quantity),
      price: String(line.price),
      taxGroupId: line.taxGroupId || null,
      lineTotal: String((amounts.neto + amounts.taxAmount).toFixed(4)),
      uomId: (line as any).uomId || null,
      uomFactor: (line as any).uomFactor ? String((line as any).uomFactor) : '1.0000',
      description: (line as any).description || null,
      discountRate: String(Number((line as any).discountRate || 0)),
      discountAmount: String(amounts.discount.toFixed(4)),
      taxRate: String(amounts.taxRate),
      taxAmount: String(amounts.taxAmount.toFixed(4)),
      withholdingRate:
        (line as any).withholdingRate != null
          ? String(Number((line as any).withholdingRate))
          : null,
      withholdingAmount: amounts.withholding > 0 ? String(amounts.withholding.toFixed(4)) : null,
      projectId: (line as any).projectId || null,
    };

    // Mapear el ID de cabecera según la tabla — usa el registry
    const headerRefKey = config?.headerRefKey || 'orderId';
    lineValues[headerRefKey] = documentId;

    if (def.lineSchemaTable.warehouseId)
      lineValues.warehouseId = line.warehouseId || request.warehouseId || null;
    if (def.lineSchemaTable.zoneId && (line as any).zoneId)
      lineValues.zoneId = (line as any).zoneId;
    if (def.lineSchemaTable.internalOrderId) {
      // Si la línea no trae proyecto, hereda el de la cabecera.
      lineValues.internalOrderId =
        (line as any).internalOrderId || (request as any).internalOrderId || null;
    }
    if (def.lineSchemaTable.costCenterId && (line as any).costCenterId)
      lineValues.costCenterId = (line as any).costCenterId;
    if (def.lineSchemaTable.profitCenterId && (line as any).profitCenterId)
      lineValues.profitCenterId = (line as any).profitCenterId;
    if (line.baseType) lineValues.baseType = line.baseType;
    if (line.baseId) lineValues.baseId = line.baseId;
    if (line.baseLine) lineValues.baseLine = line.baseLine;

    return lineValues;
  }

  private static async applyFinalTotals(
    tx: any,
    def: DocumentDefinition,
    request: DocumentCreateRequest,
    documentId: string,
    calculatedSubtotal: number,
    calculatedTaxTotal: number,
    breakdownMap: Record<string, { base: number; tax: number }>,
    docWithholding: number,
    docWhRate: number,
  ) {
    const finalTotal = calculatedSubtotal + calculatedTaxTotal - docWithholding;
    const updatePayload: any = {
      subtotal: String(calculatedSubtotal.toFixed(4)),
      taxTotal: String(calculatedTaxTotal.toFixed(4)),
      total: String(finalTotal.toFixed(4)),
      taxBreakdown: JSON.stringify(breakdownMap),
    };
    // Campos fiscales/pago sólo si la tabla los tiene (facturas sí, pedidos/albaranes no)
    if ((def.schemaTable as any).withholdingRate !== undefined) {
      updatePayload.withholdingRate = docWhRate > 0 ? String(docWhRate) : null;
      updatePayload.withholdingAmount =
        docWithholding > 0 ? String(docWithholding.toFixed(4)) : null;
    }
    if ((def.schemaTable as any).documentTypeId !== undefined) {
      if ((request as any).documentTypeId)
        updatePayload.documentTypeId = (request as any).documentTypeId;
      if ((request as any).paymentMethodId)
        updatePayload.paymentMethodId = (request as any).paymentMethodId;
      if ((request as any).paymentTermId)
        updatePayload.paymentTermId = (request as any).paymentTermId;
      if ((request as any).currencyId) updatePayload.currencyId = (request as any).currencyId;
      if ((request as any).dueDate) updatePayload.dueDate = (request as any).dueDate;
      if ((request as any).supplyDate) updatePayload.supplyDate = (request as any).supplyDate;
      if ((request as any).notes != null) updatePayload.notes = (request as any).notes;
      if ((request as any).internalNotes != null)
        updatePayload.internalNotes = (request as any).internalNotes;
      if ((def.schemaTable as any).externalRef !== undefined) {
        const ref = String((request as any).externalRef ?? '').trim();
        if (ref) updatePayload.externalRef = ref;
      }
      if ((request as any).rectifyRef) updatePayload.rectifyRef = (request as any).rectifyRef;
      if ((request as any).rectifyReason)
        updatePayload.rectifyReason = (request as any).rectifyReason;
      if ((request as any).rectifyType) updatePayload.rectifyType = (request as any).rectifyType;
    }
    await tx.update(def.schemaTable).set(updatePayload).where(eq(def.schemaTable.id, documentId));
  }

  private static async closeBaseDocumentsIfNeeded(
    tx: any,
    def: DocumentDefinition,
    request: DocumentCreateRequest,
  ) {
    if (!def.closeBaseDocuments) return;
    const baseMap: Record<string, Set<string>> = {};
    for (const l of request.lines) {
      if (!l.baseId || !l.baseType) continue;
      if (!baseMap[l.baseType]) baseMap[l.baseType] = new Set();
      baseMap[l.baseType].add(l.baseId);
    }
    for (const [baseType, ids] of Object.entries(baseMap)) {
      const baseConfig = DocumentRegistry.get(baseType as any);
      if (!baseConfig) continue;
      for (const bId of ids) {
        await tx
          .update(baseConfig.schemaTable)
          .set({ status: 'C' })
          .where(eq(baseConfig.schemaTable.id, bId));
      }
    }
  }

  private static async applyStockMovement(ctx: LineHookContext, lineId: string) {
    const { tx, def, line, itemInfo, warehouseId, baseQty } = ctx;
    const action = def.stockAction;

    await this.moveGlobalStock(tx, itemInfo, action, baseQty);
    await this.moveWarehouseStock(tx, itemInfo, action, baseQty, warehouseId);
    await this.moveZoneStock(tx, itemInfo, action, baseQty, warehouseId, line.zoneId);
    await this.moveBatchStock(ctx, action, lineId);
  }

  // A. Stock Global
  private static async moveGlobalStock(tx: any, item: any, action: StockAction, qty: number) {
    if (action === 'OUT') {
      await tx
        .update(schema.items)
        .set({ stock: sql`${schema.items.stock} - ${qty}` })
        .where(eq(schema.items.id, item.id));
    } else if (action === 'IN') {
      await tx
        .update(schema.items)
        .set({ stock: sql`${schema.items.stock} + ${qty}` })
        .where(eq(schema.items.id, item.id));
    }
  }

  // B. Stock por Almacén
  private static async moveWarehouseStock(
    tx: any,
    item: any,
    action: StockAction,
    qty: number,
    warehouseId: string | undefined,
  ) {
    if (!warehouseId || action === 'NONE') return;

    const [stockRecord] = await tx
      .select()
      .from(schema.itemWarehouseStocks)
      .where(
        sql`${schema.itemWarehouseStocks.itemId} = ${item.id} AND ${schema.itemWarehouseStocks.warehouseId} = ${warehouseId}`,
      );

    if (stockRecord) {
      const newStock =
        action === 'OUT' ? Number(stockRecord.stock) - qty : Number(stockRecord.stock) + qty;
      await tx
        .update(schema.itemWarehouseStocks)
        .set({ stock: newStock, updatedAt: new Date() })
        .where(
          and(
            eq(schema.itemWarehouseStocks.itemId, item.id),
            eq(schema.itemWarehouseStocks.warehouseId, warehouseId),
          ),
        );
    } else if (action === 'IN') {
      await tx.insert(schema.itemWarehouseStocks).values({
        itemId: item.id,
        warehouseId,
        stock: qty,
        updatedAt: new Date(),
      });
    }
  }

  // D. Stock por Zona — capacidad universal del motor (no depende de
  // hooks): si la línea especifica una zona dentro del almacén, se mueve
  // igual que el stock por almacén. Antes esto solo lo hacían los routers
  // de albaranes inline; `zoneId` ya se persistía en la línea pero nunca
  // llegaba a mover `itemZoneStocks`.
  private static async moveZoneStock(
    tx: any,
    item: any,
    action: StockAction,
    qty: number,
    warehouseId: string | undefined,
    zoneId: string | undefined,
  ) {
    if (!warehouseId || !zoneId || action === 'NONE') return;

    const [stockRecord] = await tx
      .select()
      .from(schema.itemZoneStocks)
      .where(
        and(
          eq(schema.itemZoneStocks.itemId, item.id),
          eq(schema.itemZoneStocks.warehouseId, warehouseId),
          eq(schema.itemZoneStocks.zoneId, zoneId),
        ),
      );

    if (stockRecord) {
      const newStock =
        action === 'OUT' ? Number(stockRecord.stock) - qty : Number(stockRecord.stock) + qty;
      await tx
        .update(schema.itemZoneStocks)
        .set({ stock: newStock, updatedAt: new Date() })
        .where(
          and(
            eq(schema.itemZoneStocks.itemId, item.id),
            eq(schema.itemZoneStocks.warehouseId, warehouseId),
            eq(schema.itemZoneStocks.zoneId, zoneId),
          ),
        );
    } else if (action === 'IN') {
      await tx.insert(schema.itemZoneStocks).values({
        itemId: item.id,
        warehouseId,
        zoneId,
        stock: qty,
        updatedAt: new Date(),
      });
    }
  }

  // C. Lotes y Series
  private static async moveBatchStock(ctx: LineHookContext, action: StockAction, lineId: string) {
    const { tx, line, itemInfo: item, warehouseId, def } = ctx;
    const batchTable = def.batchSchemaTable;
    if (!line.batchDetails || !batchTable) return;

    for (const bd of line.batchDetails) {
      // Hook de validación por lote (p. ej. unicidad de serie) — antes de
      // cualquier lectura/escritura del motor sobre este lote.
      if (def.hooks?.beforeBatchDetail) {
        await def.hooks.beforeBatchDetail({ ...ctx, batchDetail: bd, action });
      }

      // Actualizar maestro de lotes
      const [existingBatch] = await tx
        .select()
        .from(schema.itemBatches)
        .where(
          sql`${schema.itemBatches.itemId} = ${item.id} AND ${schema.itemBatches.batchNum} = ${bd.batchNum}`,
        );

      if (action === 'OUT') {
        // Validar disponibilidad ANTES de descontar — si conocemos el
        // almacén, la disponibilidad real es la de ESE almacén
        // (itemBatchStocks), no el total global del lote: un mismo lote
        // puede repartirse entre varios almacenes, y comparar solo contra
        // el global permite dejar un almacén concreto en negativo aunque
        // "sobre" stock del lote en otro almacén.
        let availableQty = Number(existingBatch?.quantity || 0);
        if (warehouseId) {
          const [batchStock] = await tx
            .select({ quantity: schema.itemBatchStocks.quantity })
            .from(schema.itemBatchStocks)
            .where(
              and(
                eq(schema.itemBatchStocks.itemId, item.id),
                eq(schema.itemBatchStocks.batchNum, bd.batchNum),
                eq(schema.itemBatchStocks.warehouseId, warehouseId),
              ),
            );
          availableQty = Number(batchStock?.quantity || 0);
        }
        if (!existingBatch || availableQty < Number(bd.quantity)) {
          throw new Error(
            `Stock insuficiente en el lote ${bd.batchNum} para el artículo ${item.name}. Disponible: ${availableQty}`,
          );
        }
      }

      const batchId = crypto.randomUUID();
      const values: any = {
        id: batchId,
        batchNum: bd.batchNum,
        quantity: bd.quantity,
      };

      // Detectar FK de línea
      if (batchTable.invoiceLineId) values.invoiceLineId = lineId;
      else if (batchTable.deliveryLineId) values.deliveryLineId = lineId;

      await tx.insert(batchTable).values(values);

      if (existingBatch) {
        const newQty =
          action === 'OUT'
            ? Number(existingBatch.quantity) - bd.quantity
            : Number(existingBatch.quantity) + bd.quantity;
        await tx
          .update(schema.itemBatches)
          .set({ quantity: newQty })
          .where(eq(schema.itemBatches.id, existingBatch.id));
      } else if (action === 'IN') {
        await tx.insert(schema.itemBatches).values({
          id: crypto.randomUUID(),
          itemId: item.id,
          batchNum: bd.batchNum,
          quantity: bd.quantity,
          expiryDate: bd.expiryDate ? new Date(bd.expiryDate) : null,
        });
      }

      // C.2 Lotes por almacén — mantiene la ubicación ACTUAL del lote
      // (itemBatches solo guarda el total global; sin esto la trazabilidad
      // por almacén se queda con la ubicación de su primera entrada).
      if (warehouseId) {
        const [existingBatchStock] = await tx
          .select()
          .from(schema.itemBatchStocks)
          .where(
            and(
              eq(schema.itemBatchStocks.itemId, item.id),
              eq(schema.itemBatchStocks.batchNum, bd.batchNum),
              eq(schema.itemBatchStocks.warehouseId, warehouseId),
            ),
          );
        const batchDelta = action === 'OUT' ? -bd.quantity : bd.quantity;
        if (existingBatchStock) {
          await tx
            .update(schema.itemBatchStocks)
            .set({
              quantity: sql`${schema.itemBatchStocks.quantity} + ${batchDelta}`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(schema.itemBatchStocks.itemId, item.id),
                eq(schema.itemBatchStocks.batchNum, bd.batchNum),
                eq(schema.itemBatchStocks.warehouseId, warehouseId),
              ),
            );
        } else if (action === 'IN') {
          await tx.insert(schema.itemBatchStocks).values({
            itemId: item.id,
            batchNum: bd.batchNum,
            warehouseId,
            quantity: bd.quantity,
            updatedAt: new Date(),
          });
        }
      }
    }
  }

  // ── Reversión de stock al cancelar ──────────────────────────────────

  /**
   * Revierte el stock (global/almacén/zona/lotes) de una línea ya persistida,
   * salvo que el documento base de esa línea ya moviera ese stock él mismo
   * (misma regla `baseAlreadyMovedStock` que usa `processSingleLine` al crear)
   * o que el tipo de documento no mueva stock (`stockAction === 'NONE'`).
   */
  private static async reverseLineStock(tx: any, def: DocumentDefinition, line: any) {
    const baseConfig = line.baseType ? DocumentRegistry.get(line.baseType as any) : null;
    const baseAlreadyMovedStock = !!baseConfig && baseConfig.stockAction !== 'NONE';
    if (baseAlreadyMovedStock || def.stockAction === 'NONE') return;

    const reverseAction: StockAction = def.stockAction === 'OUT' ? 'IN' : 'OUT';
    const baseQty = Number(line.quantity) * Number(line.uomFactor || 1);
    const item = { id: line.itemId };
    const warehouseId = line.warehouseId || undefined;

    await this.moveGlobalStock(tx, item, reverseAction, baseQty);
    await this.moveWarehouseStock(tx, item, reverseAction, baseQty, warehouseId);
    await this.moveZoneStock(
      tx,
      item,
      reverseAction,
      baseQty,
      warehouseId,
      line.zoneId || undefined,
    );
    await this.reverseBatchStock(tx, def, line, reverseAction);
  }

  /**
   * Revierte los lotes/series ya persistidos de una línea (leídos de
   * `def.batchSchemaTable`) — a diferencia de `moveBatchStock`, que opera
   * sobre `line.batchDetails` en memoria durante la creación.
   */
  private static async reverseBatchStock(
    tx: any,
    def: DocumentDefinition,
    line: any,
    action: StockAction,
  ) {
    const batchTable = def.batchSchemaTable;
    if (!batchTable) return;

    const batchFkCol = 'invoiceLineId' in batchTable ? 'invoiceLineId' : 'deliveryLineId';
    const batches = await tx
      .select()
      .from(batchTable)
      .where(eq((batchTable as any)[batchFkCol], line.id));

    for (const bd of batches) {
      const delta = action === 'IN' ? Number(bd.quantity) : -Number(bd.quantity);
      await tx
        .update(schema.itemBatches)
        .set({ quantity: sql`${schema.itemBatches.quantity} + ${delta}` })
        .where(
          sql`${schema.itemBatches.itemId} = ${line.itemId} AND ${schema.itemBatches.batchNum} = ${bd.batchNum}`,
        );
      if (line.warehouseId) {
        await tx
          .update(schema.itemBatchStocks)
          .set({
            quantity: sql`${schema.itemBatchStocks.quantity} + ${delta}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.itemBatchStocks.itemId, line.itemId),
              eq(schema.itemBatchStocks.batchNum, bd.batchNum),
              eq(schema.itemBatchStocks.warehouseId, line.warehouseId),
            ),
          );
      }
    }
  }

  /**
   * Reabre (status → 'O') los documentos base referenciados por las líneas,
   * espejo exacto de `closeBaseDocumentsIfNeeded` — mismo flag
   * `def.closeBaseDocuments` (hoy solo SINV/PINV → reabren su SDN/PDN origen).
   */
  private static async reopenBaseDocumentsIfNeeded(tx: any, def: DocumentDefinition, lines: any[]) {
    if (!def.closeBaseDocuments) return;
    const baseMap: Record<string, Set<string>> = {};
    for (const l of lines) {
      if (!l.baseId || !l.baseType) continue;
      if (!baseMap[l.baseType]) baseMap[l.baseType] = new Set();
      baseMap[l.baseType].add(l.baseId);
    }
    for (const [baseType, ids] of Object.entries(baseMap)) {
      const baseConfig = DocumentRegistry.get(baseType as any);
      if (!baseConfig) continue;
      for (const bId of ids) {
        await tx
          .update(baseConfig.schemaTable)
          .set({ status: 'O' })
          .where(eq(baseConfig.schemaTable.id, bId));
      }
    }
  }
}
