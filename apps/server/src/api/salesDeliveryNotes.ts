import { Router } from 'express';
import { and, eq, inArray, notInArray, sql, desc } from 'drizzle-orm';
import * as schema from '../db/schema';
import crypto from 'crypto';
import { renderDocumentPdf } from '../core/documents/renderDocumentPdf';
import { getConfigSection } from '../core/config/systemConfigSection';
import { FLAGS_DEFAULTS } from '../core/config/appConfig';
import { logAudit } from '../utils/audit';
import { notifyShipmentStageChange } from '../core/logistics/shipmentNotifications';
import { dispatchEvent } from '../core/webhooks/WebhookQueue';

const router = Router();

// GET all delivery notes
router.get('/', async (req: any, res) => {
  try {
    const results = await req.tenantClient
      .select({
        id: schema.salesDeliveryNotes.id,
        docNum: schema.salesDeliveryNotes.docNum,
        seriesPrefix: schema.documentSeries.prefix,
        numberingMode: schema.documentSeries.numberingMode,
        periodCode: schema.accountingPeriods.code,
        date: schema.salesDeliveryNotes.date,
        partnerId: schema.salesDeliveryNotes.partnerId,
        total: schema.salesDeliveryNotes.total,
        status: schema.salesDeliveryNotes.status,
        orderId: schema.salesDeliveryNotes.orderId,
        orderDocNum: schema.salesOrders.docNum,
        orderPrefix: sql`(SELECT "prefix" FROM "DocumentSeries" WHERE id = ${schema.salesOrders.seriesId})`,
      })
      .from(schema.salesDeliveryNotes)
      .leftJoin(schema.salesOrders, eq(schema.salesDeliveryNotes.orderId, schema.salesOrders.id))
      .leftJoin(
        schema.documentSeries,
        eq(schema.salesDeliveryNotes.seriesId, schema.documentSeries.id),
      )
      .leftJoin(
        schema.accountingPeriods,
        eq(schema.salesDeliveryNotes.periodId, schema.accountingPeriods.id),
      )
      .orderBy(desc(schema.salesDeliveryNotes.date));

    // Enriquecer con info de preparación — ¿tiene shipment vivo vinculado?
    // Así el UI puede mostrar un badge "En preparación" y ocultar el botón
    // Preparar cuando ya se ha disparado. Una sola query + map en memoria.
    const ids = results.map((r: any) => r.id);
    let shipmentMap = new Map<string, string>();
    if (ids.length > 0) {
      const activeShipments = await req.tenantClient
        .select({
          id: schema.shipments.id,
          sourceDocId: schema.shipments.sourceDocId,
        })
        .from(schema.shipments)
        .where(
          and(
            eq(schema.shipments.sourceDocType, 'SDN'),
            inArray(schema.shipments.sourceDocId, ids),
            notInArray(schema.shipments.preparationStatus, ['cancelled', 'delivered', 'returned']),
          ),
        );
      for (const s of activeShipments as any[]) {
        if (s.sourceDocId) shipmentMap.set(s.sourceDocId, s.id);
      }
    }
    const enriched = results.map((r: any) => ({
      ...r,
      hasActiveShipment: shipmentMap.has(r.id),
      activeShipmentId: shipmentMap.get(r.id) || null,
    }));
    res.json(enriched);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET detail
router.get('/:id', async (req: any, res) => {
  try {
    const [header] = await req.tenantClient
      .select({
        header: schema.salesDeliveryNotes,
        seriesPrefix: schema.documentSeries.prefix,
        numberingMode: schema.documentSeries.numberingMode,
        periodCode: schema.accountingPeriods.code,
        orderDocNum: schema.salesOrders.docNum,
        orderPrefix: sql`(SELECT "prefix" FROM "DocumentSeries" WHERE id = ${schema.salesOrders.seriesId})`,
      })
      .from(schema.salesDeliveryNotes)
      .leftJoin(schema.salesOrders, eq(schema.salesDeliveryNotes.orderId, schema.salesOrders.id))
      .leftJoin(
        schema.documentSeries,
        eq(schema.salesDeliveryNotes.seriesId, schema.documentSeries.id),
      )
      .leftJoin(
        schema.accountingPeriods,
        eq(schema.salesDeliveryNotes.periodId, schema.accountingPeriods.id),
      )
      .where(eq(schema.salesDeliveryNotes.id, req.params.id));

    if (!header) return res.status(404).json({ error: 'No encontrado' });

    const lines = await req.tenantClient
      .select()
      .from(schema.salesDeliveryNoteLines)
      .where(eq(schema.salesDeliveryNoteLines.deliveryId, req.params.id));

    const linesWithBatches = await Promise.all(
      lines.map(async (line: any) => {
        const batches = await req.tenantClient
          .select()
          .from(schema.salesDeliveryNoteLineBatches)
          .where(eq(schema.salesDeliveryNoteLineBatches.deliveryLineId, line.id));

        return {
          ...line,
          batchDetails: batches.map((b: any) => ({
            batchNum: b.batchNum,
            quantity: Number(b.quantity),
          })),
        };
      }),
    );

    res.json({
      ...header.header,
      seriesPrefix: header.seriesPrefix,
      numberingMode: header.numberingMode,
      periodCode: header.periodCode,
      orderDocNum: header.orderDocNum,
      orderPrefix: header.orderPrefix,
      lines: linesWithBatches,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /:id/pdf
router.get('/:id/pdf', async (req: any, res) => {
  try {
    await renderDocumentPdf(
      'SDN',
      req.params.id,
      req.query.templateId as string | undefined,
      req.tenantClient,
      res,
      req.tenantId,
    );
  } catch (error: any) {
    console.error('[SalesDeliveryNote PDF] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST new sales delivery note (Relieved Goods)
router.post('/', async (req: any, res) => {
  const { seriesId, periodId, partnerId, orderId, date, lines, warehouseId, internalOrderId } =
    req.body;

  try {
    const flags = await getConfigSection(req.tenantClient, 'flags', FLAGS_DEFAULTS);

    const result = await req.tenantClient.transaction(async (tx: any) => {
      // 1. Numeración (automática o manual según la serie)
      const [series] = await tx
        .select()
        .from(schema.documentSeries)
        .where(eq(schema.documentSeries.id, seriesId));
      if (!series) throw new Error('Serie no encontrada');

      const isManualSeries = series.numberingMode === 'MANUAL';
      let docNum: number;
      if (isManualSeries) {
        const rawDocNum = req.body.docNum;
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
        const [dup] = await tx
          .select({ id: schema.salesDeliveryNotes.id })
          .from(schema.salesDeliveryNotes)
          .where(
            and(
              eq(schema.salesDeliveryNotes.seriesId, seriesId),
              eq(schema.salesDeliveryNotes.docNum, docNum),
            ),
          )
          .limit(1);
        if (dup) throw new Error(`Ya existe un documento con el número ${docNum} en esta serie.`);
      } else {
        docNum = series.nextNumber;
        await tx
          .update(schema.documentSeries)
          .set({ nextNumber: docNum + 1 })
          .where(eq(schema.documentSeries.id, seriesId));
      }

      const deliveryId = crypto.randomUUID();
      let calculatedSubtotal = 0;
      let calculatedTaxTotal = 0;
      const breakdownMap: Record<string, { base: number; tax: number }> = {};

      const allTaxGroups = await tx.select().from(schema.taxGroups);
      const taxRateMap = allTaxGroups.reduce((acc: any, curr: any) => {
        acc[curr.id] = Number(curr.rate);
        return acc;
      }, {});

      // 2. Insertar Cabecera Temporal
      await tx.insert(schema.salesDeliveryNotes).values({
        id: deliveryId,
        seriesId,
        docNum,
        periodId,
        partnerId,
        orderId: orderId || null,
        date: new Date(date),
        status: 'O',
        billToAddress: req.body.billToAddress || null,
        shipToAddress: req.body.shipToAddress || null,
        warehouseId: warehouseId || null,
        internalOrderId: internalOrderId || null,
        subtotal: '0',
        taxTotal: '0',
        total: '0',
        taxBreakdown: '{}',
        createdBy: req.user?.id || null,
      });

      // 3. Procesar Líneas y Stock
      for (const line of lines) {
        const [itemInfo] = await tx
          .select()
          .from(schema.items)
          .where(eq(schema.items.id, line.itemId));
        if (!itemInfo) throw new Error(`Artículo ${line.itemId} no encontrado`);

        // Cantidad convertida a UoM base del artículo
        const uomFactor = Number(line.uomFactor || 1);
        const baseQty = Number(line.quantity) * uomFactor;

        // VALIDACIÓN STOCK (si allowNegativeStock está desactivado)
        if (!flags.allowNegativeStock && Number(itemInfo.stock) < baseQty) {
          throw new Error(
            `Stock insuficiente para el artículo ${itemInfo.name}. Disponible: ${itemInfo.stock}, Requerido: ${baseQty}`,
          );
        }

        const qty = Number(line.quantity);
        const price = Number(line.price);
        const gross = qty * price;
        const discountRate = Number(line.discountRate || 0);
        const discountAmount =
          line.discountAmount != null ? Number(line.discountAmount) : gross * (discountRate / 100);
        const lineSubtotal = gross - discountAmount;
        const taxRate = taxRateMap[line.taxGroupId] || 0;
        const lineTax = lineSubtotal * (taxRate / 100);
        const withholdingRate = Number(line.withholdingRate || 0);
        const withholdingAmount =
          line.withholdingAmount != null
            ? Number(line.withholdingAmount)
            : lineSubtotal * (withholdingRate / 100);

        calculatedSubtotal += lineSubtotal;
        calculatedTaxTotal += lineTax;

        const rateKey = String(taxRate);
        if (!breakdownMap[rateKey]) breakdownMap[rateKey] = { base: 0, tax: 0 };
        breakdownMap[rateKey].base += lineSubtotal;
        breakdownMap[rateKey].tax += lineTax;

        const lineId = crypto.randomUUID();
        const targetWarehouse = line.warehouseId || warehouseId;

        // A. Insertar Línea
        await tx.insert(schema.salesDeliveryNoteLines).values({
          id: lineId,
          deliveryId,
          lineNum: line.lineNum || lines.indexOf(line) + 1,
          itemId: line.itemId,
          warehouseId: targetWarehouse,
          zoneId: line.zoneId || null,
          quantity: String(qty),
          price: String(price),
          taxGroupId: line.taxGroupId || null,
          lineTotal: String(lineSubtotal + lineTax),
          baseLine: line.baseLine || null,
          uomId: line.uomId || null,
          uomFactor: String(uomFactor),
          // Mig 032 — desglose fiscal por línea.
          description: line.description || null,
          discountRate: String(discountRate),
          discountAmount: String(discountAmount.toFixed(4)),
          taxRate: String(taxRate),
          taxAmount: String(lineTax.toFixed(4)),
          withholdingRate: withholdingRate ? String(withholdingRate) : null,
          withholdingAmount: withholdingAmount ? String(withholdingAmount.toFixed(4)) : null,
          costCenterId: line.costCenterId || null,
          profitCenterId: line.profitCenterId || null,
          internalOrderId: line.internalOrderId || internalOrderId || null,
        });

        // B. Reducir Stock Global (en UoM base)
        await tx
          .update(schema.items)
          .set({ stock: sql`${schema.items.stock} - ${baseQty}` })
          .where(eq(schema.items.id, line.itemId));

        // C. Reducir Stock por Almacén / Ubicación (en UoM base)
        if (targetWarehouse) {
          await tx
            .update(schema.itemWarehouseStocks)
            .set({
              stock: sql`${schema.itemWarehouseStocks.stock} - ${baseQty}`,
              updatedAt: new Date(),
            })
            .where(
              sql`${schema.itemWarehouseStocks.itemId} = ${line.itemId} AND ${schema.itemWarehouseStocks.warehouseId} = ${targetWarehouse}`,
            );

          if (line.zoneId) {
            await tx
              .update(schema.itemZoneStocks)
              .set({
                stock: sql`${schema.itemZoneStocks.stock} - ${baseQty}`,
                updatedAt: new Date(),
              })
              .where(
                sql`${schema.itemZoneStocks.itemId} = ${line.itemId} AND ${schema.itemZoneStocks.warehouseId} = ${targetWarehouse} AND ${schema.itemZoneStocks.zoneId} = ${line.zoneId}`,
              );
          }
        }

        // D. Gestionar LOTES / SERIES (Salida)
        const hasManualBatches =
          line.batchDetails && Array.isArray(line.batchDetails) && line.batchDetails.length > 0;

        if (hasManualBatches) {
          for (const bd of line.batchDetails) {
            // Validar que el lote existe y tiene stock
            const [existingBatch] = await tx
              .select()
              .from(schema.itemBatches)
              .where(
                sql`${schema.itemBatches.itemId} = ${line.itemId} AND ${schema.itemBatches.batchNum} = ${bd.batchNum}`,
              );

            if (!existingBatch || Number(existingBatch.quantity) < Number(bd.quantity)) {
              throw new Error(
                `Stock insuficiente en el lote ${bd.batchNum} para el artículo ${itemInfo.name}. Disponible: ${existingBatch?.quantity || 0}`,
              );
            }

            await tx.insert(schema.salesDeliveryNoteLineBatches).values({
              id: crypto.randomUUID(),
              deliveryLineId: lineId,
              batchNum: bd.batchNum,
              quantity: bd.quantity,
            });

            await tx
              .update(schema.itemBatches)
              .set({ quantity: sql`${schema.itemBatches.quantity} - ${Number(bd.quantity)}` })
              .where(eq(schema.itemBatches.id, existingBatch.id));

            if (targetWarehouse) {
              await tx
                .update(schema.itemBatchStocks)
                .set({
                  quantity: sql`${schema.itemBatchStocks.quantity} - ${Number(bd.quantity)}`,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(schema.itemBatchStocks.itemId, line.itemId),
                    eq(schema.itemBatchStocks.batchNum, bd.batchNum),
                    eq(schema.itemBatchStocks.warehouseId, targetWarehouse),
                  ),
                );
            }
          }
        } else if (itemInfo.manageBy !== 'N') {
          // Sin lotes manuales: auto-asignar FIFO si el flag está activo
          if (!flags.autoConfirmBatches) {
            throw new Error(`El artículo ${itemInfo.name} requiere selección de lote/serie.`);
          }

          // Buscar lotes disponibles ordenados por caducidad (más próximos primero, nulls al final).
          // Si conocemos el almacén de origen, restringimos a lotes que REALMENTE tengan stock
          // ahí (itemBatchStocks) — antes se buscaba por cantidad GLOBAL, pudiendo asignar un
          // lote físicamente en otro almacén. Sin almacén conocido, caemos al comportamiento
          // anterior (búsqueda global) para no romper flujos sin almacén configurado.
          const availableBatches = targetWarehouse
            ? await tx
                .select({
                  id: schema.itemBatches.id,
                  batchNum: schema.itemBatches.batchNum,
                  expiryDate: schema.itemBatches.expiryDate,
                  quantity: schema.itemBatchStocks.quantity,
                })
                .from(schema.itemBatchStocks)
                .innerJoin(
                  schema.itemBatches,
                  and(
                    eq(schema.itemBatchStocks.itemId, schema.itemBatches.itemId),
                    eq(schema.itemBatchStocks.batchNum, schema.itemBatches.batchNum),
                  ),
                )
                .where(
                  and(
                    eq(schema.itemBatchStocks.itemId, line.itemId),
                    eq(schema.itemBatchStocks.warehouseId, targetWarehouse),
                    sql`${schema.itemBatchStocks.quantity} > 0`,
                  ),
                )
                .orderBy(sql`${schema.itemBatches.expiryDate} ASC NULLS LAST`)
            : await tx
                .select()
                .from(schema.itemBatches)
                .where(
                  sql`${schema.itemBatches.itemId} = ${line.itemId} AND ${schema.itemBatches.quantity} > 0`,
                )
                .orderBy(sql`${schema.itemBatches.expiryDate} ASC NULLS LAST`);

          let remaining = Number(line.quantity);
          for (const batch of availableBatches) {
            if (remaining <= 0) break;
            const take = Math.min(Number(batch.quantity), remaining);
            if (take <= 0) continue;

            await tx.insert(schema.salesDeliveryNoteLineBatches).values({
              id: crypto.randomUUID(),
              deliveryLineId: lineId,
              batchNum: batch.batchNum,
              quantity: take,
            });

            await tx
              .update(schema.itemBatches)
              .set({ quantity: sql`${schema.itemBatches.quantity} - ${take}` })
              .where(eq(schema.itemBatches.id, batch.id));

            if (targetWarehouse) {
              await tx
                .update(schema.itemBatchStocks)
                .set({
                  quantity: sql`${schema.itemBatchStocks.quantity} - ${take}`,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(schema.itemBatchStocks.itemId, line.itemId),
                    eq(schema.itemBatchStocks.batchNum, batch.batchNum),
                    eq(schema.itemBatchStocks.warehouseId, targetWarehouse),
                  ),
                );
            }

            remaining -= take;
          }

          if (remaining > 0) {
            throw new Error(
              `Stock de lotes insuficiente para el artículo ${itemInfo.name}. Faltan ${remaining} unidades.`,
            );
          }
        }

        // E. Lógica de Entrega Parcial en Pedido
        if (orderId && line.baseLine) {
          await tx
            .update(schema.salesOrderLines)
            .set({
              deliveredQty: sql`${schema.salesOrderLines.deliveredQty} + ${Number(line.quantity)}`,
            })
            .where(
              sql`${schema.salesOrderLines.orderId} = ${orderId} AND ${schema.salesOrderLines.lineNum} = ${line.baseLine}`,
            );
        }
      }

      // 4. Actualizar Totales
      const finalTotal = calculatedSubtotal + calculatedTaxTotal;
      await tx
        .update(schema.salesDeliveryNotes)
        .set({
          subtotal: String(calculatedSubtotal.toFixed(4)),
          taxTotal: String(calculatedTaxTotal.toFixed(4)),
          total: String(finalTotal.toFixed(4)),
          taxBreakdown: JSON.stringify(breakdownMap),
        })
        .where(eq(schema.salesDeliveryNotes.id, deliveryId));

      // 5. Estado del Pedido
      if (orderId) {
        const soLines = await tx
          .select()
          .from(schema.salesOrderLines)
          .where(eq(schema.salesOrderLines.orderId, orderId));
        const allDelivered = soLines.every(
          (l: any) => Number(l.deliveredQty) + 0.0001 >= Number(l.orderedQty),
        );
        const anyDelivered = soLines.some((l: any) => Number(l.deliveredQty) > 0);

        await tx
          .update(schema.salesOrders)
          .set({ status: allDelivered ? 'C' : anyDelivered ? 'P' : 'O' })
          .where(eq(schema.salesOrders.id, orderId));
      }

      return { id: deliveryId, docNum };
    });

    res.json(result);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'SalesDeliveryNote',
      entityId: result.id,
      action: 'CREATE',
      newValue: { docNum: result.docNum, partnerId: req.body.partnerId },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /:id/cancel — Cancela un albarán de venta, devolviendo stock y
// reabriendo el pedido origen. En modo logística integrada, también
// propaga la cancelación al Shipment activo si existe.
//
// Body: { reason?: string; force?: boolean }
//   - reason: motivo, se registra en audit + shipmentEvents.
//   - force:  obligatorio si el envío ya está en ruta (in_transit /
//             out_for_delivery). Protege contra cancelaciones accidentales
//             cuando el conductor ya está circulando con el paquete.
router.post('/:id/cancel', async (req: any, res) => {
  try {
    const body = req.body || {};

    // Pre-check del shipment vinculado — fuera de la transacción porque
    // un rechazo no debe dejar la tx abierta.
    const [activeShipment] = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(
        sql`${schema.shipments.sourceDocType} = 'SDN' AND ${schema.shipments.sourceDocId} = ${req.params.id} AND ${schema.shipments.preparationStatus} NOT IN ('cancelled','delivered','returned')`,
      );
    if (activeShipment) {
      if (activeShipment.preparationStatus === 'delivered') {
        return res.status(409).json({
          error:
            'El envío ya ha sido entregado. Usa "Devolver" en el envío en lugar de cancelar el albarán.',
        });
      }
      const inRoute = ['in_transit', 'out_for_delivery'].includes(activeShipment.preparationStatus);
      if (inRoute && !body.force) {
        return res.status(409).json({
          error:
            'El envío está en ruta. Confirma con force=true para cancelarlo — el conductor debe volver sin entregar.',
          requiresForce: true,
          shipmentId: activeShipment.id,
          shipmentStatus: activeShipment.preparationStatus,
        });
      }
    }

    const result = await req.tenantClient.transaction(async (tx: any) => {
      const [header] = await tx
        .select()
        .from(schema.salesDeliveryNotes)
        .where(eq(schema.salesDeliveryNotes.id, req.params.id));
      if (!header) throw new Error('Albarán no encontrado');
      if (header.status === 'X') throw new Error('El albarán ya está cancelado');
      if (header.status === 'C') throw new Error('No se puede cancelar un albarán ya facturado');

      const lines = await tx
        .select()
        .from(schema.salesDeliveryNoteLines)
        .where(eq(schema.salesDeliveryNoteLines.deliveryId, req.params.id));

      for (const line of lines) {
        const baseQty = Number(line.quantity) * Number(line.uomFactor || 1);

        // A. Devolver stock global (en UoM base)
        await tx
          .update(schema.items)
          .set({ stock: sql`${schema.items.stock} + ${baseQty}` })
          .where(eq(schema.items.id, line.itemId));

        // B. Devolver stock por almacén / zona (en UoM base)
        if (line.warehouseId) {
          await tx
            .update(schema.itemWarehouseStocks)
            .set({
              stock: sql`${schema.itemWarehouseStocks.stock} + ${baseQty}`,
              updatedAt: new Date(),
            })
            .where(
              sql`${schema.itemWarehouseStocks.itemId} = ${line.itemId} AND ${schema.itemWarehouseStocks.warehouseId} = ${line.warehouseId}`,
            );

          if (line.zoneId) {
            await tx
              .update(schema.itemZoneStocks)
              .set({
                stock: sql`${schema.itemZoneStocks.stock} + ${baseQty}`,
                updatedAt: new Date(),
              })
              .where(
                sql`${schema.itemZoneStocks.itemId} = ${line.itemId} AND ${schema.itemZoneStocks.warehouseId} = ${line.warehouseId} AND ${schema.itemZoneStocks.zoneId} = ${line.zoneId}`,
              );
          }
        }

        // C. Devolver lotes/series
        const batches = await tx
          .select()
          .from(schema.salesDeliveryNoteLineBatches)
          .where(eq(schema.salesDeliveryNoteLineBatches.deliveryLineId, line.id));
        for (const bd of batches) {
          await tx
            .update(schema.itemBatches)
            .set({ quantity: sql`${schema.itemBatches.quantity} + ${Number(bd.quantity)}` })
            .where(
              sql`${schema.itemBatches.itemId} = ${line.itemId} AND ${schema.itemBatches.batchNum} = ${bd.batchNum}`,
            );
          if (line.warehouseId) {
            await tx
              .update(schema.itemBatchStocks)
              .set({
                quantity: sql`${schema.itemBatchStocks.quantity} + ${Number(bd.quantity)}`,
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

        // D. Revertir la cantidad entregada del pedido origen
        if (header.orderId && line.baseLine) {
          await tx
            .update(schema.salesOrderLines)
            .set({
              deliveredQty: sql`${schema.salesOrderLines.deliveredQty} - ${Number(line.quantity)}`,
            })
            .where(
              sql`${schema.salesOrderLines.orderId} = ${header.orderId} AND ${schema.salesOrderLines.lineNum} = ${line.baseLine}`,
            );
        }
      }

      // 2. Marcar como cancelado
      await tx
        .update(schema.salesDeliveryNotes)
        .set({ status: 'X' })
        .where(eq(schema.salesDeliveryNotes.id, req.params.id));

      // 2b. Propagar al shipment vinculado (si existe y sigue vivo) +
      // cancelar picking tasks asociadas. La cancelación fiscal del
      // albarán debe parar también la operación logística.
      if (activeShipment) {
        await tx
          .update(schema.shipments)
          .set({
            status: 'cancelled',
            preparationStatus: 'cancelled',
            updatedAt: new Date(),
          })
          .where(eq(schema.shipments.id, activeShipment.id));

        await tx.insert(schema.shipmentEvents).values({
          id: crypto.randomUUID(),
          shipmentId: activeShipment.id,
          kind: 'status_change',
          status: 'cancelled',
          description: body.reason
            ? `Cancelado al anular el albarán: ${body.reason}`
            : 'Cancelado al anular el albarán de venta',
        });

        // Picking tasks pendientes → cancelled (el almacén deja de
        // procesarlas).
        try {
          await tx
            .update(schema.pickingTasks)
            .set({ status: 'cancelled' })
            .where(
              sql`${schema.pickingTasks.shipmentId} = ${activeShipment.id} AND ${schema.pickingTasks.status} IN ('pending','in_progress')`,
            );
        } catch {
          /* tabla opcional, si no existe pickingTasks no rompemos */
        }
      }

      // 3. Recalcular estado del pedido origen
      if (header.orderId) {
        const soLines = await tx
          .select()
          .from(schema.salesOrderLines)
          .where(eq(schema.salesOrderLines.orderId, header.orderId));
        const anyDelivered = soLines.some((l: any) => Number(l.deliveredQty) > 0);
        await tx
          .update(schema.salesOrders)
          .set({ status: anyDelivered ? 'P' : 'O' })
          .where(eq(schema.salesOrders.id, header.orderId));
      }

      return { success: true };
    });

    res.json({
      ...result,
      shipmentCancelled: !!activeShipment,
      shipmentId: activeShipment?.id || null,
    });

    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'SalesDeliveryNote',
      entityId: req.params.id,
      action: 'DELETE',
      newValue: { reason: body.reason || null, force: !!body.force },
    });

    // Side-effects fire-and-forget: no bloquean la respuesta al cliente.
    dispatchEvent(req.tenantId, 'sales_delivery_note.cancelled', {
      id: req.params.id,
      reason: body.reason || null,
      shipmentId: activeShipment?.id || null,
    }).catch(() => {});

    if (activeShipment) {
      // Deducir la URL pública desde el Origin del request (sin tocar tenant
      // config para no hacer esta ruta async).
      const origin = (req.headers?.origin as string | undefined) || '';
      const baseUrl =
        process.env.PUBLIC_BASE_URL?.trim() || origin || `${req.protocol}://${req.get('host')}`;
      notifyShipmentStageChange(
        req.tenantClient,
        req.tenantId,
        activeShipment.id,
        'cancelled' as any,
        baseUrl.replace(/\/$/, ''),
      ).catch(() => {});
      dispatchEvent(req.tenantId, 'shipment.cancelled', {
        id: activeShipment.id,
        reason: body.reason || null,
        cascadedFrom: 'sales_delivery_note',
      }).catch(() => {});
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
