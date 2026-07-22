import { and, eq, sql } from 'drizzle-orm';
import { DocStatus } from '@openfactu/common';

interface FulfillmentLine {
  baseLine?: number;
  quantity: number | string;
}

/**
 * Incrementa `qtyField` (p. ej. `deliveredQty` en SDN→SO, `receivedQty` en
 * PDN→PO) en las líneas del pedido origen referenciadas por `baseLine`, y
 * recalcula el estado de la cabecera del pedido (Abierto/Parcial/Cerrado)
 * según cuánto se ha cumplido — mismo algoritmo para venta y compra, solo
 * cambian las tablas involucradas.
 */
export async function applyBaseOrderFulfillment(
  tx: any,
  opts: {
    orderLineTable: any;
    orderHeaderTable: any;
    qtyField: string;
    orderId: string | undefined | null;
    lines: FulfillmentLine[];
    /** 1 (por defecto) al crear el documento derivado; -1 al cancelarlo. */
    sign?: 1 | -1;
  },
) {
  const { orderLineTable, orderHeaderTable, qtyField, orderId, lines, sign = 1 } = opts;
  if (!orderId) return;

  for (const line of lines) {
    if (!line.baseLine) continue;
    const delta = sign * Number(line.quantity);
    await tx
      .update(orderLineTable)
      .set({ [qtyField]: sql`${orderLineTable[qtyField]} + ${delta}` })
      .where(and(eq(orderLineTable.orderId, orderId), eq(orderLineTable.lineNum, line.baseLine)));
  }

  const orderLines = await tx
    .select()
    .from(orderLineTable)
    .where(eq(orderLineTable.orderId, orderId));
  const allDone = orderLines.every(
    (l: any) => Number(l[qtyField]) + 0.0001 >= Number(l.orderedQty),
  );
  const anyDone = orderLines.some((l: any) => Number(l[qtyField]) > 0);

  await tx
    .update(orderHeaderTable)
    .set({ status: allDone ? DocStatus.Closed : anyDone ? DocStatus.Partial : DocStatus.Open })
    .where(eq(orderHeaderTable.id, orderId));
}
