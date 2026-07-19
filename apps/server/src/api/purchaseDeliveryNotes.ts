import { Router } from 'express';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import crypto from 'crypto';
import { renderDocumentPdf } from '../core/documents/renderDocumentPdf';
import { logAudit } from '../utils/audit';
import { notifyShipmentStageChange } from '../core/logistics/shipmentNotifications';
import { dispatchEvent } from '../core/webhooks/WebhookQueue';

const router = Router();

// GET all delivery notes
router.get('/', async (req: any, res) => {
  try {
    const results = await req.tenantClient
      .select({
        id: schema.purchaseDeliveryNotes.id,
        docNum: schema.purchaseDeliveryNotes.docNum,
        seriesPrefix: schema.documentSeries.prefix,
        numberingMode: schema.documentSeries.numberingMode,
        periodCode: schema.accountingPeriods.code,
        date: schema.purchaseDeliveryNotes.date,
        partnerId: schema.purchaseDeliveryNotes.partnerId,
        total: schema.purchaseDeliveryNotes.total,
        status: schema.purchaseDeliveryNotes.status,
        orderId: schema.purchaseDeliveryNotes.orderId,
        orderDocNum: schema.purchaseOrders.docNum,
        orderPrefix: sql`(SELECT "prefix" FROM "DocumentSeries" WHERE id = ${schema.purchaseOrders.seriesId})`,
      })
      .from(schema.purchaseDeliveryNotes)
      .leftJoin(
        schema.purchaseOrders,
        eq(schema.purchaseDeliveryNotes.orderId, schema.purchaseOrders.id),
      )
      .leftJoin(
        schema.documentSeries,
        eq(schema.purchaseDeliveryNotes.seriesId, schema.documentSeries.id),
      )
      .leftJoin(
        schema.accountingPeriods,
        eq(schema.purchaseDeliveryNotes.periodId, schema.accountingPeriods.id),
      )
      .orderBy(sql`${schema.purchaseDeliveryNotes.date} DESC`);

    // Idéntico al SDN: enriquecer con info del shipment de recepción vivo.
    const ids = results.map((r: any) => r.id);
    let shipmentMap = new Map<string, string>();
    if (ids.length > 0) {
      const active = await req.tenantClient
        .select({
          id: schema.shipments.id,
          sourceDocId: schema.shipments.sourceDocId,
        })
        .from(schema.shipments)
        .where(
          and(
            eq(schema.shipments.sourceDocType, 'PDN'),
            inArray(schema.shipments.sourceDocId, ids),
            notInArray(schema.shipments.preparationStatus, [
              'cancelled',
              'delivered',
              'received',
              'returned',
            ]),
          ),
        );
      for (const s of active as any[]) {
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
        header: schema.purchaseDeliveryNotes,
        seriesPrefix: schema.documentSeries.prefix,
        numberingMode: schema.documentSeries.numberingMode,
        periodCode: schema.accountingPeriods.code,
        orderDocNum: schema.purchaseOrders.docNum,
        orderPrefix: sql`(SELECT "prefix" FROM "DocumentSeries" WHERE id = ${schema.purchaseOrders.seriesId})`,
      })
      .from(schema.purchaseDeliveryNotes)
      .leftJoin(
        schema.documentSeries,
        eq(schema.purchaseDeliveryNotes.seriesId, schema.documentSeries.id),
      )
      .leftJoin(
        schema.accountingPeriods,
        eq(schema.purchaseDeliveryNotes.periodId, schema.accountingPeriods.id),
      )
      .leftJoin(
        schema.purchaseOrders,
        eq(schema.purchaseDeliveryNotes.orderId, schema.purchaseOrders.id),
      )
      .where(eq(schema.purchaseDeliveryNotes.id, req.params.id));

    if (!header) return res.status(404).json({ error: 'No encontrado' });

    // Flatten header for easier use
    const headerData = {
      ...header.header,
      seriesPrefix: header.seriesPrefix,
      numberingMode: header.numberingMode,
      periodCode: header.periodCode,
      orderDocNum: header.orderDocNum,
      orderPrefix: header.orderPrefix,
    };

    const lines = await req.tenantClient
      .select()
      .from(schema.purchaseDeliveryNoteLines)
      .where(eq(schema.purchaseDeliveryNoteLines.deliveryId, req.params.id));

    // Get batches for each line
    const linesWithBatches = await Promise.all(
      lines.map(async (line: any) => {
        const batches = await req.tenantClient
          .select()
          .from(schema.purchaseDeliveryNoteLineBatches)
          .where(eq(schema.purchaseDeliveryNoteLineBatches.deliveryLineId, line.id));

        return {
          ...line,
          batchDetails: batches.map((b: any) => ({
            batchNum: b.batchNum,
            quantity: Number(b.quantity),
            expiryDate: b.expiryDate,
          })),
        };
      }),
    );

    res.json({ ...headerData, lines: linesWithBatches });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /:id/pdf
router.get('/:id/pdf', async (req: any, res) => {
  try {
    await renderDocumentPdf(
      'PDN',
      req.params.id,
      req.query.templateId as string | undefined,
      req.tenantClient,
      res,
      req.tenantId,
    );
  } catch (error: any) {
    console.error('[PurchaseDeliveryNote PDF] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST new delivery note (Entry of Goods)
router.post('/', async (req: any, res) => {
  const { seriesId, periodId, partnerId, orderId, date, lines, warehouseId, internalOrderId } =
    req.body;

  try {
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
          .select({ id: schema.purchaseDeliveryNotes.id })
          .from(schema.purchaseDeliveryNotes)
          .where(
            and(
              eq(schema.purchaseDeliveryNotes.seriesId, seriesId),
              eq(schema.purchaseDeliveryNotes.docNum, docNum),
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

      // Obtener tasas de impuestos para cálculos
      const allTaxGroups = await tx.select().from(schema.taxGroups);
      const taxRateMap = allTaxGroups.reduce((acc: any, curr: any) => {
        acc[curr.id] = Number(curr.rate);
        return acc;
      }, {});

      // 2. Insertar Cabecera Temporal
      const [header] = await tx
        .insert(schema.purchaseDeliveryNotes)
        .values({
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
        })
        .returning();

      // 2.5 Consultar flag de forzar zonas de almacén (nueva clave + fallback legacy)
      const [cfgNew] = await tx
        .select()
        .from(schema.systemConfigs)
        .where(eq(schema.systemConfigs.key, 'flags_enforce_warehouse_zones'));
      const [cfgLegacy] = await tx
        .select()
        .from(schema.systemConfigs)
        .where(eq(schema.systemConfigs.key, 'enforceWarehouseZones'));
      const enforceZones = cfgNew?.value === 'true' || cfgLegacy?.value === 'true';

      // 3. Procesar Líneas y Stock
      for (const line of lines) {
        // Validation: Verify if item requires batches
        const [itemInfo] = await tx
          .select()
          .from(schema.items)
          .where(eq(schema.items.id, line.itemId));
        if (!itemInfo) throw new Error(`Artículo ${line.itemId} no encontrado`);

        const uomFactor = Number(line.uomFactor || 1);
        const baseQty = Number(line.quantity) * uomFactor;

        if (itemInfo.manageBy !== 'N') {
          const totalBatched = (line.batchDetails || []).reduce(
            (acc: number, curr: any) => acc + Number(curr.quantity),
            0,
          );
          if (totalBatched < Number(line.quantity)) {
            throw new Error(
              `El artículo ${itemInfo.name} requiere trazabilidad. Cantidad pendiente: ${Number(line.quantity) - totalBatched}`,
            );
          }
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

        // Breakdown logic
        const rateKey = String(taxRate);
        if (!breakdownMap[rateKey]) breakdownMap[rateKey] = { base: 0, tax: 0 };
        breakdownMap[rateKey].base += lineSubtotal;
        breakdownMap[rateKey].tax += lineTax;

        const lineId = crypto.randomUUID();
        const targetWarehouse = line.warehouseId || warehouseId;

        if (enforceZones && !line.zoneId && targetWarehouse) {
          const zones = await tx
            .select()
            .from(schema.warehouseZones)
            .where(eq(schema.warehouseZones.warehouseId, targetWarehouse));
          if (zones.length > 0) {
            throw new Error(
              `La configuración del almacén exige indicar una Ubicación (Zona) para el artículo ${itemInfo.name}.`,
            );
          }
        }

        // A. Insertar Línea de Albarán
        await tx.insert(schema.purchaseDeliveryNoteLines).values({
          id: lineId,
          deliveryId,
          lineNum: line.lineNum || lines.indexOf(line) + 1,
          itemId: line.itemId,
          warehouseId: targetWarehouse,
          zoneId: line.zoneId || null,
          batchNum: line.batchNum || null,
          quantity: String(qty),
          uomId: line.uomId || null,
          uomFactor: String(uomFactor),
          price: String(price),
          taxGroupId: line.taxGroupId || null,
          lineTotal: String(lineSubtotal + lineTax),
          baseLine: line.baseLine || null,
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

        // B. Incrementar Stock Global
        await tx
          .update(schema.items)
          .set({ stock: sql`${schema.items.stock} + ${baseQty}` })
          .where(eq(schema.items.id, line.itemId));

        // C. Incrementar Stock por Almacén
        if (targetWarehouse) {
          const [existing] = await tx
            .select()
            .from(schema.itemWarehouseStocks)
            .where(
              sql`${schema.itemWarehouseStocks.itemId} = ${line.itemId} AND ${schema.itemWarehouseStocks.warehouseId} = ${targetWarehouse}`,
            );

          if (existing) {
            await tx
              .update(schema.itemWarehouseStocks)
              .set({
                stock: sql`${schema.itemWarehouseStocks.stock} + ${baseQty}`,
                updatedAt: new Date(),
              })
              .where(
                sql`${schema.itemWarehouseStocks.itemId} = ${line.itemId} AND ${schema.itemWarehouseStocks.warehouseId} = ${targetWarehouse}`,
              );
          } else {
            await tx.insert(schema.itemWarehouseStocks).values({
              itemId: line.itemId,
              warehouseId: targetWarehouse,
              stock: baseQty,
              updatedAt: new Date(),
            });
          }

          // C.2 Incrementar Stock por Ubicación (Zone)
          if (line.zoneId) {
            const [existingZone] = await tx
              .select()
              .from(schema.itemZoneStocks)
              .where(
                sql`${schema.itemZoneStocks.itemId} = ${line.itemId} AND ${schema.itemZoneStocks.warehouseId} = ${targetWarehouse} AND ${schema.itemZoneStocks.zoneId} = ${line.zoneId}`,
              );

            if (existingZone) {
              await tx
                .update(schema.itemZoneStocks)
                .set({
                  stock: sql`${schema.itemZoneStocks.stock} + ${baseQty}`,
                  updatedAt: new Date(),
                })
                .where(
                  sql`${schema.itemZoneStocks.itemId} = ${line.itemId} AND ${schema.itemZoneStocks.warehouseId} = ${targetWarehouse} AND ${schema.itemZoneStocks.zoneId} = ${line.zoneId}`,
                );
            } else {
              await tx.insert(schema.itemZoneStocks).values({
                itemId: line.itemId,
                warehouseId: targetWarehouse,
                zoneId: line.zoneId,
                stock: baseQty,
                updatedAt: new Date(),
              });
            }
          }
        }

        // D. Gestionar LOTES / SERIES (Detalle trazabilidad)
        if (line.batchDetails && Array.isArray(line.batchDetails)) {
          for (const bd of line.batchDetails) {
            const batchId = crypto.randomUUID();
            await tx.insert(schema.purchaseDeliveryNoteLineBatches).values({
              id: batchId,
              deliveryLineId: lineId,
              batchNum: bd.batchNum,
              quantity: bd.quantity,
              expiryDate: bd.expiryDate ? new Date(bd.expiryDate) : null,
            });

            // Incrementar stock del lote específico en maestros
            const [existingBatch] = await tx
              .select()
              .from(schema.itemBatches)
              .where(
                sql`${schema.itemBatches.itemId} = ${line.itemId} AND ${schema.itemBatches.batchNum} = ${bd.batchNum}`,
              );

            if (itemInfo.manageBy === 'S') {
              if (existingBatch && Number(existingBatch.quantity) > 0) {
                throw new Error(
                  `La serie ${bd.batchNum} ya existe en stock para el artículo ${itemInfo.name}`,
                );
              }
              if (Number(bd.quantity) !== 1) {
                throw new Error(
                  `Un artículo gestionado por Serie solo puede tener cantidad 1 por serie. Serie: ${bd.batchNum}`,
                );
              }
            }

            if (existingBatch) {
              await tx
                .update(schema.itemBatches)
                .set({ quantity: sql`${schema.itemBatches.quantity} + ${Number(bd.quantity)}` })
                .where(eq(schema.itemBatches.id, existingBatch.id));
            } else {
              await tx.insert(schema.itemBatches).values({
                id: crypto.randomUUID(),
                itemId: line.itemId,
                batchNum: bd.batchNum,
                quantity: Number(bd.quantity),
                expiryDate: bd.expiryDate ? new Date(bd.expiryDate) : null,
              });
            }

            // D.2 Incrementar stock del lote POR ALMACÉN (trazabilidad).
            if (targetWarehouse) {
              const [existingBatchStock] = await tx
                .select()
                .from(schema.itemBatchStocks)
                .where(
                  and(
                    eq(schema.itemBatchStocks.itemId, line.itemId),
                    eq(schema.itemBatchStocks.batchNum, bd.batchNum),
                    eq(schema.itemBatchStocks.warehouseId, targetWarehouse),
                  ),
                );
              if (existingBatchStock) {
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
                      eq(schema.itemBatchStocks.warehouseId, targetWarehouse),
                    ),
                  );
              } else {
                await tx.insert(schema.itemBatchStocks).values({
                  itemId: line.itemId,
                  batchNum: bd.batchNum,
                  warehouseId: targetWarehouse,
                  quantity: Number(bd.quantity),
                  updatedAt: new Date(),
                });
              }
            }
          }
        }

        // E. Lógica de Recepción Parcial en Pedido (si existe orderId)
        if (orderId && line.baseLine) {
          await tx
            .update(schema.purchaseOrderLines)
            .set({
              receivedQty: sql`${schema.purchaseOrderLines.receivedQty} + ${Number(line.quantity)}`,
            })
            .where(
              sql`${schema.purchaseOrderLines.orderId} = ${orderId} AND ${schema.purchaseOrderLines.lineNum} = ${line.baseLine}`,
            );
        }
      }

      // 4. Actualizar Total en Cabecera
      const finalTotal = calculatedSubtotal + calculatedTaxTotal;
      await tx
        .update(schema.purchaseDeliveryNotes)
        .set({
          subtotal: String(calculatedSubtotal.toFixed(4)),
          taxTotal: String(calculatedTaxTotal.toFixed(4)),
          total: String(finalTotal.toFixed(4)),
          taxBreakdown: JSON.stringify(breakdownMap),
        })
        .where(eq(schema.purchaseDeliveryNotes.id, deliveryId));

      // 5. Actualizar estado del Pedido (si corresponde)
      if (orderId) {
        const poLines = await tx
          .select()
          .from(schema.purchaseOrderLines)
          .where(eq(schema.purchaseOrderLines.orderId, orderId));
        // Usar un pequeño margen de error para comparaciones decimales
        const allReceived = poLines.every(
          (l: any) => Number(l.receivedQty) + 0.0001 >= Number(l.orderedQty),
        );
        const anyReceived = poLines.some((l: any) => Number(l.receivedQty) > 0);

        await tx
          .update(schema.purchaseOrders)
          .set({ status: allReceived ? 'C' : anyReceived ? 'P' : 'O' })
          .where(eq(schema.purchaseOrders.id, orderId));
      }

      return { header, docNum };
    });

    res.json(result);
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'PurchaseDeliveryNote',
      entityId: result.header?.id,
      action: 'CREATE',
      newValue: { docNum: result.docNum, partnerId: req.body.partnerId },
    });
  } catch (error: any) {
    console.error('Error en Albarán de Compra:', error);
    res.status(500).json({ error: error.message });
  }
});

async function cancelPurchaseDeliveryNote(req: any, res: any) {
  try {
    const body = req.body || {};

    // Pre-check del shipment de recepción vinculado.
    const [activeShipment] = await req.tenantClient
      .select()
      .from(schema.shipments)
      .where(
        sql`${schema.shipments.sourceDocType} = 'PDN' AND ${schema.shipments.sourceDocId} = ${req.params.id} AND ${schema.shipments.preparationStatus} NOT IN ('cancelled','received','delivered','returned')`,
      );
    if (activeShipment) {
      if (['received', 'delivered'].includes(activeShipment.preparationStatus)) {
        return res.status(409).json({
          error: 'La recepción ya está cerrada. No se puede cancelar el albarán de compra.',
        });
      }
      const inProgress = ['in_transit', 'out_for_delivery', 'receiving'].includes(
        activeShipment.preparationStatus,
      );
      if (inProgress && !body.force) {
        return res.status(409).json({
          error: 'Recepción en curso. Confirma con force=true para cancelar.',
          requiresForce: true,
          shipmentId: activeShipment.id,
          shipmentStatus: activeShipment.preparationStatus,
        });
      }
    }

    const result = await req.tenantClient.transaction(async (tx: any) => {
      // 1. Obtener cabecera y líneas para revertir
      const [header] = await tx
        .select()
        .from(schema.purchaseDeliveryNotes)
        .where(eq(schema.purchaseDeliveryNotes.id, req.params.id));
      if (!header) throw new Error('Albarán no encontrado');
      if (header.status === 'X') throw new Error('El albarán ya está cancelado');
      if (header.status === 'C') throw new Error('No se puede cancelar un albarán ya facturado');

      const lines = await tx
        .select()
        .from(schema.purchaseDeliveryNoteLines)
        .where(eq(schema.purchaseDeliveryNoteLines.deliveryId, req.params.id));

      for (const line of lines) {
        const baseQty = Number(line.quantity) * Number(line.uomFactor || 1);

        // A. Revertir Stock Global
        await tx
          .update(schema.items)
          .set({ stock: sql`${schema.items.stock} - ${baseQty}` })
          .where(eq(schema.items.id, line.itemId));

        // B. Revertir Stock por Almacén
        if (line.warehouseId) {
          await tx
            .update(schema.itemWarehouseStocks)
            .set({
              stock: sql`${schema.itemWarehouseStocks.stock} - ${baseQty}`,
              updatedAt: new Date(),
            })
            .where(
              sql`${schema.itemWarehouseStocks.itemId} = ${line.itemId} AND ${schema.itemWarehouseStocks.warehouseId} = ${line.warehouseId}`,
            );

          if (line.zoneId) {
            await tx
              .update(schema.itemZoneStocks)
              .set({
                stock: sql`${schema.itemZoneStocks.stock} - ${baseQty}`,
                updatedAt: new Date(),
              })
              .where(
                sql`${schema.itemZoneStocks.itemId} = ${line.itemId} AND ${schema.itemZoneStocks.warehouseId} = ${line.warehouseId} AND ${schema.itemZoneStocks.zoneId} = ${line.zoneId}`,
              );
          }
        }

        // C. Revertir Lotes
        const batches = await tx
          .select()
          .from(schema.purchaseDeliveryNoteLineBatches)
          .where(eq(schema.purchaseDeliveryNoteLineBatches.deliveryLineId, line.id));
        for (const bd of batches) {
          await tx
            .update(schema.itemBatches)
            .set({ quantity: sql`${schema.itemBatches.quantity} - ${Number(bd.quantity)}` })
            .where(
              sql`${schema.itemBatches.itemId} = ${line.itemId} AND ${schema.itemBatches.batchNum} = ${bd.batchNum}`,
            );
          if (line.warehouseId) {
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
                  eq(schema.itemBatchStocks.warehouseId, line.warehouseId),
                ),
              );
          }
        }

        // D. Revertir Pedido (si existe)
        if (header.orderId && line.baseLine) {
          await tx
            .update(schema.purchaseOrderLines)
            .set({
              receivedQty: sql`${schema.purchaseOrderLines.receivedQty} - ${Number(line.quantity)}`,
            })
            .where(
              sql`${schema.purchaseOrderLines.orderId} = ${header.orderId} AND ${schema.purchaseOrderLines.lineNum} = ${line.baseLine}`,
            );
        }
      }

      // 2. Marcar como cancelado
      await tx
        .update(schema.purchaseDeliveryNotes)
        .set({ status: 'X' })
        .where(eq(schema.purchaseDeliveryNotes.id, req.params.id));

      // 2b. Cascada al shipment de recepción + picking tasks asociados.
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
            : 'Cancelado al anular el albarán de compra',
        });
        try {
          await tx
            .update(schema.pickingTasks)
            .set({ status: 'cancelled' })
            .where(
              sql`${schema.pickingTasks.shipmentId} = ${activeShipment.id} AND ${schema.pickingTasks.status} IN ('pending','in_progress')`,
            );
        } catch {
          /* opcional */
        }
      }

      // 3. Recalcular estado del pedido
      if (header.orderId) {
        const poLines = await tx
          .select()
          .from(schema.purchaseOrderLines)
          .where(eq(schema.purchaseOrderLines.orderId, header.orderId));
        const anyReceived = poLines.some((l: any) => Number(l.receivedQty) > 0);

        await tx
          .update(schema.purchaseOrders)
          .set({ status: anyReceived ? 'P' : 'O' })
          .where(eq(schema.purchaseOrders.id, header.orderId));
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
      entityType: 'PurchaseDeliveryNote',
      entityId: req.params.id,
      action: 'DELETE',
      newValue: { reason: body.reason || null, force: !!body.force },
    });

    dispatchEvent(req.tenantId, 'purchase_delivery_note.cancelled', {
      id: req.params.id,
      reason: body.reason || null,
      shipmentId: activeShipment?.id || null,
    }).catch(() => {});
    if (activeShipment) {
      dispatchEvent(req.tenantId, 'shipment.cancelled', {
        id: activeShipment.id,
        reason: body.reason || null,
        cascadedFrom: 'purchase_delivery_note',
      }).catch(() => {});
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

router.delete('/:id', cancelPurchaseDeliveryNote);
router.post('/:id/cancel', cancelPurchaseDeliveryNote);

export default router;
