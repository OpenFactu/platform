import * as schema from '../../../../db/schema';
import type {
  DocumentHooks,
  DocumentHookContext,
  DocumentCancelHookContext,
} from '../../DocumentEngine';
import { applyBaseOrderFulfillment } from '../../baseOrderFulfillment';
import { assertStockAvailable, resolveBatchDetailsFifo } from '../shared';

/** Fulfillment parcial del Pedido de Venta origen (si la línea viene de uno). */
async function afterLinesProcessed(ctx: DocumentHookContext) {
  const { tx, request } = ctx;
  await applyBaseOrderFulfillment(tx, {
    orderLineTable: schema.salesOrderLines,
    orderHeaderTable: schema.salesOrders,
    qtyField: 'deliveredQty',
    orderId: (request as any).orderId,
    lines: request.lines,
  });
}

/** Revierte el fulfillment parcial del Pedido de Venta origen al cancelar el albarán. */
async function afterCancel(ctx: DocumentCancelHookContext) {
  const { tx, header, lines } = ctx;
  await applyBaseOrderFulfillment(tx, {
    orderLineTable: schema.salesOrderLines,
    orderHeaderTable: schema.salesOrders,
    qtyField: 'deliveredQty',
    orderId: header.orderId,
    lines,
    sign: -1,
  });
}

export const salesDeliveryNoteHooks: DocumentHooks = {
  // Salida de stock: validación de stock global + auto-FIFO de lotes,
  // compartidas con la Factura de Venta directa (ver hooks/shared.ts).
  resolveBatchDetails: resolveBatchDetailsFifo,
  beforeLine: assertStockAvailable,
  afterLinesProcessed,
  afterCancel,
};
