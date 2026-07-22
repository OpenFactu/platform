import * as schema from '../../../../db/schema';
import type {
  DocumentHooks,
  DocumentHookContext,
  DocumentCancelHookContext,
} from '../../DocumentEngine';
import { applyBaseOrderFulfillment } from '../../baseOrderFulfillment';
import { assertSerialUniqueness, assertZoneRequired } from '../shared';

/** Fulfillment parcial del Pedido de Compra origen (si la línea viene de uno). */
async function afterLinesProcessed(ctx: DocumentHookContext) {
  const { tx, request } = ctx;
  await applyBaseOrderFulfillment(tx, {
    orderLineTable: schema.purchaseOrderLines,
    orderHeaderTable: schema.purchaseOrders,
    qtyField: 'receivedQty',
    orderId: (request as any).orderId,
    lines: request.lines,
  });
}

/** Revierte el fulfillment parcial del Pedido de Compra origen al cancelar el albarán. */
async function afterCancel(ctx: DocumentCancelHookContext) {
  const { tx, header, lines } = ctx;
  await applyBaseOrderFulfillment(tx, {
    orderLineTable: schema.purchaseOrderLines,
    orderHeaderTable: schema.purchaseOrders,
    qtyField: 'receivedQty',
    orderId: header.orderId,
    lines,
    sign: -1,
  });
}

export const purchaseDeliveryNoteHooks: DocumentHooks = {
  // Entrada de stock: zona obligatoria + unicidad de serie, compartidas con
  // la Factura de Compra directa (ver hooks/shared.ts).
  beforeLine: assertZoneRequired,
  beforeBatchDetail: assertSerialUniqueness,
  afterLinesProcessed,
  afterCancel,
};
