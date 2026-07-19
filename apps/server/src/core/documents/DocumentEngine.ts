import { eq, and, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { HookManager } from '../plugins/HookManager';
import { PluginFieldManager } from '../plugins/PluginFieldManager';
import { DocumentRegistry } from './DocumentRegistry';
import * as schema from '../../db/schema';

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

export interface DocumentDefinition {
  tableName: string;
  schemaTable: any;
  lineSchemaTable: any;
  batchSchemaTable?: any;
  eventPrefix: string;
  stockAction: 'IN' | 'OUT' | 'NONE';
  closeBaseDocuments?: boolean;
  initialStatus?: string;
}

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

    const result = await db.transaction(async (tx: any) => {
      // 2. Numeración
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
        if (
          rawDocNum == null ||
          rawDocNum === '' ||
          !Number.isInteger(docNum) ||
          docNum <= 0
        ) {
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
            and(
              eq(def.schemaTable.seriesId, request.seriesId),
              eq(def.schemaTable.docNum, docNum),
            ),
          )
          .limit(1);
        if (dup) {
          throw new Error(`Ya existe un documento con el número ${docNum} en esta serie.`);
        }
      } else {
        docNum = series.nextNumber;
      }

      // 3. Pre-calcular totales para validación de hooks
      const allTaxGroups = await tx.select().from(schema.taxGroups);
      const taxRateMap = allTaxGroups.reduce((acc: any, curr: any) => {
        acc[curr.id] = Number(curr.rate);
        return acc;
      }, {});

      // Helper para aplicar discount a nivel línea (explícito o por rate)
      const computeLineAmounts = (
        line: any,
      ): {
        bruto: number;
        discount: number;
        neto: number;
        taxRate: number;
        taxAmount: number;
        withholding: number;
      } => {
        const bruto = Number(line.quantity || 0) * Number(line.price || 0);
        const discRate = Number(line.discountRate || 0);
        const discAmt = Number(line.discountAmount || 0);
        const discount = discAmt > 0 ? discAmt : (bruto * discRate) / 100;
        const neto = bruto - discount;
        const taxRate =
          line.taxRate != null ? Number(line.taxRate) : taxRateMap[line.taxGroupId] || 0;
        const taxAmount = (neto * taxRate) / 100;
        const whAmt = Number(line.withholdingAmount || 0);
        const whRate = Number(line.withholdingRate || 0);
        const withholding = whAmt > 0 ? whAmt : (neto * whRate) / 100;
        return { bruto, discount, neto, taxRate, taxAmount, withholding };
      };

      let preliminarySubtotal = 0;
      let preliminaryTaxTotal = 0;
      let preliminaryWithholding = 0;
      for (const line of request.lines) {
        const a = computeLineAmounts(line);
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
      if (!isManualSeries) {
        await tx
          .update(schema.documentSeries)
          .set({ nextNumber: docNum + 1 })
          .where(eq(schema.documentSeries.id, request.seriesId));
      }

      const documentId = (request as any).id || crypto.randomUUID();
      let calculatedSubtotal = 0;
      let calculatedTaxTotal = 0;
      const breakdownMap: Record<string, { base: number; tax: number }> = {};

      // 4. Insertar Cabecera (Temporales a 0)
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

      // Proyecto en cabecera (las líneas heredan si no traen propio).
      if (def.schemaTable.internalOrderId) {
        headerValues.internalOrderId = (request as any).internalOrderId || null;
      }

      // Comercial atribuido (para comisiones).
      if ((def.schemaTable as any).salesAgentId !== undefined) {
        headerValues.salesAgentId = (request as any).salesAgentId || null;
      }

      const creatorUserId = user?.id || null;
      if (creatorUserId) headerValues.createdBy = creatorUserId;

      await tx.insert(def.schemaTable).values(headerValues);

      // 5. Procesar Líneas
      for (let i = 0; i < request.lines.length; i++) {
        const line = request.lines[i];
        const [itemInfo] = await tx
          .select()
          .from(schema.items)
          .where(eq(schema.items.id, line.itemId));
        if (!itemInfo) throw new Error(`Artículo ${line.itemId} no encontrado`);

        // Validación de Trazabilidad
        if (itemInfo.manageBy !== 'N' && def.batchSchemaTable) {
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

        const amounts = computeLineAmounts(line);
        const lineSubtotal = amounts.neto; // base imponible con descuento aplicado
        const taxRate = amounts.taxRate;
        const lineTax = amounts.taxAmount;

        calculatedSubtotal += lineSubtotal;
        calculatedTaxTotal += lineTax;

        const rateKey = String(taxRate);
        if (!breakdownMap[rateKey]) breakdownMap[rateKey] = { base: 0, tax: 0 };
        breakdownMap[rateKey].base += lineSubtotal;
        breakdownMap[rateKey].tax += lineTax;

        const lineId = crypto.randomUUID();

        // Insertar Línea — incluye los campos de descuento/tax/retención
        // persistidos (se usan en el PDF y en re-cálculos posteriores).
        // El nombre del campo cantidad varía según la tabla:
        // SalesOrderLine/PurchaseOrderLine usan "orderedQty",
        // PurchaseInvoiceLine usa "quantity". Ambas mapean a DB "quantity".
        const qtyKey = def.lineSchemaTable.orderedQty !== undefined ? 'orderedQty' : 'quantity';

        const lineValues: any = {
          id: lineId,
          lineNum: i + 1,
          itemId: line.itemId,
          [qtyKey]: String(line.quantity),
          price: String(line.price),
          taxGroupId: line.taxGroupId || null,
          lineTotal: String((lineSubtotal + lineTax).toFixed(4)),
          uomId: line.uomId || null,
          uomFactor: line.uomFactor ? String(line.uomFactor) : '1.0000',
          description: (line as any).description || null,
          discountRate: String(Number((line as any).discountRate || 0)),
          discountAmount: String(amounts.discount.toFixed(4)),
          taxRate: String(taxRate),
          taxAmount: String(lineTax.toFixed(4)),
          withholdingRate:
            (line as any).withholdingRate != null
              ? String(Number((line as any).withholdingRate))
              : null,
          withholdingAmount:
            amounts.withholding > 0 ? String(amounts.withholding.toFixed(4)) : null,
          projectId: (line as any).projectId || null,
        };

        // Mapear el ID de cabecera según la tabla — usa el registry
        const config = DocumentRegistry.getByTableName(def.tableName);
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

        // 6. Gestionar Stock y Lotes
        if (def.stockAction !== 'NONE' || line.batchDetails) {
          await this.processInventory(
            tx,
            itemInfo,
            line,
            def.stockAction,
            def.batchSchemaTable,
            lineId,
            request.warehouseId,
          );
        }
      }

      // 7. Actualizar Totales Finales — resta la retención del documento
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
        if ((request as any).rectifyRef) updatePayload.rectifyRef = (request as any).rectifyRef;
        if ((request as any).rectifyReason)
          updatePayload.rectifyReason = (request as any).rectifyReason;
        if ((request as any).rectifyType) updatePayload.rectifyType = (request as any).rectifyType;
      }
      await tx.update(def.schemaTable).set(updatePayload).where(eq(def.schemaTable.id, documentId));

      // 8. Cierre de documentos base (si aplica)
      if (def.closeBaseDocuments) {
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

  private static async processInventory(
    tx: any,
    item: any,
    line: DocumentLine,
    action: 'IN' | 'OUT' | 'NONE',
    batchTable: any,
    lineId: string,
    globalWarehouseId?: string,
  ) {
    // Cantidad en UoM base = cantidad tecleada × factor de conversión
    const uomFactor = Number(line.uomFactor || 1);
    const qty = Number(line.quantity) * uomFactor;
    const warehouseId = line.warehouseId || globalWarehouseId;

    // A. Stock Global
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

    // B. Stock por Almacén
    if (warehouseId && action !== 'NONE') {
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

    // C. Lotes y Series
    if (line.batchDetails && batchTable) {
      for (const bd of line.batchDetails) {
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

        // Actualizar maestro de lotes
        const [existingBatch] = await tx
          .select()
          .from(schema.itemBatches)
          .where(
            sql`${schema.itemBatches.itemId} = ${item.id} AND ${schema.itemBatches.batchNum} = ${bd.batchNum}`,
          );

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
  }
}
